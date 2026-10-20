import { z } from "zod";
import { HealthState, Id, PageParams, ScopeId, Timestamp } from "./common";
import { Quantity } from "./quantities";

/** ISA-18.2 priorities. p1 = most urgent. */
export const AlarmPriority = z.enum(["p1", "p2", "p3", "p4"]);
export type AlarmPriority = z.infer<typeof AlarmPriority>;

/**
 * Where an alarm is in its life (ISA-18.2):
 *   active_unacked → condition is abnormal, nobody has acknowledged it
 *   active_acked   → still abnormal, an operator has acknowledged it
 *   rtn_unacked    → returned to normal before anyone acknowledged it
 *   cleared        → normal and acknowledged; finished
 *   shelved        → temporarily hidden by an operator, with a reason and an expiry
 *   suppressed     → hidden by design logic (e.g. equipment is stopped)
 *   out_of_service → disabled for maintenance
 */
export const AlarmState = z.enum([
  "active_unacked",
  "active_acked",
  "rtn_unacked",
  "cleared",
  "shelved",
  "suppressed",
  "out_of_service",
]);
export type AlarmState = z.infer<typeof AlarmState>;

export const AlarmKind = z.enum([
  "high",
  "high_high",
  "low",
  "low_low",
  "deviation",
  "rate_of_change",
  "discrete", // on/off signal, e.g. "fire detected"
  "prediction", // raised by a predictive model rather than a threshold
]);
export type AlarmKind = z.infer<typeof AlarmKind>;

export const ShelveInfo = z.object({
  by: Id,
  reason: z.string().min(5).max(500),
  until: Timestamp,
});

export const Alarm = z.object({
  id: Id,
  assetId: Id,
  /** null for alarms not tied to one signal (e.g. a prediction alarm). */
  tagId: Id.nullable(),
  priority: AlarmPriority,
  state: AlarmState,
  kind: AlarmKind,
  message: z.string().min(1),
  /** Value that triggered the alarm and the limit it crossed, canonical unit. */
  value: z.number().nullable(),
  limit: z.number().nullable(),
  /** What value/limit measure, so the UI can convert units. null when there's no value. */
  quantity: Quantity.nullable(),
  raisedAt: Timestamp,
  acknowledgedAt: Timestamp.nullable(),
  acknowledgedBy: Id.nullable(),
  returnedToNormalAt: Timestamp.nullable(),
  shelve: ShelveInfo.nullable(),
  workOrderId: Id.nullable(),
  /** How many times it has re-triggered in the last hour. > 5 suggests a "chattering" alarm. */
  occurrenceCount: z.number().int().min(1),
});
export type Alarm = z.infer<typeof Alarm>;

export const AlarmListParams = PageParams.extend({
  scopeId: ScopeId.optional(),
  assetId: Id.optional(),
  states: z.array(AlarmState).optional(),
  priorities: z.array(AlarmPriority).optional(),
  sort: z.enum(["priority", "newest"]).default("priority"),
});
export type AlarmListParams = z.infer<typeof AlarmListParams>;

const countsByPriority = z.record(AlarmPriority, z.number().int().min(0));

/** What the always-visible alarm bar shows. */
export const AlarmSummary = z.object({
  scopeId: ScopeId,
  /** Active alarms (acked + unacked) per priority. */
  active: countsByPriority,
  /** The subset still waiting for acknowledgement. */
  unacknowledged: countsByPriority,
  shelved: z.number().int().min(0),
  suppressed: z.number().int().min(0),
  updatedAt: Timestamp,
});
export type AlarmSummary = z.infer<typeof AlarmSummary>;

export const AcknowledgeAlarmsRequest = z.object({
  alarmIds: z.array(Id).min(1).max(100),
  comment: z.string().max(500).optional(),
});

/**
 * Shelving needs a reason (audit requirement). The backend also checks that
 * `until` is in the future and no more than 24 h away.
 */
export const ShelveAlarmRequest = z.object({
  alarmId: Id,
  reason: z.string().trim().min(5, { error: "Give a reason of at least 5 characters" }).max(500),
  until: Timestamp,
});

export const UnshelveAlarmRequest = z.object({ alarmId: Id });

/** Maps alarm priority to the shared health scale, for colouring. */
export const ALARM_PRIORITY_HEALTH = {
  p1: "critical",
  p2: "warning",
  p3: "degraded",
  p4: "watch",
} as const satisfies Record<AlarmPriority, HealthState>;
