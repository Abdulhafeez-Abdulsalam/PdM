/**
 * HSE and compliance (Phase 4, chunk 3).
 *
 * Permits to work follow the work orders: one is requested when hazardous work is scheduled,
 * the HSE officer issues it, work can't start without it (the work-order store asks before
 * every start), and it closes when the work is closed out or cancelled. Inspections and
 * calibrations are hands-off and need none. Work already approved or under way when the demo
 * starts has an issued permit; scheduled work starts in the HSE officer's queue.
 *
 * Incidents come from the failure history where it would have been one (a leak of process
 * fluid is a loss of containment: a process safety event, tier 1 or 2 by consequence; an oil
 * leak from a transformer is an environmental release; a breakdown of critical equipment is
 * equipment damage), plus near misses, which every healthy site reports a few of each month.
 */
import {
  MOC_TRANSITIONS,
  type Alarm,
  type AssetClass,
  type CreateMocRequest,
  type FailureRecord,
  type HseMonth,
  type HseOverview,
  type Incident,
  type Moc,
  type MocTransitionRequest,
  type Permit,
  type PermitListRequest,
  type PermitType,
  type ReportIncidentRequest,
  type SafetyCriticalElement,
  type SceReason,
  type WorkOrder,
} from "@pdm/contracts";
import { DAY, iso } from "./clock";
import { ApiFailure } from "./errors";
import type { AssetRecord } from "./model";
import { overdueAssets, type Ctx2 } from "./pm";
import { hashNoise, hashString } from "./random";
import type { Snapshot } from "./snapshot";
import type { WorkOrderStore } from "./work-orders";
import type { World } from "./world";

/** Equipment that's safety-critical by its nature; anything of criticality 5 is too. */
const SCE_CLASSES: ReadonlySet<AssetClass> = new Set([
  "psv",
  "pressure_vessel",
  "pipeline_segment",
  "storage_tank",
  "fired_heater",
  "separator",
]);
const NO_PERMIT: ReadonlySet<string> = new Set(["inspection", "calibration"]);
const CONFINED: ReadonlySet<AssetClass> = new Set(["pressure_vessel", "storage_tank", "separator", "fired_heater", "hrsg"]);
const ELECTRICAL: ReadonlySet<AssetClass> = new Set([
  "transformer",
  "switchgear",
  "generator",
  "inverter",
  "bess",
  "combiner_box",
  "pv_string",
]);
const OPEN: ReadonlySet<string> = new Set(["requested", "issued"]);
const NEAR_MISSES = [
  "Dropped object near",
  "Unsecured hose found at",
  "Missing guard on",
  "Oil on the floor by",
  "Out-of-date scaffold tag at",
  "Gas detector left off near",
] as const;

export const isSafetyCritical = (a: AssetRecord) => SCE_CLASSES.has(a.data.assetClass) || a.data.criticality === 5;
const needsPermit = (wo: WorkOrder) => !NO_PERMIT.has(wo.type);

function permitTypeFor(asset: AssetRecord | undefined, wo: WorkOrder): PermitType {
  const cls = asset?.data.assetClass;
  if (cls && CONFINED.has(cls)) return "confined_space";
  if (cls && ELECTRICAL.has(cls)) return "electrical_isolation";
  if (cls === "pipeline_segment" && wo.type === "corrective") return "hot_work";
  return "cold_work";
}

export interface HseCtx extends Ctx2 {
  snapshot: () => Snapshot;
  alarms: () => readonly Alarm[];
}

export class HseStore {
  private readonly permits: Permit[] = [];
  private nextPermit = 1;
  private incidents: Incident[] | null = null;
  private nextIncident = 1;
  private mocs: Moc[] | null = null;
  private nextMoc = 1;

  constructor(
    private readonly world: World,
    workOrders: WorkOrderStore,
    now: number,
  ) {
    const officer = world.usersWithRole("hse_officer")[0]?.id ?? "system";
    for (const wo of workOrders.all()) {
      if (!needsPermit(wo) || !["scheduled", "approved", "in_progress"].includes(wo.status)) continue;
      const scheduled = [...wo.history].reverse().find((h) => h.to === "scheduled")?.at ?? iso(now - DAY);
      const permit = this.request(wo, Date.parse(scheduled));
      if (wo.status !== "scheduled") {
        const approved = [...wo.history].reverse().find((h) => h.to === "approved")?.at ?? scheduled;
        Object.assign(permit, { status: "issued", issuedAt: approved, issuedBy: officer });
      }
    }
    workOrders.onStatusChange((wo, _from, t) => {
      if (!needsPermit(wo)) return;
      const open = this.openPermit(wo.id);
      if (wo.status === "scheduled" && !open) this.request(wo, t);
      if (wo.status === "completed" && open) Object.assign(open, { status: "closed", closedAt: iso(t) });
      if (wo.status === "cancelled" && open) Object.assign(open, { status: "cancelled", closedAt: iso(t) });
    });
    workOrders.setStartCheck((wo) => {
      if (!needsPermit(wo)) return;
      const open = this.openPermit(wo.id);
      if (!open) throw new ApiFailure("conflict", `${wo.number} needs a permit to work before it starts`);
      if (open.status !== "issued") throw new ApiFailure("conflict", `Permit ${open.id} for ${wo.number} hasn't been issued yet`);
    });
  }

  private request(wo: WorkOrder, t: number): Permit {
    const asset = this.world.assets.get(wo.assetId);
    const permit: Permit = {
      id: `PTW-${String(this.nextPermit++).padStart(5, "0")}`,
      workOrderId: wo.id,
      workOrderNumber: wo.number,
      workOrderTitle: wo.title,
      assetId: wo.assetId,
      siteId: asset?.data.siteId ?? "",
      type: permitTypeFor(asset, wo),
      status: "requested",
      requestedAt: iso(t),
      plannedStart: wo.scheduledStart,
      issuedAt: null,
      issuedBy: null,
      closedAt: null,
    };
    this.permits.push(permit);
    return permit;
  }

  private openPermit(workOrderId: string): Permit | undefined {
    return this.permits.find((p) => p.workOrderId === workOrderId && OPEN.has(p.status));
  }

  listPermits(request: PermitListRequest, inScope: (assetId: string) => boolean, workOrders: WorkOrderStore): Permit[] {
    const order = { requested: 0, issued: 1, closed: 2, cancelled: 3 };
    const byId = new Map(workOrders.all().map((o) => [o.id, o]));
    return this.permits
      .filter((p) => !request.workOrderId || p.workOrderId === request.workOrderId)
      .filter((p) => !request.status || request.status.includes(p.status))
      .filter((p) => inScope(p.assetId))
      .map((p) => ({ ...p, plannedStart: byId.get(p.workOrderId)?.scheduledStart ?? p.plannedStart })) // follow the schedule board
      .sort((a, b) => order[a.status] - order[b.status] || (a.plannedStart ?? "9").localeCompare(b.plannedStart ?? "9"));
  }

  issue(permitId: string, by: string, now: number): Permit {
    const permit = this.permits.find((p) => p.id === permitId);
    if (!permit) throw new ApiFailure("not_found", `Permit ${permitId} not found`);
    if (permit.status !== "requested") throw new ApiFailure("conflict", `Permit ${permitId} is ${permit.status}, not waiting to be issued`);
    Object.assign(permit, { status: "issued", issuedAt: iso(now), issuedBy: by });
    return permit;
  }

  // ─── Incidents ───────────────────────────────────────────────────────────────

  private seedIncidents(failures: readonly FailureRecord[], now: number): Incident[] {
    if (this.incidents) return this.incidents;
    const from = now - 365 * DAY;
    const list: Omit<Incident, "id">[] = [];
    for (const f of failures) {
      const t = Date.parse(f.failedAt);
      if (t < from || t > now) continue;
      const asset = this.world.assets.get(f.assetId);
      if (!asset) continue;
      const u = hashNoise(hashString(f.id), 7);
      const base = { assetId: f.assetId, siteId: asset.data.siteId, occurredAt: f.failedAt, failureId: f.id, reportedBy: null };
      const leak = f.mode === "ELP" || f.mode === "ELU";
      if (leak && asset.data.assetClass === "transformer") {
        if (u < 0.5) list.push({ ...base, kind: "environmental_release", tier: null, title: `Insulating oil release at ${f.assetId}` });
      } else if (f.mode === "ELP") {
        // A leak of process fluid is a loss of containment; how much and what decides the tier.
        if (asset.data.criticality === 5 && u < 0.25)
          list.push({ ...base, kind: "process_safety_event", tier: 1, title: `Loss of containment at ${f.assetId}` });
        else if (u < 0.45) list.push({ ...base, kind: "process_safety_event", tier: 2, title: `Loss of containment at ${f.assetId}` });
      } else if (f.mode === "BRD" && asset.data.criticality >= 4 && u < 0.3) {
        list.push({ ...base, kind: "equipment_damage", tier: null, title: `Breakdown damage at ${f.assetId}` });
      }
    }
    // Near misses: a few a month at each site.
    const bySite = new Map<string, AssetRecord[]>();
    for (const a of this.world.assets.values()) bySite.set(a.data.siteId, [...(bySite.get(a.data.siteId) ?? []), a]);
    for (const [siteId, assets] of [...bySite].sort()) {
      const seed = hashString(`near-miss:${siteId}`);
      for (let week = 0; week < 52; week++) {
        if (hashNoise(seed, week) > 0.55) continue;
        const asset = assets[Math.floor(hashNoise(seed ^ 0x55, week) * assets.length)]!;
        const what = NEAR_MISSES[Math.floor(hashNoise(seed ^ 0x77, week) * NEAR_MISSES.length)]!;
        list.push({
          kind: "near_miss",
          tier: null,
          assetId: asset.data.id,
          siteId,
          occurredAt: iso(now - (week + hashNoise(seed ^ 0x99, week)) * 7 * DAY),
          title: `${what} ${asset.data.id}`,
          failureId: null,
          reportedBy: null,
        });
      }
    }
    list.sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    this.incidents = list.map((i) => ({ ...i, id: `INC-${String(this.nextIncident++).padStart(5, "0")}` }));
    return this.incidents;
  }

  listIncidents(failures: readonly FailureRecord[], now: number, inScope: (assetId: string) => boolean): Incident[] {
    return this.seedIncidents(failures, now)
      .filter((i) => i.assetId === null || inScope(i.assetId))
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  report(request: ReportIncidentRequest, failures: readonly FailureRecord[], by: string, now: number): Incident {
    const asset = this.world.assets.get(request.assetId);
    if (!asset) throw new ApiFailure("not_found", `Asset ${request.assetId} not found`);
    const list = this.seedIncidents(failures, now);
    const incident: Incident = {
      id: `INC-${String(this.nextIncident++).padStart(5, "0")}`,
      kind: request.kind,
      tier: null,
      assetId: asset.data.id,
      siteId: asset.data.siteId,
      occurredAt: iso(now),
      title: request.title,
      failureId: null,
      reportedBy: by,
    };
    list.push(incident);
    return incident;
  }

  // ─── Management of change ────────────────────────────────────────────────────

  private seedMocs(now: number): Moc[] {
    if (this.mocs) return this.mocs;
    const first = (cls: AssetClass, preferred?: string) =>
      (preferred && this.world.assets.get(preferred)) || [...this.world.assets.values()].find((a) => a.data.assetClass === cls)!;
    const engineer = this.world.usersWithRole("reliability_engineer")[0]?.id ?? "system";
    const officer = this.world.usersWithRole("hse_officer")[0]?.id ?? "system";
    const planner = this.world.usersWithRole("maintenance_planner")[0]?.id ?? "system";
    const seeds: {
      asset: AssetRecord;
      kind: Moc["kind"];
      risk: Moc["risk"];
      title: string;
      description: string;
      path: [Moc["status"], string][];
      daysAgo: number;
    }[] = [
      {
        asset: first("compressor", "GCM-CMP-105"),
        kind: "setpoint",
        risk: "medium",
        title: "Raise the anti-surge control margin",
        description: "Surge margin has been eroding; raise the controller's margin from 10 % to 12 % until the recycle valve is inspected.",
        path: [["under_review", officer]],
        daysAgo: 6,
      },
      {
        asset: first("pump", "PBU-PMP-106"),
        kind: "equipment",
        risk: "medium",
        title: "Fit sealed-for-life bearings",
        description: "Replace open 6309 bearings with a sealed-for-life type to stop contamination getting in.",
        path: [
          ["under_review", officer],
          ["approved", officer],
        ],
        daysAgo: 20,
      },
      {
        asset: first("psv"),
        kind: "temporary",
        risk: "high",
        title: "Temporary bypass of the relief valve during testing",
        description:
          "Bypass for no more than 4 hours while the valve is bench-tested, with a dedicated watch and the vessel at reduced pressure.",
        path: [],
        daysAgo: 2,
      },
      {
        asset: first("gas_turbine"),
        kind: "procedure",
        risk: "low",
        title: "Add an offline water wash step to the start-up procedure",
        description: "After a long shutdown, wash the compressor before loading, to recover efficiency lost to fouling.",
        path: [
          ["under_review", officer],
          ["approved", officer],
          ["implemented", planner],
        ],
        daysAgo: 45,
      },
      {
        asset: first("pipeline_segment"),
        kind: "setpoint",
        risk: "high",
        title: "Raise the maximum operating pressure",
        description: "Increase throughput by raising the segment's maximum operating pressure by 8 %.",
        path: [
          ["under_review", officer],
          ["rejected", officer],
        ],
        daysAgo: 30,
      },
    ];
    this.mocs = seeds.map((s) => {
      const proposedAt = now - s.daysAgo * DAY;
      const history: Moc["history"] = [{ at: iso(proposedAt), by: engineer, to: "proposed", note: null }];
      s.path.forEach(([to, by], i) =>
        history.push({
          at: iso(proposedAt + (i + 1) * 2 * DAY),
          by,
          to,
          note: to === "rejected" ? "Wall thickness survey due first" : null,
        }),
      );
      const last = history.at(-1)!;
      return {
        id: `MOC-${String(this.nextMoc++).padStart(4, "0")}`,
        title: s.title,
        description: s.description,
        assetId: s.asset.data.id,
        siteId: s.asset.data.siteId,
        kind: s.kind,
        risk: s.risk,
        status: last.to,
        proposedBy: engineer,
        proposedAt: iso(proposedAt),
        updatedAt: last.at,
        history,
      };
    });
    return this.mocs;
  }

  listMocs(now: number, inScope: (assetId: string) => boolean): Moc[] {
    const order = { proposed: 0, under_review: 1, approved: 2, implemented: 3, rejected: 4 };
    return this.seedMocs(now)
      .filter((m) => inScope(m.assetId))
      .sort((a, b) => order[a.status] - order[b.status] || b.updatedAt.localeCompare(a.updatedAt));
  }

  createMoc(request: CreateMocRequest, by: string, now: number): Moc {
    const asset = this.world.assets.get(request.assetId);
    if (!asset) throw new ApiFailure("not_found", `Asset ${request.assetId} not found`);
    const moc: Moc = {
      id: `MOC-${String(this.nextMoc++).padStart(4, "0")}`,
      ...request,
      siteId: asset.data.siteId,
      status: "proposed",
      proposedBy: by,
      proposedAt: iso(now),
      updatedAt: iso(now),
      history: [{ at: iso(now), by, to: "proposed", note: null }],
    };
    this.seedMocs(now).push(moc);
    return moc;
  }

  transitionMoc(request: MocTransitionRequest, by: string, now: number): Moc {
    const moc = this.seedMocs(now).find((m) => m.id === request.mocId);
    if (!moc) throw new ApiFailure("not_found", `Change ${request.mocId} not found`);
    if (!MOC_TRANSITIONS[moc.status].includes(request.to)) {
      throw new ApiFailure("conflict", `A change that is ${moc.status} can't become ${request.to}`);
    }
    moc.status = request.to;
    moc.updatedAt = iso(now);
    moc.history.push({ at: iso(now), by, to: request.to, note: request.note ?? null });
    return moc;
  }

  // ─── Overview ────────────────────────────────────────────────────────────────

  overview(ctx: HseCtx): HseOverview {
    const snapshot = ctx.snapshot();
    const overdue = overdueAssets(ctx);
    const p1 = new Set(
      ctx
        .alarms()
        .filter((a) => a.priority === "p1" && (a.state === "active_unacked" || a.state === "active_acked"))
        .map((a) => a.assetId),
    );
    const sces: SafetyCriticalElement[] = [];
    for (const a of ctx.world.assets.values()) {
      if (!isSafetyCritical(a) || !ctx.inScope(a.data.id)) continue;
      const health = snapshot.conditions.get(a.data.id)?.health.state ?? "offline";
      const reasons: SceReason[] = [];
      if (health === "warning" || health === "critical") reasons.push("health");
      if (overdue.has(a.data.id)) reasons.push("pm_overdue");
      if (p1.has(a.data.id)) reasons.push("alarm");
      sces.push({ assetId: a.data.id, assetClass: a.data.assetClass, siteId: a.data.siteId, health, reasons });
    }
    sces.sort((x, y) => y.reasons.length - x.reasons.length || x.assetId.localeCompare(y.assetId));

    const incidents = this.listIncidents(ctx.failures(), ctx.now, ctx.inScope);
    const months = new Map<string, HseMonth>();
    const d = new Date(ctx.now);
    for (let i = 11; i >= 0; i--) {
      const key = iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).slice(0, 7);
      months.set(key, { month: key, tier1: 0, tier2: 0, nearMiss: 0, other: 0 });
    }
    for (const i of incidents) {
      const m = months.get(i.occurredAt.slice(0, 7));
      if (!m) continue;
      if (i.tier === 1) m.tier1++;
      else if (i.tier === 2) m.tier2++;
      else if (i.kind === "near_miss") m.nearMiss++;
      else m.other++;
    }
    const lastTier1 = incidents.find((i) => i.tier === 1);
    const permits = this.listPermits({}, ctx.inScope, ctx.workOrders);
    return {
      sces,
      counts: {
        sces: sces.length,
        impaired: sces.filter((s) => s.reasons.length > 0).length,
        permitsWaiting: permits.filter((p) => p.status === "requested").length,
        permitsIssued: permits.filter((p) => p.status === "issued").length,
        tier1: incidents.filter((i) => i.tier === 1).length,
        tier2: incidents.filter((i) => i.tier === 2).length,
        nearMisses: incidents.filter((i) => i.kind === "near_miss").length,
        openMoc: this.listMocs(ctx.now, ctx.inScope).filter((m) => ["proposed", "under_review", "approved"].includes(m.status)).length,
      },
      daysSinceTier1: lastTier1 ? Math.floor((ctx.now - Date.parse(lastTier1.occurredAt)) / DAY) : null,
      monthly: [...months.values()],
    };
  }
}
