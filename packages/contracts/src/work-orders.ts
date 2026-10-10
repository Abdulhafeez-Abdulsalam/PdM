import { z } from "zod";
import { Id, PageParams, Timestamp } from "./common";
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
  source: WorkOrderSource,
  evidence: EvidenceSnapshot.nullable(),
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
});
export type CreateWorkOrderRequest = z.infer<typeof CreateWorkOrderRequest>;

export const WorkOrderListParams = PageParams.extend({
  assetId: Id.optional(),
  status: z.array(WorkOrderStatus).optional(),
});
export type WorkOrderListParams = z.infer<typeof WorkOrderListParams>;
