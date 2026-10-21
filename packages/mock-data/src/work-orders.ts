/**
 * Work orders: ~6 months of history, plus predictive work orders already raised for some
 * of the faults, plus anything created through the API.
 */
import {
  FailureCauseCode,
  FailureModeCode,
  WorkOrderPriority,
  canTransition,
  type ChecklistItem,
  type ChecklistResult,
  type CloseOut,
  type CloseOutWorkOrderRequest,
  type CreateWorkOrderRequest,
  type RescheduleWorkOrderRequest,
  type TransitionWorkOrderRequest,
  type User,
  type WorkOrder,
  type WorkOrderEvent,
  type WorkOrderListParams,
  type WorkOrderStatus,
  type WorkOrderType,
} from "@pdm/contracts";
import { applyResults, checklistFor, nominalValue, requireDone } from "./checklists";
import { DAY, HOUR, iso } from "./clock";
import { DETECTION_PROGRESS, rawProgress, timeAtProgress } from "./faults";
import type { AssetRecord } from "./model";
import { ApiFailure } from "./errors";
import { Rng } from "./random";
import { predictionId, type PredictionOverlay } from "./snapshot";
import type { World } from "./world";

const HISTORY_COUNT = 360;
const HISTORY_DAYS = 180;

export const OPEN_STATUSES: readonly WorkOrderStatus[] = ["requested", "triaged", "planned", "scheduled", "approved", "in_progress"];

const TYPE_WEIGHTS: readonly (readonly [WorkOrderType, number])[] = [
  ["preventive", 40],
  ["corrective", 25],
  ["inspection", 15],
  ["predictive", 8],
  ["calibration", 6],
  ["condition_based", 3],
  ["regulatory", 2],
  ["shutdown", 1],
];

const PRIORITY_WEIGHTS: readonly (readonly [WorkOrderPriority, number])[] = [
  ["emergency", 2],
  ["urgent", 8],
  ["high", 20],
  ["normal", 55],
  ["low", 15],
];

function statusForAge(rng: Rng, ageDays: number): WorkOrderStatus {
  if (ageDays > 30)
    return rng.weighted([
      ["closed", 88],
      ["cancelled", 4],
      ["verified", 4],
      ["completed", 4],
    ]);
  if (ageDays > 7) {
    return rng.weighted([
      ["closed", 30],
      ["completed", 15],
      ["in_progress", 15],
      ["scheduled", 20],
      ["planned", 10],
      ["approved", 10],
    ]);
  }
  return rng.weighted([
    ["requested", 30],
    ["triaged", 20],
    ["planned", 20],
    ["scheduled", 15],
    ["in_progress", 15],
  ]);
}

/** The normal route through the lifecycle, used to give seeded work orders a believable past. */
const LIFECYCLE: readonly WorkOrderStatus[] = [
  "requested",
  "triaged",
  "planned",
  "scheduled",
  "approved",
  "in_progress",
  "completed",
  "verified",
  "closed",
];

function pastHistory(
  rng: Rng,
  status: WorkOrderStatus,
  createdAt: number,
  now: number,
  plannerId: string,
  technicianId: string | null,
): WorkOrderEvent[] {
  const steps =
    status === "cancelled"
      ? [...LIFECYCLE.slice(0, rng.int(1, 4)), "cancelled" as const]
      : LIFECYCLE.slice(0, LIFECYCLE.indexOf(status) + 1);
  const span = Math.max(HOUR, Math.min(now, createdAt + 20 * DAY) - createdAt);
  return steps.map((to, i) => ({
    at: iso(createdAt + ((span * i) / Math.max(1, steps.length - 1)) * (i === 0 ? 0 : rng.between(0.85, 1))),
    by: (to === "in_progress" || to === "completed") && technicianId ? technicianId : plannerId,
    from: i === 0 ? null : (steps[i - 1] ?? null),
    to,
    note: to === "cancelled" ? "Duplicate request" : null,
  }));
}

function scheduledStartFrom(history: readonly WorkOrderEvent[]): string | null {
  const scheduled = history.find((e) => e.to === "scheduled");
  return scheduled ? iso(Date.parse(scheduled.at) + DAY) : null;
}

const FINDINGS = [
  "Found wear consistent with the reported symptoms; replaced and tested OK.",
  "Inspected per procedure. Minor deposits cleaned; parameters back within limits.",
  "Seal found weeping at the drive end. Replaced seal kit and re-aligned coupling.",
  "Transmitter reading drifted; recalibrated against reference and returned to service.",
  "No defect found on inspection. Monitoring to continue.",
];

function closeOutFrom(rng: Rng, history: readonly WorkOrderEvent[], technicianId: string | null, predictive: boolean): CloseOut | null {
  const completed = history.find((e) => e.to === "completed");
  if (!completed) return null;
  return {
    failureMode: rng.pick(FailureModeCode.options),
    cause: rng.pick(FailureCauseCode.options),
    remedy: rng.weighted([
      ["replace", 30],
      ["repair", 25],
      ["adjust", 15],
      ["service", 15],
      ["check", 10],
      ["overhaul", 5],
    ] as const),
    findings: rng.pick(FINDINGS),
    laborHours: Math.round(rng.between(1, 24) * 2) / 2,
    predictionVerdict: predictive
      ? rng.weighted([
          ["true_positive", 85],
          ["false_positive", 10],
          ["found_something_else", 5],
        ] as const)
      : null,
    completedAt: completed.at,
    completedBy: technicianId ?? completed.by,
  };
}

/** Seeded work orders: safety confirmed once work started, everything done once completed. */
function seededChecklist(world: World, type: WorkOrderType, asset: AssetRecord, status: WorkOrderStatus): ChecklistItem[] {
  const checklist = checklistFor(type, asset);
  const started = ["in_progress", "completed", "verified", "closed"].includes(status);
  const finished = ["completed", "verified", "closed"].includes(status);
  for (const item of checklist) {
    if (item.kind === "safety" ? started : finished) {
      item.done = true;
      if (item.kind === "reading") item.value = nominalValue(item.tagId ? world.tags.get(item.tagId) : undefined);
    }
  }
  return checklist;
}

/** Typical duration in working hours, [shortest, longest], by type of work. */
const HOURS: Record<WorkOrderType, readonly [number, number]> = {
  preventive: [2, 6],
  corrective: [3, 12],
  inspection: [1, 4],
  calibration: [2, 4],
  predictive: [4, 16],
  condition_based: [4, 16],
  regulatory: [4, 8],
  shutdown: [24, 72],
};

const typicalHours = (type: WorkOrderType): number => Math.round(((HOURS[type][0] + HOURS[type][1]) / 2) * 2) / 2;

/** Midnight UTC of the day `ms` falls in. */
const dayStart = (ms: number) => Math.floor(ms / DAY) * DAY;

function titleFor(rng: Rng, type: WorkOrderType, asset: AssetRecord): string {
  const name = asset.data.id;
  switch (type) {
    case "preventive":
      return `${rng.pick(["Monthly", "Quarterly", "Annual"])} PM — ${name}`;
    case "corrective":
      return `${rng.pick(["Repair leak on", "Replace failed seal on", "Investigate trip of", "Replace faulty transmitter on"])} ${name}`;
    case "inspection":
      return `${rng.pick(["Visual inspection", "Thermographic survey", "UT thickness survey"])} — ${name}`;
    case "calibration":
      return `Calibrate instruments — ${name}`;
    case "predictive":
      return `Condition-based intervention — ${name}`;
    case "condition_based":
      return `Condition-based service — ${name}`;
    case "regulatory":
      return `Statutory inspection — ${name}`;
    case "shutdown":
      return `Turnaround scope item — ${name}`;
  }
}

export class WorkOrderStore {
  private orders: WorkOrder[] = [];
  private nextNumber = 10001;

  constructor(
    private readonly world: World,
    now: number,
    overlays: Map<string, PredictionOverlay>,
  ) {
    this.seedHistory(now);
    this.seedPredictive(now, overlays);
    this.orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const wo of this.orders) {
      const number = this.nextNumber++;
      const oldId = wo.id;
      wo.id = `wo-${number}`;
      wo.number = `WO-${number}`;
      for (const overlay of overlays.values()) if (overlay.workOrderId === oldId) overlay.workOrderId = wo.id;
    }
    this.seedSchedule(now);
  }

  /**
   * Durations, and start times for work that hasn't happened yet: scheduled and approved
   * work starts in the next two weeks (07:00 or 13:00 UTC), work in progress started in the
   * last day or so. A separate random stream, so the rest of the seeded data is unchanged.
   */
  private seedSchedule(now: number): void {
    const rng = Rng.for(this.world.seed, "work-order-schedule");
    const today = dayStart(now);
    for (const wo of this.orders) {
      const [low, high] = HOURS[wo.type];
      wo.estimatedHours = Math.round(rng.between(low, high) * 2) / 2;
      if (wo.status === "scheduled" || wo.status === "approved") {
        wo.scheduledStart = iso(today + rng.int(1, 13) * DAY + (rng.chance(0.7) ? 7 : 13) * HOUR);
      } else if (wo.status === "in_progress") {
        wo.scheduledStart = iso(now - rng.between(2, 30) * HOUR);
      }
    }
  }

  private technicians(asset: AssetRecord): User[] {
    const all = this.world.usersWithRole("field_technician");
    const local = all.filter((u) => u.siteIds.includes(asset.data.siteId));
    return local.length > 0 ? local : all;
  }

  private seedHistory(now: number): void {
    const rng = Rng.for(this.world.seed, "work-orders");
    // Critical equipment gets more work orders: weight = criticality².
    const assets = [...this.world.assets.values()];
    const cumulative: number[] = [];
    let total = 0;
    for (const a of assets) cumulative.push((total += a.data.criticality ** 2));
    const planners = this.world.usersWithRole("maintenance_planner");

    for (let i = 0; i < HISTORY_COUNT; i++) {
      const roll = rng.next() * total;
      const asset = assets[cumulative.findIndex((c) => c > roll)] ?? assets[0];
      if (!asset) continue;
      const createdAt = now - rng.between(0, HISTORY_DAYS) * DAY;
      const type = rng.weighted(TYPE_WEIGHTS);
      const status = statusForAge(rng, (now - createdAt) / DAY);
      const assigned = !["requested", "triaged"].includes(status);
      const createdBy = rng.pick(planners).id;
      const assigneeId = assigned ? rng.pick(this.technicians(asset)).id : null;
      const history = pastHistory(rng, status, createdAt, now, createdBy, assigneeId);
      this.orders.push({
        id: `tmp-${i}`,
        number: "WO-0",
        title: titleFor(rng, type, asset),
        description: `${type.replace("_", " ")} work on ${asset.data.name}.`,
        assetId: asset.data.id,
        type,
        priority: rng.weighted(PRIORITY_WEIGHTS),
        status,
        createdAt: iso(createdAt),
        createdBy,
        assigneeId,
        dueAt: iso(createdAt + rng.between(3, 30) * DAY),
        scheduledStart: scheduledStartFrom(history),
        estimatedHours: typicalHours(type), // replaced in seedSchedule
        source: { kind: type === "predictive" ? "prediction" : "manual", refId: null },
        evidence: null,
        history,
        checklist: seededChecklist(this.world, type, asset, status),
        closeOut: closeOutFrom(rng, history, assigneeId, type === "predictive"),
      });
    }
  }

  /** About half of the well-advanced faults already have a predictive work order in the plan. */
  private seedPredictive(now: number, overlays: Map<string, PredictionOverlay>): void {
    const rng = Rng.for(this.world.seed, "predictive-work-orders");
    const planners = this.world.usersWithRole("maintenance_planner");
    for (const fault of this.world.faults) {
      if (rawProgress(fault, now) < 0.6 || !rng.chance(0.5)) continue;
      const createdAt = Math.min(now - HOUR, timeAtProgress(fault, DETECTION_PROGRESS) + rng.between(1, 3) * DAY);
      const id = `tmp-pred-${fault.id}`;
      const asset = fault.asset;
      const status = rng.pick(["planned", "scheduled", "approved"] as const);
      const createdBy = rng.pick(planners).id;
      const assigneeId = rng.pick(this.technicians(asset)).id;
      const history = pastHistory(rng, status, createdAt, now, createdBy, assigneeId);
      this.orders.push({
        id,
        number: "WO-0",
        title: `${fault.type.action} — ${asset.data.id}`,
        description: `Raised from prediction ${predictionId(fault)} (${fault.type.failureMode.label}).`,
        assetId: asset.data.id,
        type: "predictive",
        priority: asset.data.criticality >= 4 ? "high" : "normal",
        status,
        createdAt: iso(createdAt),
        createdBy,
        assigneeId,
        dueAt: iso(Math.min(fault.failAt, now + rng.between(2, 14) * DAY)),
        scheduledStart: scheduledStartFrom(history),
        estimatedHours: typicalHours("predictive"), // replaced in seedSchedule
        source: { kind: "prediction", refId: predictionId(fault) },
        evidence: null,
        history,
        checklist: seededChecklist(this.world, "predictive", asset, status),
        closeOut: null,
      });
      overlays.set(predictionId(fault), { status: "actioned", workOrderId: id });
    }
  }

  create(request: CreateWorkOrderRequest, createdBy: string, now: number): WorkOrder {
    const asset = this.world.assets.get(request.assetId);
    if (!asset) throw new ApiFailure("not_found", `Asset ${request.assetId} not found`);
    const number = this.nextNumber++;
    const wo: WorkOrder = {
      ...request,
      estimatedHours: request.estimatedHours ?? typicalHours(request.type),
      id: `wo-${number}`,
      number: `WO-${number}`,
      status: "requested",
      createdAt: iso(now),
      createdBy,
      scheduledStart: null,
      history: [{ at: iso(now), by: createdBy, from: null, to: "requested", note: null }],
      checklist: checklistFor(request.type, asset),
      closeOut: null,
    };
    this.orders.push(wo);
    return wo;
  }

  get(id: string): WorkOrder {
    const wo = this.orders.find((o) => o.id === id);
    if (!wo) throw new ApiFailure("not_found", `Work order ${id} not found`);
    return wo;
  }

  /** Move through the lifecycle. Refuses moves that WORK_ORDER_TRANSITIONS doesn't allow. */
  transition(request: TransitionWorkOrderRequest, by: string, now: number): WorkOrder {
    const wo = this.get(request.workOrderId);
    if (!canTransition(wo.status, request.to)) {
      throw new ApiFailure("conflict", `A work order that is ${wo.status} can't move to ${request.to}`);
    }
    if (request.to === "scheduled") {
      const start = request.scheduledStart ?? wo.scheduledStart;
      const assignee = request.assigneeId ?? wo.assigneeId;
      if (!start || !assignee) throw new ApiFailure("bad_request", "Scheduling needs a start time and someone assigned");
      wo.scheduledStart = start;
      wo.assigneeId = assignee;
    } else if (request.assigneeId) {
      wo.assigneeId = request.assigneeId;
    }
    if (request.checklist) applyResults(wo.checklist, request.checklist);
    if (wo.status === "approved" && request.to === "in_progress") {
      requireDone(wo.checklist, ["safety"], "Confirm every safety check before starting");
    }
    this.record(wo, request.to, by, now, request.note ?? null);
    return wo;
  }

  /** The technician's close-out: ISO 14224 coding, findings and hours. in_progress → completed. */
  closeOut(request: CloseOutWorkOrderRequest, by: string, now: number): WorkOrder {
    const wo = this.get(request.workOrderId);
    if (wo.status !== "in_progress") throw new ApiFailure("conflict", `Only work in progress can be closed out (this one is ${wo.status})`);
    const { workOrderId: _id, checklist, ...fields } = request;
    applyResults(wo.checklist, checklist);
    requireDone(wo.checklist, ["safety", "step", "reading"], "Finish the required checklist items first");
    wo.closeOut = { ...fields, completedAt: iso(now), completedBy: by };
    this.record(wo, "completed", by, now, null);
    return wo;
  }

  /** Every line done, readings at normal values — for when the simulation does the work itself. */
  completedChecklist(id: string): ChecklistResult[] {
    return this.get(id).checklist.map((item) => ({
      itemId: item.id,
      done: true,
      value: item.kind === "reading" ? nominalValue(item.tagId ? this.world.tags.get(item.tagId) : undefined) : null,
    }));
  }

  /**
   * The schedule board: a new start time or technician. Allowed for scheduled and approved
   * work; approved work goes back to "scheduled" to be approved again.
   */
  reschedule(request: RescheduleWorkOrderRequest, by: string, now: number): WorkOrder {
    const wo = this.get(request.workOrderId);
    if (wo.status !== "scheduled" && wo.status !== "approved") {
      throw new ApiFailure("conflict", `Only scheduled or approved work can be rescheduled (this one is ${wo.status})`);
    }
    const assignee = this.world.users.find((u) => u.id === request.assigneeId);
    if (!assignee || assignee.role !== "field_technician")
      throw new ApiFailure("bad_request", `${request.assigneeId} is not a field technician`);
    wo.scheduledStart = request.scheduledStart;
    wo.assigneeId = assignee.id;
    const note = request.note ?? `Rescheduled to ${request.scheduledStart.slice(0, 16).replace("T", " ")} UTC, ${assignee.name}`;
    // Approved → scheduled is an allowed move; scheduled stays scheduled, with the change in its history.
    this.record(wo, "scheduled", by, now, note);
    return wo;
  }

  /** Used by the storyline; goes through the history like any other change. */
  setStatus(id: string, status: WorkOrderStatus, now: number, note: string | null = null): WorkOrder {
    const wo = this.get(id);
    if (status === "scheduled" && !wo.scheduledStart) wo.scheduledStart = iso(now + DAY);
    this.record(wo, status, "system", now, note);
    return wo;
  }

  private record(wo: WorkOrder, to: WorkOrderStatus, by: string, now: number, note: string | null): void {
    wo.history.push({ at: iso(now), by, from: wo.status, to, note });
    wo.status = to;
  }

  query(params: Omit<WorkOrderListParams, "offset" | "limit">, inScope: (assetId: string) => boolean): WorkOrder[] {
    const priorityRank = (p: WorkOrder["priority"]) => WorkOrderPriority.options.indexOf(p);
    const sorters = {
      newest: (a: WorkOrder, b: WorkOrder) => b.createdAt.localeCompare(a.createdAt),
      due: (a: WorkOrder, b: WorkOrder) => (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"),
      priority: (a: WorkOrder, b: WorkOrder) =>
        priorityRank(a.priority) - priorityRank(b.priority) || (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999"),
      start: (a: WorkOrder, b: WorkOrder) => (a.scheduledStart ?? "9999").localeCompare(b.scheduledStart ?? "9999"),
    };
    return this.orders
      .filter((o) => !params.assetId || o.assetId === params.assetId)
      .filter((o) => !params.assigneeId || o.assigneeId === params.assigneeId)
      .filter((o) => !params.status || params.status.includes(o.status))
      .filter((o) => !params.type || params.type.includes(o.type))
      .filter((o) => !params.priority || params.priority.includes(o.priority))
      .filter((o) => !params.scheduledFrom || (o.scheduledStart !== null && o.scheduledStart >= params.scheduledFrom))
      .filter((o) => !params.scheduledTo || (o.scheduledStart !== null && o.scheduledStart < params.scheduledTo))
      .filter((o) => inScope(o.assetId))
      .sort(sorters[params.sort]);
  }

  all(): readonly WorkOrder[] {
    return this.orders;
  }
}
