/**
 * The scripted demo storyline (spec §9): compressor fouling on gas turbine CBC-GT-101,
 * played out over one simulated week —
 *
 *   day 0.0  started             fouling begins (invisible at first)
 *   day 0.9  anomaly_detected    deviation from baseline becomes measurable
 *   day 1.8  prediction_raised   model detects it, predicts failure in ~4 days
 *   day 3.6  alarm_raised        compressor efficiency crosses its alert limit
 *   day 4.2  work_order_created  water wash planned (auto-created if nobody did it)
 *   day 5.0  repaired            offline water wash done; values return to normal
 *   day 6.0  verified            recovery confirmed; prediction closed as a true positive
 *
 * Run it at 3600× speed and the whole week plays out in under 3 minutes.
 */
import { STORYLINE_PHASES, type StorylinePhase, type StorylineStatus, type TimelineEvent } from "@pdm/contracts";
import { faultTypeById } from "./catalog/fault-types";
import { STORYLINE_ASSET_ID } from "./catalog/sites";
import { DAY, iso } from "./clock";
import type { Fault } from "./model";
import { predictionId, type PredictionOverlay } from "./snapshot";
import type { WorkOrderStore } from "./work-orders";
import type { World } from "./world";

const PHASE_DAY: Record<StorylinePhase, number> = {
  started: 0,
  anomaly_detected: 0.9,
  prediction_raised: 1.8,
  alarm_raised: 3.6,
  work_order_created: 4.2,
  repaired: 5,
  verified: 6,
};
const FAILURE_DAY = 6; // when the turbine would fail if nobody acted
const STORY_DAYS = 7;

interface Run {
  startedAt: number;
  fault: Fault;
  workOrderId: string | null;
  done: Set<StorylinePhase>;
}

export class Storyline {
  private run: Run | null = null;

  constructor(
    private readonly world: World,
    private readonly workOrders: WorkOrderStore,
    private readonly overlays: Map<string, PredictionOverlay>,
    private readonly log: (event: Omit<TimelineEvent, "id" | "assetId">) => void,
  ) {}

  start(now: number): void {
    const asset = this.world.assets.get(STORYLINE_ASSET_ID);
    if (!asset) throw new Error(`Storyline asset ${STORYLINE_ASSET_ID} missing`);
    for (const f of this.world.faultsOf(STORYLINE_ASSET_ID)) if (f.resolvedAt === null) f.resolvedAt = now;
    const fault = this.world.addFault({
      type: faultTypeById("compressor_fouling"),
      asset,
      start: now,
      failAt: now + FAILURE_DAY * DAY,
      resolvedAt: null,
      rulBias: 0.05,
      dataQuality: null,
    });
    this.run = { startedAt: now, fault, workOrderId: null, done: new Set(["started"]) };
    this.log({ kind: "process", t: iso(now), title: "Demo storyline started: compressor fouling begins", detail: null, severity: null, refId: null });
  }

  tick(now: number): void {
    const run = this.run;
    if (!run) return;
    const day = (now - run.startedAt) / DAY;
    const at = (phase: StorylinePhase) => run.startedAt + PHASE_DAY[phase] * DAY;
    const reached = (phase: StorylinePhase) => day >= PHASE_DAY[phase] && !run.done.has(phase);
    const predId = predictionId(run.fault);

    if (reached("anomaly_detected")) {
      run.done.add("anomaly_detected");
      this.log({ kind: "process", t: iso(at("anomaly_detected")), title: "Compressor efficiency drifting below baseline", detail: "Ambient-corrected deviation −0.4%", severity: "watch", refId: null });
    }
    if (reached("prediction_raised")) run.done.add("prediction_raised");
    if (reached("alarm_raised")) run.done.add("alarm_raised");

    if (reached("work_order_created")) {
      run.done.add("work_order_created");
      // Did someone already create a work order for this asset during the story? Use it.
      const existing = this.workOrders.all().find((o) => o.assetId === STORYLINE_ASSET_ID && Date.parse(o.createdAt) >= run.startedAt);
      const wo =
        existing ??
        this.workOrders.create(
          {
            title: `Offline compressor water wash — ${STORYLINE_ASSET_ID}`,
            description: `Raised from prediction ${predId}: compressor fouling. Schedule offline wash at next low-demand window.`,
            assetId: STORYLINE_ASSET_ID,
            type: "predictive",
            priority: "high",
            assigneeId: this.world.usersWithRole("field_technician")[0]?.id ?? null,
            dueAt: iso(at("repaired")),
            source: { kind: "prediction", refId: predId },
            evidence: null,
          },
          this.world.usersWithRole("maintenance_planner")[0]?.id ?? "system",
          at("work_order_created"),
        );
      if (!existing) this.workOrders.setStatus(wo.id, "scheduled");
      run.workOrderId = wo.id;
      this.overlays.set(predId, { ...this.overlays.get(predId), status: "actioned", workOrderId: wo.id });
    }

    if (reached("repaired")) {
      run.done.add("repaired");
      run.fault.resolvedAt = at("repaired");
      if (run.workOrderId) this.workOrders.setStatus(run.workOrderId, "completed");
      this.log({ kind: "maintenance", t: iso(at("repaired")), title: "Offline compressor water wash completed", detail: "Unit returned to service", severity: null, refId: run.workOrderId });
    }

    if (reached("verified")) {
      run.done.add("verified");
      if (run.workOrderId) this.workOrders.setStatus(run.workOrderId, "verified");
      this.overlays.set(predId, { ...this.overlays.get(predId), status: "closed", feedback: "true_positive" });
      this.log({ kind: "process", t: iso(at("verified")), title: "Performance recovery verified after water wash", detail: "Compressor efficiency back to baseline; prediction confirmed", severity: "healthy", refId: predId });
    }
  }

  status(now: number): StorylineStatus | null {
    const run = this.run;
    if (!run) return null;
    const day = (now - run.startedAt) / DAY;
    const phase = [...STORYLINE_PHASES].reverse().find((p) => day >= PHASE_DAY[p]) ?? "started";
    return {
      assetId: STORYLINE_ASSET_ID,
      phase,
      startedAt: iso(run.startedAt),
      progress: Math.min(1, Math.max(0, day / STORY_DAYS)),
    };
  }
}
