import { z } from "zod";
import { Id, PageParams, ScopeId, Timestamp } from "./common";
import { FailureCauseCode, FailureModeCode, RemedyCode } from "./iso14224";
import { PredictionFeedback } from "./predictions";
import { LiveValue } from "./timeseries";

export const WorkOrderType = z.enum([
  "corrective",
  "preventive",
  "predictive",
  "condition_based",
  "inspection",
  "calibration",
  "shutdown",
  "regulatory",
]);
export type WorkOrderType = z.infer<typeof WorkOrderType>;

/** The full lifecycle from the spec. Phase 1 only creates work orders; Phase 2 moves them through it. */
export const WorkOrderStatus = z.enum([
  "requested",
  "triaged",
  "planned",
  "scheduled",
  "approved",
  "in_progress",
  "completed",
  "verified",
  "closed",
  "cancelled",
]);
export type WorkOrderStatus = z.infer<typeof WorkOrderStatus>;

export const WorkOrderPriority = z.enum(["emergency", "urgent", "high", "normal", "low"]);
export type WorkOrderPriority = z.infer<typeof WorkOrderPriority>;

/** Where the work order came from — keeps the trail from alarm/prediction to repair. */
export const WorkOrderSource = z.object({
  kind: z.enum(["alarm", "prediction", "manual"]),
  refId: Id.nullable(),
});

/** Frozen copy of the readings when the work order was raised, so the technician sees what the operator saw. */
export const EvidenceSnapshot = z.object({
  capturedAt: Timestamp,
  values: z.array(LiveValue).max(20),
  note: z.string().max(1000).nullable(),
});
export type EvidenceSnapshot = z.infer<typeof EvidenceSnapshot>;

/**
 * The lifecycle, as allowed moves (spec §6.6): request → triage → plan → schedule → approve →
 * execute → complete → verify → close. Any open work order can be cancelled. Shared by the
 * UI (which buttons/columns are valid) and every backend (which requests to refuse).
 * `completed` is reached only through close-out, which records what was found.
 */
export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, readonly WorkOrderStatus[]> = {
  requested: ["triaged", "cancelled"],
  triaged: ["planned", "cancelled"],
  planned: ["scheduled", "cancelled"],
  scheduled: ["approved", "planned", "cancelled"],
  approved: ["in_progress", "scheduled", "cancelled"],
  in_progress: ["cancelled"], // → completed via close-out
  completed: ["verified", "in_progress"], // reopen if verification fails
  verified: ["closed"],
  closed: [],
  cancelled: [],
};

export function canTransition(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return WORK_ORDER_TRANSITIONS[from].includes(to);
}

/** One step in a work order's history — who moved it, when, and why. */
export const WorkOrderEvent = z.object({
  at: Timestamp,
  by: Id,
  from: WorkOrderStatus.nullable(),
  to: WorkOrderStatus,
  note: z.string().max(1000).nullable(),
});
export type WorkOrderEvent = z.infer<typeof WorkOrderEvent>;

/** Recorded by the technician when the work is done (ISO 14224 coding + findings). */
export const CloseOut = z.object({
  failureMode: FailureModeCode,
  cause: FailureCauseCode,
  remedy: RemedyCode,
  findings: z.string().trim().min(10).max(4000),
  laborHours: z.number().min(0).max(1000),
  /** For predictive work: did the predicted problem exist? Closes the feedback loop from the field. */
  predictionVerdict: PredictionFeedback.nullable(),
  completedAt: Timestamp,
  completedBy: Id,
});
export type CloseOut = z.infer<typeof CloseOut>;

/**
 * One line of a work order's checklist (spec §6.14: "checklists with required fields").
 *  - safety:  confirmed before work may start (permit, isolation/LOTO, gas test)
 *  - step:    a task to tick off while working
 *  - reading: a measurement to enter, e.g. bearing vibration taken with a hand-held meter
 */
export const ChecklistItemKind = z.enum(["safety", "step", "reading"]);
export type ChecklistItemKind = z.infer<typeof ChecklistItemKind>;

export const ChecklistItem = z.object({
  id: z.string().min(1),
  kind: ChecklistItemKind,
  label: z.string().min(3).max(200),
  required: z.boolean(),
  /** Reading items: the tag being measured. Its quantity gives the unit and its alert limits the expected range. */
  tagId: Id.nullable(),
  done: z.boolean(),
  /** Reading items: the value entered, in the tag's canonical unit. */
  value: z.number().nullable(),
});
export type ChecklistItem = z.infer<typeof ChecklistItem>;

/** What the technician sends back for one checklist line. */
export const ChecklistResult = z.object({
  itemId: z.string().min(1),
  done: z.boolean(),
  value: z.number().nullable(),
});
export type ChecklistResult = z.infer<typeof ChecklistResult>;

/** Is this line finished? A reading counts once a value is entered. */
export function isChecklistItemDone(item: Pick<ChecklistItem, "kind" | "done" | "value">): boolean {
  return item.kind === "reading" ? item.value !== null : item.done;
}

export const WorkOrder = z.object({
  id: Id,
  /** Human-friendly number, e.g. "WO-10482". */
  number: z.string().regex(/^WO-\d+$/),
  title: z.string().min(3).max(120),
  description: z.string().max(4000),
  assetId: Id,
  type: WorkOrderType,
  priority: WorkOrderPriority,
  status: WorkOrderStatus,
  createdAt: Timestamp,
  createdBy: Id,
  assigneeId: Id.nullable(),
  dueAt: Timestamp.nullable(),
  /** Planned start, set when scheduled. */
  scheduledStart: Timestamp.nullable(),
  /** How long the work is expected to take, in working hours. Draws its bar on the schedule board. */
  estimatedHours: z.number().min(0.5).max(500),
  source: WorkOrderSource,
  evidence: EvidenceSnapshot.nullable(),
  /** Oldest first. */
  history: z.array(WorkOrderEvent),
  /** Safety checks, steps and readings, in the order they're done. */
  checklist: z.array(ChecklistItem).max(30),
  closeOut: CloseOut.nullable(),
});
export type WorkOrder = z.infer<typeof WorkOrder>;

export const CreateWorkOrderRequest = WorkOrder.pick({
  title: true,
  description: true,
  assetId: true,
  type: true,
  priority: true,
  assigneeId: true,
  dueAt: true,
  source: true,
  evidence: true,
}).extend({
  /** Leave out for a typical estimate for this type of work. */
  estimatedHours: WorkOrder.shape.estimatedHours.optional(),
});
export type CreateWorkOrderRequest = z.infer<typeof CreateWorkOrderRequest>;

export const WorkOrderListParams = PageParams.extend({
  scopeId: ScopeId.optional(),
  assetId: Id.optional(),
  assigneeId: Id.optional(),
  status: z.array(WorkOrderStatus).optional(),
  type: z.array(WorkOrderType).optional(),
  priority: z.array(WorkOrderPriority).optional(),
  /** Only work planned to start in this window (from inclusive, to exclusive), e.g. one calendar month. */
  scheduledFrom: Timestamp.optional(),
  scheduledTo: Timestamp.optional(),
  /**
   * newest = created most recently; due = soonest due date first (undated last);
   * priority = most urgent first; start = soonest planned start first (unscheduled last).
   */
  sort: z.enum(["newest", "due", "priority", "start"]).default("newest"),
});
export type WorkOrderListParams = z.infer<typeof WorkOrderListParams>;

/**
 * Move a work order to another status. Scheduling needs a start time and someone assigned.
 * Starting work (approved → in_progress) needs every safety check confirmed in `checklist`.
 */
export const TransitionWorkOrderRequest = z
  .object({
    workOrderId: Id,
    to: WorkOrderStatus,
    note: z.string().trim().max(1000).optional(),
    scheduledStart: Timestamp.optional(),
    assigneeId: Id.optional(),
    checklist: z.array(ChecklistResult).max(30).optional(),
  })
  .refine((r) => r.to !== "completed", { error: "Use close-out to complete a work order", path: ["to"] })
  .refine((r) => r.to !== "cancelled" || (r.note?.length ?? 0) >= 5, {
    error: "A reason of at least 5 characters is required to cancel",
    path: ["note"],
  });
export type TransitionWorkOrderRequest = z.infer<typeof TransitionWorkOrderRequest>;

/** Finishing the work: the close-out plus the checklist results. Every required line must be done. */
export const CloseOutWorkOrderRequest = CloseOut.omit({ completedAt: true, completedBy: true }).extend({
  workOrderId: Id,
  checklist: z.array(ChecklistResult).max(30).default([]),
});
export type CloseOutWorkOrderRequest = z.infer<typeof CloseOutWorkOrderRequest>;

/**
 * Move planned work to another time or person (the schedule board). Allowed while the work is
 * scheduled or approved. Approved work goes back to "scheduled", because the plant manager
 * approved a different plan and has to approve the new one.
 */
export const RescheduleWorkOrderRequest = z.object({
  workOrderId: Id,
  scheduledStart: Timestamp,
  assigneeId: Id,
  note: z.string().trim().max(1000).optional(),
});
export type RescheduleWorkOrderRequest = z.infer<typeof RescheduleWorkOrderRequest>;

/** A technician's working day on the schedule board, in hours. More than this is a conflict. */
export const WORKDAY_HOURS = 8;
