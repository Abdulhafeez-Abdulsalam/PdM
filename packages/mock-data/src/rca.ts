/**
 * FMEA scoring and the root-cause analysis store.
 *
 * FMEA: each failure mode a type of equipment has (the LIVES table) scored 1–10 for severity
 * (how bad), occurrence (how often, from the failure history) and detection (how likely we
 * catch it first: better where a predictive model watches for it), with a maintenance strategy
 * from its Weibull pattern.
 *
 * RCA: investigations kept in memory, like comments. Two are seeded on bad actors.
 */
import {
  FAILURE_HISTORY_YEARS,
  FISHBONE_CATEGORIES,
  FMEA_RPN_ACT,
  FMEA_SEVERITY_ACT,
  type AddActionRequest,
  type AssetClass,
  type CreateRcaRequest,
  type FailureModeCode,
  type FailureRecord,
  type Fishbone,
  type Fmea,
  type FmeaRow,
  type MaintenanceStrategy,
  type Prediction,
  type Rca,
  type RcaEvent,
  type RcaSummary,
  type UpdateRcaRequest,
} from "@pdm/contracts";
import { FAULT_TYPES } from "./catalog/fault-types";
import { DAY, iso } from "./clock";
import { ApiFailure } from "./errors";
import { LIVES } from "./reliability";
import { weibullAnalysis } from "./weibull";
import type { WorkOrderStore } from "./work-orders";
import type { World } from "./world";

const YEAR = 365.25 * DAY;

// ─── FMEA ────────────────────────────────────────────────────────────────────

/** How bad each mode usually is (1–10). A process leak or structural failure is worse than a spurious stop. */
const SEVERITY: Record<FailureModeCode, number> = {
  STD: 9,
  ELP: 8,
  BRD: 7,
  OHE: 6,
  FTS: 6,
  INL: 6,
  VIB: 5,
  PLU: 5,
  ELU: 4,
  LOO: 4,
  PDE: 4,
  ERO: 4,
  UST: 3,
  AIR: 3,
  NOI: 2,
  OTH: 3,
};

/** How hard each mode is to see coming (1 = obvious, 10 = invisible until it happens) without a predictive model. */
const DETECTION: Record<FailureModeCode, number> = {
  VIB: 4,
  OHE: 4,
  PDE: 4,
  AIR: 3,
  PLU: 5,
  LOO: 5,
  ERO: 5,
  NOI: 5,
  ELP: 6,
  ELU: 6,
  STD: 6,
  INL: 7,
  BRD: 7,
  FTS: 8,
  UST: 9,
  OTH: 6,
};

/** Occurrence from failures per asset per year. */
const OCCURRENCE_BOUNDS = [0.01, 0.02, 0.05, 0.1, 0.2, 0.35, 0.5, 1, 2];
export const occurrenceScore = (rate: number) => {
  const i = OCCURRENCE_BOUNDS.findIndex((b) => rate < b);
  return i === -1 ? 10 : i + 1;
};

export function strategyFor(row: Pick<FmeaRow, "severity" | "monitored" | "pattern">): MaintenanceStrategy {
  if (row.severity <= 3 && !row.monitored) return "run_to_failure";
  if (row.monitored) return "condition_based";
  if (row.pattern === "wear_out") return "time_based";
  if (row.pattern === "infant_mortality") return "redesign";
  return "condition_based";
}

export function fmea(input: {
  world: World;
  failures: readonly FailureRecord[];
  workOrders: WorkOrderStore;
  now: number;
  assetClass: AssetClass;
}): Fmea {
  const { world, now, assetClass } = input;
  const assets = [...world.assets.values()].filter((a) => a.data.assetClass === assetClass);
  const ids = new Set(assets.map((a) => a.data.id));
  const from = now - FAILURE_HISTORY_YEARS * YEAR;
  const assetYears = assets.reduce((s, a) => s + Math.max(0, now - Math.max(from, Date.parse(a.data.commissionedAt))) / YEAR, 0);
  const critical = assets.length > 0 && assets.reduce((s, a) => s + a.data.criticality, 0) / assets.length >= 4;
  const failures = input.failures.filter((f) => ids.has(f.assetId) && Date.parse(f.failedAt) >= from);

  const rows: FmeaRow[] = (LIVES[assetClass] ?? []).map((life) => {
    const n = failures.filter((f) => f.mode === life.mode).length;
    const rate = assetYears > 0 ? n / assetYears : 0;
    const monitored = FAULT_TYPES.some((ft) => ft.appliesTo.includes(assetClass) && ft.failureMode.code === life.mode);
    const severity = Math.min(10, SEVERITY[life.mode] + (critical ? 1 : 0));
    const occurrence = occurrenceScore(rate);
    const detection = Math.max(1, DETECTION[life.mode] - (monitored ? 3 : 0));
    const fit = weibullAnalysis({
      world,
      failures: input.failures,
      now,
      request: { assetClass, mode: life.mode },
      inScope: () => true,
    }).fit;
    const rpn = severity * occurrence * detection;
    const row = {
      mode: life.mode,
      cause: life.cause,
      severity,
      occurrence,
      detection,
      rpn,
      act: rpn >= FMEA_RPN_ACT || severity >= FMEA_SEVERITY_ACT,
      ratePerAssetYear: Math.round(rate * 1000) / 1000,
      failures: n,
      monitored,
      pattern: fit?.pattern ?? null,
      b10Days: fit?.b10Days ?? null,
    };
    return { ...row, strategy: strategyFor(row) };
  });
  rows.sort((a, b) => b.rpn - a.rpn || a.mode.localeCompare(b.mode));

  const plannedPreventive = input.workOrders
    .all()
    .filter((o) => o.type === "preventive" && ids.has(o.assetId) && !["completed", "closed", "cancelled"].includes(o.status)).length;
  return { assetClass, assets: assets.length, rows, plannedPreventive };
}

// ─── RCA ─────────────────────────────────────────────────────────────────────

type Stored = Omit<Rca, "timeline">;

const emptyFishbone = (): Fishbone => Object.fromEntries(FISHBONE_CATEGORIES.map((c) => [c, []])) as unknown as Fishbone;

export class RcaStore {
  private readonly items = new Map<string, Stored>();
  private next = 1;
  private seeded = false;

  constructor(
    private readonly world: World,
    private readonly workOrders: WorkOrderStore,
    private readonly failures: () => readonly FailureRecord[],
    private readonly predictions: () => readonly Prediction[],
  ) {}

  private id(): string {
    return `RCA-${String(this.next++).padStart(3, "0")}`;
  }

  /** Two investigations already under way, on the two most-failing assets: one well along, one just opened. */
  private seed(): void {
    if (this.seeded) return;
    this.seeded = true;
    const at = this.world.createdAt;
    const counts = new Map<string, number>();
    for (const f of this.failures()) if (Date.parse(f.failedAt) >= at - YEAR) counts.set(f.assetId, (counts.get(f.assetId) ?? 0) + 1);
    const worst = [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 2);
    const [first, second] = worst.map(([assetId]) => this.world.assets.get(assetId)!);
    if (first) {
      const last = this.failures()
        .filter((f) => f.assetId === first.data.id)
        .at(-1);
      const rca = this.make(first.data.id, `Repeated ${last ? last.mode : "failures"} on ${first.data.id}`, last?.id ?? null, at - 6 * DAY);
      rca.status = "in_review";
      rca.whys = [
        "The unit tripped again on the same failure.",
        "The part replaced last time failed early.",
        "It was fitted without the alignment check the procedure calls for.",
        "The alignment tool for this size wasn't in the site store.",
        "Nobody owns the tooling list for this equipment type.",
      ];
      rca.fishbone = {
        ...emptyFishbone(),
        people: ["Alignment step skipped under time pressure"],
        machine: ["Base plate worn at the mounting points"],
        method: ["Procedure doesn't say who checks alignment"],
        material: ["Replacement part from a different supplier"],
        measurement: ["No vibration reading taken after the repair"],
        environment: ["Night shift, poor lighting in the bay"],
      };
      rca.rootCause = "No one owns the tooling and the post-repair check for this equipment type, so repairs skip alignment.";
      rca.actions = [
        {
          id: `${rca.id}-A1`,
          text: "Add a post-repair vibration check to the repair procedure",
          workOrderId: null,
          workOrderNumber: null,
          createdAt: iso(at - 5 * DAY),
        },
      ];
      rca.updatedAt = iso(at - 2 * DAY);
    }
    if (second) this.make(second.data.id, `Why does ${second.data.id} keep failing?`, null, at - DAY);
  }

  private make(assetId: string, title: string, failureId: string | null, t: number): Stored {
    const asset = this.world.assets.get(assetId);
    if (!asset) throw new ApiFailure("not_found", `Asset ${assetId} not found`);
    const rca: Stored = {
      id: this.id(),
      assetId,
      assetName: asset.data.name,
      assetClass: asset.data.assetClass,
      title,
      failureId,
      status: "open",
      whys: ["", "", "", "", ""],
      fishbone: emptyFishbone(),
      rootCause: "",
      actions: [],
      createdAt: iso(t),
      updatedAt: iso(t),
    };
    this.items.set(rca.id, rca);
    return rca;
  }

  private stored(rcaId: string): Stored {
    this.seed();
    const r = this.items.get(rcaId);
    if (!r) throw new ApiFailure("not_found", `Root-cause analysis ${rcaId} not found`);
    return r;
  }

  list(assetId?: string): RcaSummary[] {
    this.seed();
    return [...this.items.values()]
      .filter((r) => !assetId || r.assetId === assetId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || b.id.localeCompare(a.id))
      .map((r) => ({
        id: r.id,
        assetId: r.assetId,
        assetClass: r.assetClass,
        title: r.title,
        status: r.status,
        updatedAt: r.updatedAt,
        actions: r.actions.length,
      }));
  }

  get(rcaId: string): Rca {
    const r = this.stored(rcaId);
    return { ...r, timeline: this.timeline(r) };
  }

  create(request: CreateRcaRequest, now: number): Rca {
    this.seed();
    return this.get(this.make(request.assetId, request.title, request.failureId, now).id);
  }

  update(request: UpdateRcaRequest, now: number): Rca {
    const r = this.stored(request.rcaId);
    if (r.status === "closed" && request.status !== "open")
      throw new ApiFailure("conflict", "This analysis is closed; reopen it to change it");
    if (request.status === "closed" && !(request.rootCause ?? r.rootCause).trim()) {
      throw new ApiFailure("bad_request", "Write down the root cause before closing the analysis");
    }
    if (request.whys) r.whys = request.whys;
    if (request.fishbone) r.fishbone = request.fishbone;
    if (request.rootCause !== undefined) r.rootCause = request.rootCause;
    if (request.status) r.status = request.status;
    r.updatedAt = iso(now);
    return this.get(r.id);
  }

  addAction(request: AddActionRequest, by: string, now: number): Rca {
    const r = this.stored(request.rcaId);
    if (r.status === "closed") throw new ApiFailure("conflict", "This analysis is closed; reopen it to add actions");
    let wo: { id: string; number: string } | null = null;
    if (request.createWorkOrder) {
      wo = this.workOrders.create(
        {
          title: request.text.slice(0, 120),
          description: `Corrective action from root-cause analysis ${r.id}: ${r.title}`,
          assetId: r.assetId,
          type: "corrective",
          priority: "normal",
          assigneeId: null,
          dueAt: null,
          source: { kind: "rca", refId: r.id },
          evidence: null,
        },
        by,
        now,
      );
    }
    r.actions.push({
      id: `${r.id}-A${r.actions.length + 1}`,
      text: request.text,
      workOrderId: wo?.id ?? null,
      workOrderNumber: wo?.number ?? null,
      createdAt: iso(now),
    });
    r.updatedAt = iso(now);
    return this.get(r.id);
  }

  /** What happened to the asset around the investigation: its failures, work orders and predictions. */
  private timeline(r: Stored): RcaEvent[] {
    const failure = r.failureId ? this.failures().find((f) => f.id === r.failureId) : undefined;
    const centre = failure ? Date.parse(failure.failedAt) : Date.parse(r.createdAt);
    const from = centre - 180 * DAY;
    const to = Math.max(centre + 60 * DAY, Date.parse(r.updatedAt));
    const inside = (t: string) => Date.parse(t) >= from && Date.parse(t) <= to;
    const events: RcaEvent[] = [
      ...this.failures()
        .filter((f) => f.assetId === r.assetId && inside(f.failedAt))
        .map((f) => ({ t: f.failedAt, kind: "failure" as const, title: `${f.mode} · ${f.cause}`, refId: f.id })),
      ...this.workOrders
        .all()
        .filter((o) => o.assetId === r.assetId && inside(o.createdAt))
        .map((o) => ({ t: o.createdAt, kind: "work_order" as const, title: o.title, refId: o.id })),
      ...this.predictions()
        .filter((p) => p.assetId === r.assetId && inside(p.detectedAt))
        .map((p) => ({ t: p.detectedAt, kind: "prediction" as const, title: p.failureMode.label, refId: p.id })),
    ];
    return events.sort((a, b) => a.t.localeCompare(b.t));
  }
}
