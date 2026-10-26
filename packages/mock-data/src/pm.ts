/**
 * Preventive maintenance programs (Phase 4, chunk 1).
 *
 * Plans come from FMEA (rca.ts): for each kind of equipment, every failure mode whose strategy
 * is time-based gets a planned replacement/overhaul at its B10 life, and every condition-based
 * mode gets a regular condition check. Rotating machines' overhauls count running hours.
 *
 * What happened to each PM over the last year is seeded, like the failure history: each site
 * has its own discipline (some do 95% on time, some 72%). On top of that, PM work orders raised
 * in this session (source kind "pm") count: an open one makes its PM "planned", a closed-out one
 * makes it done, on time or late.
 */
import {
  PM_COMPLIANCE_DAYS,
  PM_HORIZON_DAYS,
  VIBRATION_CLASSES,
  type AssetClass,
  type FailureModeCode,
  type FmeaRow,
  type GeneratePmResult,
  type PmAssetStatus,
  type PmCounts,
  type PmMonth,
  type PmOutcome,
  type PmOverview,
  type PmPart,
  type PmPlanDetail,
  type PmPlanSummary,
  type PmTrigger,
  type PmUncovered,
  type WorkOrder,
} from "@pdm/contracts";
import { ASSET_CLASSES } from "./catalog/asset-catalog";
import { DAY, HOUR, iso } from "./clock";
import { ApiFailure } from "./errors";
import type { AssetRecord } from "./model";
import { hashNoise, hashString } from "./random";
import { fmea } from "./rca";
import type { FailureRecord } from "@pdm/contracts";
import type { WorkOrderStore } from "./work-orders";
import type { World } from "./world";

export interface Ctx {
  world: World;
  workOrders: WorkOrderStore;
  failures: () => readonly FailureRecord[];
  now: number;
}

/** A plan with everything the occurrence maths needs. */
export interface Plan extends Omit<PmPlanSummary, "assets" | "counts" | "nextDue"> {
  why: PmPlanDetail["why"];
  /** Typical days between PMs, before running-hours plans are adjusted for each asset's use. */
  days: number;
}

interface Occurrence {
  due: number;
  /** Done after this, it's late. */
  windowEnd: number;
  outcome: PmOutcome;
  doneAt: number | null;
  workOrder: WorkOrder | null;
}

const NICE_DAYS = [30, 60, 90, 180, 365, 730, 1095, 1460, 2190] as const;
const RUNNING: ReadonlySet<AssetClass> = new Set(VIBRATION_CLASSES);
const YEAR_DAYS = 365;

/** The largest tidy interval no longer than the mode's B10 life: replace before 10% would have failed. */
function intervalFor(b10Days: number | null): number {
  if (b10Days === null) return 365;
  return [...NICE_DAYS].reverse().find((d) => d <= b10Days) ?? 30;
}

const PART_NAMES: Partial<Record<FailureModeCode, string>> = {
  VIB: "bearing set",
  NOI: "bearing set",
  ELP: "seal kit",
  ELU: "seal kit",
  INL: "seal and valve kit",
  LOO: "overhaul kit",
  OHE: "cooling fan and filter set",
  PLU: "filter element set",
  BRD: "spare module",
  FTS: "starter and ignition kit",
  ERO: "positioner spares",
  PDE: "transmitter spares",
  AIR: "transmitter spares",
  STD: "structural repair materials",
  UST: "control card",
};

/** The parts a planned remedy uses. The two bearings match the vibration tab's bearing geometry. */
export function partsFor(cls: AssetClass, mode: FailureModeCode): PmPart[] {
  const info = ASSET_CLASSES[cls];
  if (mode === "VIB" && cls === "pump") return [{ partNumber: "SP-BRG-6309", description: "Ball bearing 6309-2RS", quantity: 2 }];
  if (mode === "VIB" && cls === "esp") return [{ partNumber: "SP-BRG-6205", description: "Ball bearing 6205-2RS", quantity: 2 }];
  const name = PART_NAMES[mode] ?? "service kit";
  return [{ partNumber: `SP-${info.code}-${mode}`, description: `${info.label} ${name}`, quantity: 1 }];
}

const planCache = new WeakMap<World, { plans: Plan[]; uncovered: PmUncovered[] }>();

/** Every plan, built once per world from FMEA on the seeded history. */
function buildPlans(ctx: Ctx): { plans: Plan[]; uncovered: PmUncovered[] } {
  const cached = planCache.get(ctx.world);
  if (cached) return cached;
  const classes = [...new Set([...ctx.world.assets.values()].map((a) => a.data.assetClass))].sort();
  const failures = ctx.failures();
  const plans: Plan[] = [];
  const uncovered: PmUncovered[] = [];
  for (const assetClass of classes) {
    const rows = fmea({ world: ctx.world, failures, workOrders: ctx.workOrders, now: ctx.now, assetClass }).rows;
    for (const row of rows) {
      const plan = planFrom(assetClass, row);
      if (plan) plans.push(plan);
      else uncovered.push({ assetClass, mode: row.mode, strategy: row.strategy });
    }
  }
  const result = { plans, uncovered };
  planCache.set(ctx.world, result);
  return result;
}

function planFrom(assetClass: AssetClass, row: FmeaRow): Plan | null {
  const why = {
    severity: row.severity,
    occurrence: row.occurrence,
    detection: row.detection,
    rpn: row.rpn,
    pattern: row.pattern,
    b10Days: row.b10Days,
  };
  const id = `PM-${ASSET_CLASSES[assetClass].code}-${row.mode}`;
  if (row.strategy === "time_based") {
    const days = intervalFor(row.b10Days);
    const trigger: PmTrigger = RUNNING.has(assetClass)
      ? { kind: "running_hours", hours: Math.round((days * 24) / 500) * 500, typicalDays: days }
      : { kind: "calendar", days };
    return {
      id,
      assetClass,
      mode: row.mode,
      task: "planned_remedy",
      remedy: "replace",
      strategy: row.strategy,
      workType: "preventive",
      trigger,
      estimatedHours: 6,
      parts: partsFor(assetClass, row.mode),
      why,
      days,
    };
  }
  if (row.strategy === "condition_based") {
    // A model already watches monitored modes, so the route can be less frequent.
    const days = row.monitored ? 90 : 30;
    return {
      id,
      assetClass,
      mode: row.mode,
      task: "condition_check",
      remedy: null,
      strategy: row.strategy,
      workType: "inspection",
      trigger: { kind: "calendar", days },
      estimatedHours: 1,
      parts: [],
      why,
      days,
    };
  }
  return null; // run to failure, or fix the design: no PM
}

/** Share of time a machine runs, which stretches a running-hours interval in calendar days. */
function utilisation(asset: AssetRecord): number {
  if (asset.staticStatus === "standby") return 0.1;
  if (asset.schedule === "day") return 0.67;
  if (asset.schedule === "evening") return 0.25;
  if (asset.site.def.profile === "solar" && !["transformer", "switchgear", "bess"].includes(asset.data.assetClass)) return 0.5;
  return 1;
}

function intervalDays(plan: Plan, asset: AssetRecord): number {
  return plan.trigger.kind === "running_hours" ? plan.trigger.hours / 24 / utilisation(asset) : plan.days;
}

/** How late a PM may be and still count as on time: a week, or a tenth of the interval if longer. */
const windowDays = (interval: number) => Math.max(7, 0.1 * interval);

const DONE: ReadonlySet<string> = new Set(["completed", "verified", "closed"]);

/** Every occurrence of a plan on an asset over the last year, plus the next one. Oldest first. */
function occurrences(ctx: Ctx, plan: Plan, asset: AssetRecord, pmOrders: readonly WorkOrder[]): Occurrence[] {
  const interval = intervalDays(plan, asset);
  const seed = hashString(`${plan.id}:${asset.data.id}`);
  const quality = 0.72 + 0.23 * hashNoise(hashString(asset.data.siteId), 3);
  const window = windowDays(interval) * DAY;
  const last = ctx.now - hashNoise(seed, 0) * interval * DAY;
  const start = Math.max(ctx.now - YEAR_DAYS * DAY, Date.parse(asset.data.commissionedAt));
  const dues: number[] = [];
  for (let d = last; d >= start; d -= interval * DAY) dues.unshift(d);
  dues.push(last + interval * DAY);

  const mine = pmOrders.filter((o) => o.assetId === asset.data.id);
  const list: Occurrence[] = dues.map((due) => {
    const u = hashNoise(seed, Math.floor(due / DAY));
    const base = { due, windowEnd: due + window, doneAt: null, workOrder: null };
    if (due > ctx.now) return { ...base, outcome: "upcoming" };
    if (u < quality) {
      const doneAt = due + (2 * (u / quality) - 1) * 0.8 * window;
      if (doneAt <= ctx.now) return { ...base, outcome: "on_time", doneAt };
      return { ...base, outcome: "upcoming" };
    }
    if (u < quality + (1 - quality) * 0.7) {
      const doneAt = due + window + ((u - quality) / (1 - quality)) * 20 * DAY;
      if (doneAt <= ctx.now) return { ...base, outcome: "late", doneAt };
    }
    return { ...base, outcome: due + window > ctx.now ? "upcoming" : "missed" };
  });

  // Work orders raised from this plan in this session, matched to the occurrence they were raised for.
  for (const wo of mine) {
    const due = wo.dueAt ? Date.parse(wo.dueAt) : NaN;
    const occ = list.find((o) => Math.abs(o.due - due) < DAY);
    if (!occ || occ.outcome === "on_time" || occ.outcome === "late") continue;
    if (wo.closeOut && DONE.has(wo.status)) {
      const doneAt = Date.parse(wo.closeOut.completedAt);
      occ.outcome = doneAt <= occ.windowEnd ? "on_time" : "late";
      occ.doneAt = doneAt;
    } else if (wo.status !== "cancelled") {
      occ.outcome = "planned";
    }
    occ.workOrder = wo;
  }

  // The latest occurrence that passed its window undone is overdue (actionable); earlier ones were missed.
  const pastWindow = list.filter((o) => o.outcome === "missed");
  const latestMissed = pastWindow.at(-1);
  if (latestMissed && !list.some((o) => o.due > latestMissed.due && o.due <= ctx.now)) latestMissed.outcome = "overdue";
  return list;
}

export interface Ctx2 extends Ctx {
  inScope: (assetId: string) => boolean;
  /** Names the scope, for the cache. */
  scopeKey: string;
}

function assetsFor(ctx: Ctx2, plan: Plan): AssetRecord[] {
  return [...ctx.world.assets.values()].filter(
    (a) => a.data.assetClass === plan.assetClass && a.staticStatus !== "offline" && ctx.inScope(a.data.id),
  );
}

function pmOrdersOf(ctx: Ctx, planId: string): WorkOrder[] {
  return ctx.workOrders.all().filter((o) => o.source.kind === "pm" && o.source.refId === planId);
}

function emptyCounts(): PmCounts {
  return { decided: 0, onTime: 0, late: 0, missed: 0, overdue: 0, dueSoon: 0, compliancePct: null };
}

/** Not done, and past its window: counts against compliance, even with a work order raised. */
const notDoneInTime = (o: Occurrence, now: number) =>
  o.outcome === "missed" || o.outcome === "overdue" || (o.outcome === "planned" && o.windowEnd < now);

/** Adds an asset's occurrences to the counts: compliance over the last PM_COMPLIANCE_DAYS. */
function tally(counts: PmCounts, list: readonly Occurrence[], now: number): void {
  const from = now - PM_COMPLIANCE_DAYS * DAY;
  for (const o of list) {
    if (o.due >= from && o.due <= now) {
      if (o.outcome === "on_time") counts.onTime++;
      if (o.outcome === "late") counts.late++;
      if (notDoneInTime(o, now)) counts.missed++;
      if (o.outcome === "on_time" || o.outcome === "late" || notDoneInTime(o, now)) counts.decided++;
    }
    if (o.outcome === "overdue") counts.overdue++;
    if (o.outcome === "upcoming" && o.due <= now + PM_HORIZON_DAYS * DAY) counts.dueSoon++;
  }
}

const finish = (c: PmCounts): PmCounts => ({ ...c, compliancePct: c.decided > 0 ? Math.round((1000 * c.onTime) / c.decided) / 10 : null });

function addMonthly(months: Map<string, PmMonth>, list: readonly Occurrence[], now: number): void {
  for (const o of list) {
    const m = months.get(iso(o.due).slice(0, 7));
    if (!m) continue;
    if (o.outcome === "on_time") m.onTime++;
    if (o.outcome === "late") m.late++;
    if (notDoneInTime(o, now)) m.missed++;
  }
}

function emptyMonths(now: number): Map<string, PmMonth> {
  const months = new Map<string, PmMonth>();
  const d = new Date(now);
  for (let i = 11; i >= 0; i--) {
    const m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1));
    const key = iso(m.getTime()).slice(0, 7);
    months.set(key, { month: key, onTime: 0, late: 0, missed: 0 });
  }
  return months;
}

function summarise(
  ctx: Ctx2,
  plan: Plan,
  months?: Map<string, PmMonth>,
): { summary: PmPlanSummary; perAsset: [AssetRecord, Occurrence[]][] } {
  const orders = pmOrdersOf(ctx, plan.id);
  const counts = emptyCounts();
  let nextDue: number | null = null;
  const perAsset: [AssetRecord, Occurrence[]][] = [];
  for (const asset of assetsFor(ctx, plan)) {
    const list = occurrences(ctx, plan, asset, orders);
    perAsset.push([asset, list]);
    tally(counts, list, ctx.now);
    if (months) addMonthly(months, list, ctx.now);
    const next = list.find((o) => o.outcome === "overdue" || o.outcome === "upcoming");
    if (next && (nextDue === null || next.due < nextDue)) nextDue = next.due;
  }
  const { why: _why, days: _days, ...rest } = plan;
  return {
    summary: { ...rest, assets: perAsset.length, counts: finish(counts), nextDue: nextDue === null ? null : iso(nextDue) },
    perAsset,
  };
}

/**
 * Overviews are cached: they change only when the hour turns (things fall due) or a PM work
 * order changes (raised, moved, closed out). The Command Center's PM tile asks on every refresh.
 */
const overviewCache = new WeakMap<World, Map<string, PmOverview>>();

export function pmOverview(ctx: Ctx2, assetClass?: AssetClass): PmOverview {
  const version = ctx.workOrders
    .all()
    .filter((o) => o.source.kind === "pm")
    .map((o) => `${o.id}:${o.status}`)
    .join(",");
  const key = `${ctx.scopeKey}|${assetClass ?? ""}|${Math.floor(ctx.now / HOUR)}|${version}`;
  let cache = overviewCache.get(ctx.world);
  if (!cache) overviewCache.set(ctx.world, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;
  const result = computeOverview(ctx, assetClass);
  if (cache.size > 50) cache.clear();
  cache.set(key, result);
  return result;
}

function computeOverview(ctx: Ctx2, assetClass?: AssetClass): PmOverview {
  const { plans, uncovered } = buildPlans(ctx);
  const months = emptyMonths(ctx.now);
  const total = emptyCounts();
  const summaries: PmPlanSummary[] = [];
  for (const plan of plans) {
    if (assetClass && plan.assetClass !== assetClass) continue;
    const { summary } = summarise(ctx, plan, months);
    if (summary.assets === 0) continue;
    summaries.push(summary);
    for (const k of ["decided", "onTime", "late", "missed", "overdue", "dueSoon"] as const) total[k] += summary.counts[k];
  }
  summaries.sort(
    (a, b) =>
      b.counts.overdue - a.counts.overdue || (a.counts.compliancePct ?? 101) - (b.counts.compliancePct ?? 101) || a.id.localeCompare(b.id),
  );
  const classes = new Set(summaries.map((s) => s.assetClass));
  return {
    counts: finish(total),
    plans: summaries,
    uncovered: uncovered.filter((u) => (assetClass ? u.assetClass === assetClass : classes.has(u.assetClass))),
    monthly: [...months.values()],
  };
}

function planById(ctx: Ctx, planId: string): Plan {
  const plan = buildPlans(ctx).plans.find((p) => p.id === planId);
  if (!plan) throw new ApiFailure("not_found", `PM plan ${planId} not found`);
  return plan;
}

const STATUS_ORDER = { overdue: 0, planned: 1, due_soon: 2, ok: 3 } as const;

export function pmPlan(ctx: Ctx2, planId: string): PmPlanDetail {
  const plan = planById(ctx, planId);
  const months = emptyMonths(ctx.now);
  const { summary, perAsset } = summarise(ctx, plan, months);
  const assetStatus: PmAssetStatus[] = perAsset.map(([asset, list]) => {
    const planned = list.find((o) => o.outcome === "planned");
    const overdue = list.find((o) => o.outcome === "overdue");
    const next = list.find((o) => o.outcome === "upcoming");
    const done = list.filter((o) => o.doneAt !== null);
    const decided = list.filter((o) => o.due <= ctx.now && o.outcome !== "upcoming" && o.outcome !== "planned");
    const status = overdue ? "overdue" : planned ? "planned" : next && next.due <= ctx.now + PM_HORIZON_DAYS * DAY ? "due_soon" : "ok";
    const due = overdue ?? planned ?? next;
    return {
      assetId: asset.data.id,
      siteId: asset.data.siteId,
      lastDone: done.length > 0 ? iso(Math.max(...done.map((o) => o.doneAt!))) : null,
      nextDue: due ? iso(due.due) : null,
      status,
      workOrderId: planned?.workOrder?.id ?? null,
      workOrderNumber: planned?.workOrder?.number ?? null,
      compliancePct:
        decided.length > 0 ? Math.round((1000 * decided.filter((o) => o.outcome === "on_time").length) / decided.length) / 10 : null,
    };
  });
  assetStatus.sort(
    (a, b) =>
      STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
      (a.nextDue ?? "9").localeCompare(b.nextDue ?? "9") ||
      a.assetId.localeCompare(b.assetId),
  );
  return { ...summary, why: plan.why, assetStatus, monthly: [...months.values()] };
}

/** Raise a work order for every overdue PM, and every PM due within the horizon, that has none yet. */
export function generatePm(ctx: Ctx2, planId: string, by: string): GeneratePmResult {
  const plan = planById(ctx, planId);
  const orders = pmOrdersOf(ctx, plan.id);
  const created: GeneratePmResult["created"] = [];
  for (const asset of assetsFor(ctx, plan)) {
    const list = occurrences(ctx, plan, asset, orders);
    const targets = list.filter((o) => o.outcome === "overdue" || (o.outcome === "upcoming" && o.due <= ctx.now + PM_HORIZON_DAYS * DAY));
    for (const o of targets) {
      const what = plan.task === "planned_remedy" ? `Planned ${plan.remedy ?? "replace"}` : "Condition check";
      const wo = ctx.workOrders.create(
        {
          title: `${what} (${plan.mode}) — ${asset.data.id}`,
          description: `Preventive maintenance from plan ${plan.id}.`,
          assetId: asset.data.id,
          type: plan.workType,
          priority: asset.data.criticality >= 4 ? "high" : "normal",
          assigneeId: null,
          dueAt: iso(o.due),
          source: { kind: "pm", refId: plan.id },
          evidence: null,
          estimatedHours: plan.estimatedHours,
        },
        by,
        ctx.now,
      );
      ctx.workOrders.setStatus(wo.id, "planned", ctx.now, `Generated from PM plan ${plan.id}`);
      created.push({ workOrderId: wo.id, number: wo.number, assetId: asset.data.id, dueAt: iso(o.due) });
    }
  }
  return { created };
}

/** Every plan, with the typical days between its PMs (inventory sizes stock from it). */
export function pmPlans(ctx: Ctx): readonly Plan[] {
  return buildPlans(ctx).plans;
}

/**
 * The parts PM work will use: every planned replacement on an asset in scope that is overdue,
 * has a work order raised but not closed out, or falls due within `days`. Overdue ones are
 * needed now.
 */
export function pmPartDemand(ctx: Ctx2, days: number): { planId: string; assetId: string; siteId: string; due: number; part: PmPart }[] {
  const out: { planId: string; assetId: string; siteId: string; due: number; part: PmPart }[] = [];
  for (const plan of buildPlans(ctx).plans) {
    if (plan.task !== "planned_remedy" || plan.parts.length === 0) continue;
    const orders = pmOrdersOf(ctx, plan.id);
    for (const asset of assetsFor(ctx, plan)) {
      for (const o of occurrences(ctx, plan, asset, orders)) {
        const pending = o.outcome === "overdue" || o.outcome === "planned" || o.outcome === "upcoming";
        if (!pending || o.due > ctx.now + days * DAY) continue;
        for (const part of plan.parts)
          out.push({ planId: plan.id, assetId: asset.data.id, siteId: asset.data.siteId, due: Math.max(o.due, ctx.now), part });
      }
    }
  }
  return out;
}

const overdueCache = new WeakMap<World, Map<string, Set<string>>>();

/** Every asset (in scope) with at least one overdue PM. Cached like the overview. */
export function overdueAssets(ctx: Ctx2): ReadonlySet<string> {
  const version = ctx.workOrders
    .all()
    .filter((o) => o.source.kind === "pm")
    .map((o) => `${o.id}:${o.status}`)
    .join(",");
  const key = `${ctx.scopeKey}|${Math.floor(ctx.now / HOUR)}|${version}`;
  let cache = overdueCache.get(ctx.world);
  if (!cache) overdueCache.set(ctx.world, (cache = new Map()));
  const hit = cache.get(key);
  if (hit) return hit;
  const out = new Set<string>();
  for (const plan of buildPlans(ctx).plans) {
    const orders = pmOrdersOf(ctx, plan.id);
    for (const asset of assetsFor(ctx, plan)) {
      if (out.has(asset.data.id)) continue;
      if (occurrences(ctx, plan, asset, orders).some((o) => o.outcome === "overdue")) out.add(asset.data.id);
    }
  }
  if (cache.size > 50) cache.clear();
  cache.set(key, out);
  return out;
}

/** Every PM done on an asset in scope since `from`: when, and the plan's hours and parts (financials prices them). */
export function pmDone(
  ctx: Ctx2,
  from: number,
): { planId: string; assetId: string; doneAt: number; hours: number; parts: readonly PmPart[] }[] {
  const out: { planId: string; assetId: string; doneAt: number; hours: number; parts: readonly PmPart[] }[] = [];
  for (const plan of buildPlans(ctx).plans) {
    const orders = pmOrdersOf(ctx, plan.id);
    for (const asset of assetsFor(ctx, plan)) {
      for (const o of occurrences(ctx, plan, asset, orders)) {
        if (o.doneAt === null || o.doneAt < from || o.doneAt > ctx.now) continue;
        out.push({
          planId: plan.id,
          assetId: asset.data.id,
          doneAt: o.doneAt,
          hours: plan.estimatedHours,
          parts: plan.task === "planned_remedy" ? plan.parts : [],
        });
      }
    }
  }
  return out;
}

/** PM compliance for a set of assets, for the Command Center tile. */
export function pmCompliance(ctx: Ctx2): number | null {
  return pmOverview(ctx).counts.compliancePct;
}
