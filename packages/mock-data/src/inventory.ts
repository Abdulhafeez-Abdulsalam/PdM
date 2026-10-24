/**
 * Spare parts (Phase 4, chunk 2): one part per kind of equipment × failure mode (the same parts
 * the PM plans name), stocked at each site that has that equipment.
 *
 * Stock control, the textbook way:
 *   annual demand D   = assets × (failures a year + PM replacements a year) × parts per job
 *   lead-time demand  = D × lead time ÷ 365
 *   reorder point     = lead-time demand + z × √(lead-time demand)   (safety stock; z by criticality)
 *   max               = reorder point + a quarter's demand            (the order quantity)
 * Starting stock and a few open orders are seeded per line. In the session, orders placed in
 * the app arrive after their lead time, and closed-out work orders that replaced parts take
 * them out of stock.
 *
 * The forecast: parts PM plans will use in the next 90 days (pm.ts) and parts that open
 * failure predictions will need by their median remaining life.
 */
import {
  DEMAND_HORIZON_DAYS,
  FailureModeCode,
  type InventoryOverview,
  type InventoryRequest,
  type Part,
  type PartCriticality,
  type PartDetail,
  type PlaceOrderRequest,
  type DemandItem,
  type PurchaseOrder,
  type StockLine,
  type StockStatus,
  type WorkOrder,
  type WorkOrderParts,
} from "@pdm/contracts";
import { ASSET_CLASSES } from "./catalog/asset-catalog";
import { DAY, HOUR, iso } from "./clock";
import { ApiFailure } from "./errors";
import { partsFor, pmPartDemand, pmPlans, type Ctx2 } from "./pm";
import { hashNoise, hashString } from "./random";
import { LIVES } from "./reliability";
import type { Snapshot } from "./snapshot";

export interface InventoryCtx extends Ctx2 {
  snapshot: () => Snapshot;
}

const Z: Record<PartCriticality, number> = { vital: 2.05, essential: 1.65, desirable: 1 };
const DONE: ReadonlySet<string> = new Set(["completed", "verified", "closed"]);
/** Close-outs with these remedies used new parts. */
const USES_PARTS: ReadonlySet<string> = new Set(["replace", "overhaul", "refit", "combination"]);
const STATUS_ORDER: Record<StockStatus, number> = { short: 0, reorder: 1, ok: 2, excess: 3 };

interface Seeded {
  part: Part;
  siteId: string;
  qtyPerJob: number;
  onHand: number;
  reorderPoint: number;
  max: number;
}

export class InventoryStore {
  private catalog: Map<string, Part> | null = null;
  private seeded: Seeded[] | null = null;
  private readonly orders: PurchaseOrder[] = [];
  private nextPo = 1;

  /** Every part, built once. */
  parts(ctx: InventoryCtx): Map<string, Part> {
    if (this.catalog) return this.catalog;
    const classes = new Set([...ctx.world.assets.values()].map((a) => a.data.assetClass));
    const catalog = new Map<string, Part>();
    for (const cls of [...classes].sort()) {
      const info = ASSET_CLASSES[cls];
      for (const life of LIVES[cls] ?? []) {
        for (const p of partsFor(cls, life.mode)) {
          if (catalog.has(p.partNumber)) continue;
          const seed = hashString(p.partNumber);
          catalog.set(p.partNumber, {
            partNumber: p.partNumber,
            description: p.description,
            assetClass: cls,
            mode: life.mode,
            unitCost: Math.max(40, Math.round((info.failureCost * 0.015 * (0.6 + 0.8 * hashNoise(seed, 1))) / 10) * 10),
            currency: "USD",
            leadTimeDays: Math.round(14 + 106 * hashNoise(seed, 2)),
            criticality: info.criticality[1] >= 4 ? "vital" : info.criticality[1] === 3 ? "essential" : "desirable",
          });
        }
      }
    }
    this.catalog = catalog;
    return catalog;
  }

  /** Starting stock for every part at every site with that equipment. */
  private lines(ctx: InventoryCtx): Seeded[] {
    if (this.seeded) return this.seeded;
    const plans = pmPlans(ctx);
    const out: Seeded[] = [];
    for (const part of this.parts(ctx).values()) {
      const life = LIVES[part.assetClass]?.find((l) => l.mode === part.mode);
      const plan = plans.find((p) => p.assetClass === part.assetClass && p.mode === part.mode && p.task === "planned_remedy");
      const qtyPerJob = partsFor(part.assetClass, part.mode)[0]?.quantity ?? 1;
      const bySite = new Map<string, number>();
      for (const a of ctx.world.assets.values()) {
        if (a.data.assetClass !== part.assetClass || a.staticStatus === "offline") continue;
        bySite.set(a.data.siteId, (bySite.get(a.data.siteId) ?? 0) + 1);
      }
      for (const [siteId, n] of [...bySite].sort()) {
        const perAssetYear = (life ? 365 / life.etaDays : 0) + (plan ? 365 / plan.days : 0);
        const annual = n * perAssetYear * qtyPerJob;
        const leadDemand = (annual * part.leadTimeDays) / 365;
        let reorderPoint = Math.ceil(leadDemand + Z[part.criticality] * Math.sqrt(leadDemand));
        if (part.criticality !== "desirable") reorderPoint = Math.max(1, reorderPoint);
        const max = reorderPoint + Math.max(1, Math.ceil(annual / 4));
        const seed = hashString(`${part.partNumber}@${siteId}`);
        const u = hashNoise(seed, 1);
        const onHand = u < 0.12 ? 0 : Math.round(u * max * 1.8);
        out.push({ part, siteId, qtyPerJob, onHand, reorderPoint, max });
        // Some lines at or below their reorder point already have an order on its way.
        if (onHand <= reorderPoint && hashNoise(seed, 2) < 0.5) {
          const orderedAt = ctx.now - hashNoise(seed, 3) * part.leadTimeDays * DAY;
          this.orders.push({
            id: `PO-${String(this.nextPo++).padStart(5, "0")}`,
            partNumber: part.partNumber,
            siteId,
            quantity: max - onHand,
            orderedAt: iso(orderedAt),
            eta: iso(orderedAt + part.leadTimeDays * DAY),
            orderedBy: null,
            status: "open",
          });
        }
      }
    }
    this.seeded = out;
    return out;
  }

  /** What each closed-out work order took out of stock: part number → site → quantity. */
  private issued(ctx: InventoryCtx): Map<string, number> {
    const issued = new Map<string, number>();
    for (const wo of ctx.workOrders.all()) {
      for (const p of issuedBy(ctx, wo)) {
        const key = `${p.partNumber}@${p.siteId}`;
        issued.set(key, (issued.get(key) ?? 0) + p.quantity);
      }
    }
    return issued;
  }

  private ordersOf(now: number): PurchaseOrder[] {
    return this.orders.map((o) => ({ ...o, status: Date.parse(o.eta) <= now ? "received" : "open" }));
  }

  /** Every stock line, worked out for now. */
  private compute(ctx: InventoryCtx): StockLine[] {
    const seeded = this.lines(ctx);
    const issued = this.issued(ctx);
    const orders = this.ordersOf(ctx.now);
    const demand = this.demand(ctx);
    return seeded.map((s) => {
      const key = `${s.part.partNumber}@${s.siteId}`;
      const mine = orders.filter((o) => o.partNumber === s.part.partNumber && o.siteId === s.siteId);
      const received = mine.filter((o) => o.status === "received").reduce((n, o) => n + o.quantity, 0);
      const open = mine.filter((o) => o.status === "open").sort((a, b) => a.eta.localeCompare(b.eta));
      const onHand = Math.max(0, s.onHand + received - (issued.get(key) ?? 0));
      const onOrder = open.reduce((n, o) => n + o.quantity, 0);
      const needs = (demand.get(key) ?? []).sort((a, b) => a.needBy.localeCompare(b.needBy));
      const lead = ctx.now + s.part.leadTimeDays * DAY;

      // Walk the needs in date order against what's on the shelf plus what arrives before each one.
      let used = 0;
      let short = false;
      for (const need of needs) {
        used += need.quantity;
        const t = Date.parse(need.needBy);
        const supply = onHand + open.filter((o) => Date.parse(o.eta) <= t).reduce((n, o) => n + o.quantity, 0);
        if (supply < used && t <= lead) short = true;
      }
      const total = needs.reduce((n, d) => n + d.quantity, 0);
      const position = onHand + onOrder;
      const status: StockStatus = short
        ? "short"
        : position <= s.reorderPoint
          ? "reorder"
          : onHand > s.max * 1.5 && total === 0
            ? "excess"
            : "ok";
      const firstNeed = needs[0]?.needBy ?? null;
      const suggestedQty = status === "short" || status === "reorder" ? Math.max(1, s.max + total - position) : 0;
      return {
        partNumber: s.part.partNumber,
        description: s.part.description,
        siteId: s.siteId,
        criticality: s.part.criticality,
        onHand,
        onOrder,
        nextArrival: open[0]?.eta ?? null,
        reorderPoint: s.reorderPoint,
        max: s.max,
        demand: total,
        firstNeed,
        status,
        suggestedQty,
        orderBy:
          suggestedQty === 0
            ? null
            : firstNeed
              ? iso(Math.floor((Date.parse(firstNeed) - s.part.leadTimeDays * DAY) / HOUR) * HOUR)
              : iso(ctx.now),
        value: onHand * s.part.unitCost,
      };
    });
  }

  /** The forecast, grouped by part@site: PM work coming due and parts that open predictions will need. */
  private demand(ctx: InventoryCtx): Map<string, DemandItem[]> {
    const out = new Map<string, DemandItem[]>();
    const add = (partNumber: string, item: DemandItem) => {
      const key = `${partNumber}@${item.siteId}`;
      out.set(key, [...(out.get(key) ?? []), item]);
    };
    const all: Ctx2 = { ...ctx, inScope: () => true, scopeKey: "" };
    for (const d of pmPartDemand(all, DEMAND_HORIZON_DAYS)) {
      add(d.part.partNumber, {
        assetId: d.assetId,
        siteId: d.siteId,
        needBy: iso(d.due),
        quantity: d.part.quantity,
        source: "pm",
        refId: d.planId,
        probability: null,
      });
    }
    for (const p of ctx.snapshot().predictions) {
      if (p.status === "closed" || p.status === "dismissed" || !p.rul || p.rul.p50Days > DEMAND_HORIZON_DAYS) continue;
      const asset = ctx.world.assets.get(p.assetId);
      const mode = FailureModeCode.safeParse(p.failureMode.code);
      if (!asset || !mode.success) continue;
      for (const part of partsFor(asset.data.assetClass, mode.data)) {
        add(part.partNumber, {
          assetId: p.assetId,
          siteId: asset.data.siteId,
          needBy: iso(ctx.now + p.rul.p50Days * DAY),
          quantity: part.quantity,
          source: "prediction",
          refId: p.id,
          probability: p.probability,
        });
      }
    }
    return out;
  }

  private inScope(ctx: InventoryCtx, siteId: string): boolean {
    return [...ctx.world.assets.values()].some((a) => a.data.siteId === siteId && ctx.inScope(a.data.id));
  }

  overview(ctx: InventoryCtx, request: InventoryRequest): InventoryOverview {
    const q = request.search?.trim().toLowerCase();
    const sites = new Map<string, boolean>();
    const visible = (siteId: string) => {
      if (!sites.has(siteId)) sites.set(siteId, this.inScope(ctx, siteId));
      return sites.get(siteId)!;
    };
    const inScope = this.compute(ctx).filter((l) => visible(l.siteId));
    const lines = inScope
      .filter((l) => !request.status || request.status.includes(l.status))
      .filter((l) => !q || l.partNumber.toLowerCase().includes(q) || l.description.toLowerCase().includes(q))
      .sort(
        (a, b) =>
          STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
          (a.firstNeed ?? "9").localeCompare(b.firstNeed ?? "9") ||
          a.partNumber.localeCompare(b.partNumber) ||
          a.siteId.localeCompare(b.siteId),
      );
    const count = (s: StockStatus) => inScope.filter((l) => l.status === s).length;
    return {
      counts: {
        lines: inScope.length,
        short: count("short"),
        reorder: count("reorder"),
        excess: count("excess"),
        openOrders: this.ordersOf(ctx.now).filter((o) => o.status === "open" && visible(o.siteId)).length,
      },
      stockValue: inScope.reduce((n, l) => n + l.value, 0),
      currency: "USD",
      lines,
    };
  }

  part(ctx: InventoryCtx, partNumber: string): PartDetail {
    const part = this.parts(ctx).get(partNumber);
    if (!part) throw new ApiFailure("not_found", `Part ${partNumber} not found`);
    const lines = this.compute(ctx).filter((l) => l.partNumber === partNumber && this.inScope(ctx, l.siteId));
    const sites = new Set(lines.map((l) => l.siteId));
    const demand = [...this.demand(ctx).entries()]
      .filter(([key]) => key.startsWith(`${partNumber}@`))
      .flatMap(([, items]) => items)
      .filter((d) => sites.has(d.siteId))
      .sort((a, b) => a.needBy.localeCompare(b.needBy) || a.assetId.localeCompare(b.assetId));
    const plan = pmPlans(ctx).find((p) => p.parts.some((x) => x.partNumber === partNumber));
    return {
      part,
      pmPlanId: plan?.id ?? null,
      lines: lines.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || a.siteId.localeCompare(b.siteId)),
      demand,
      orders: this.ordersOf(ctx.now)
        .filter((o) => o.partNumber === partNumber && sites.has(o.siteId))
        .sort((a, b) => b.orderedAt.localeCompare(a.orderedAt)),
    };
  }

  order(ctx: InventoryCtx, request: PlaceOrderRequest, by: string): PurchaseOrder {
    const part = this.parts(ctx).get(request.partNumber);
    if (!part) throw new ApiFailure("not_found", `Part ${request.partNumber} not found`);
    if (!this.lines(ctx).some((l) => l.part.partNumber === request.partNumber && l.siteId === request.siteId)) {
      throw new ApiFailure("bad_request", `${request.siteId} doesn't stock ${request.partNumber}`);
    }
    const po: PurchaseOrder = {
      id: `PO-${String(this.nextPo++).padStart(5, "0")}`,
      partNumber: request.partNumber,
      siteId: request.siteId,
      quantity: request.quantity,
      orderedAt: iso(ctx.now),
      eta: iso(ctx.now + part.leadTimeDays * DAY),
      orderedBy: by,
      status: "open",
    };
    this.orders.push(po);
    return po;
  }

  workOrderParts(ctx: InventoryCtx, wo: WorkOrder): WorkOrderParts {
    const asset = ctx.world.assets.get(wo.assetId);
    const issued = issuedBy(ctx, wo);
    const needed = issued.length > 0 ? issued : asset ? neededBy(ctx, wo) : [];
    const lines = this.compute(ctx);
    return {
      siteId: asset?.data.siteId ?? "",
      parts: needed.map((p) => {
        const line = lines.find((l) => l.partNumber === p.partNumber && l.siteId === p.siteId);
        return {
          partNumber: p.partNumber,
          description: p.description,
          quantity: p.quantity,
          onHand: line?.onHand ?? 0,
          status: line?.status ?? "short",
        };
      }),
      issued: issued.length > 0,
    };
  }
}

interface PartUse {
  partNumber: string;
  description: string;
  siteId: string;
  quantity: number;
}

/** The parts a work order should use: its PM plan's, or those for the predicted failure mode. */
function neededBy(ctx: InventoryCtx, wo: WorkOrder): PartUse[] {
  const asset = ctx.world.assets.get(wo.assetId)!;
  const partsAt = (cls: typeof asset.data.assetClass, mode: Parameters<typeof partsFor>[1]) =>
    partsFor(cls, mode).map((p) => ({ ...p, siteId: asset.data.siteId }));
  if (wo.source.kind === "pm") {
    const plan = pmPlans(ctx).find((p) => p.id === wo.source.refId);
    return plan ? plan.parts.map((p) => ({ ...p, siteId: asset.data.siteId })) : [];
  }
  if (wo.source.kind === "prediction" && wo.source.refId) {
    const mode = FailureModeCode.safeParse(ctx.snapshot().predictionById.get(wo.source.refId)?.failureMode.code);
    return mode.success ? partsAt(asset.data.assetClass, mode.data) : [];
  }
  return [];
}

/** What a closed-out work order took out of stock (work closed in this session only). */
function issuedBy(ctx: InventoryCtx, wo: WorkOrder): PartUse[] {
  const c = wo.closeOut;
  if (!c || !DONE.has(wo.status) || Date.parse(c.completedAt) < ctx.world.createdAt) return [];
  const asset = ctx.world.assets.get(wo.assetId);
  if (!asset) return [];
  if (wo.source.kind === "pm") return neededBy(ctx, wo);
  if (!USES_PARTS.has(c.remedy)) return [];
  return partsFor(asset.data.assetClass, c.failureMode).map((p) => ({ ...p, siteId: asset.data.siteId }));
}
