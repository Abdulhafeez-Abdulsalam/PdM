import { z } from "zod";
import { type HealthState, Id, PageParams, ScopeId, Timestamp } from "./common";
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
export const AlarmState = z.enum(["active_unacked", "active_acked", "rtn_unacked", "cleared", "shelved", "suppressed", "out_of_service"]);
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

// ─── Alarm system performance (ISA-18.2 / EEMUA 191) ─────────────────────────

/**
 * The yardsticks from ISA-18.2 (the alarm management standard), per control room (here: per
 * site). An operator can handle about one alarm every 10 minutes comfortably, two at most.
 */
export const ISA_TARGETS = {
  /** Average alarms per 10 minutes: up to this is "very likely acceptable". */
  ratePer10MinAcceptable: 1,
  /** …and above this is more than an operator can manage. */
  ratePer10MinMax: 2,
  /** More than this many alarms in 10 minutes is a flood. */
  floodAlarmsPer10Min: 10,
  /** Share of 10-minute periods in flood: should stay below this (%). */
  floodPercentMax: 1,
  /** The 10 most frequent alarms should be at most this share of all alarms (%). */
  top10SharePercentMax: 5,
  /** Alarms active for over 24 hours ("standing"): at most this many. */
  standingMax: 5,
  /** Recommended share of alarms by priority (%): mostly low, very few urgent. */
  priorityMix: { p1: 1, p2: 5, p3: 15, p4: 79 },
} as const;

/** An alarm sounding again and again: this many times… */
export const CHATTER_COUNT = 3;
/** …within this many minutes. */
export const CHATTER_MINUTES = 5;

export const AlarmAnalyticsWindow = z.enum(["24h", "7d"]);
export type AlarmAnalyticsWindow = z.infer<typeof AlarmAnalyticsWindow>;

export const AlarmAnalyticsRequest = z.object({
  scopeId: ScopeId.optional(),
  window: AlarmAnalyticsWindow.default("24h"),
});
export type AlarmAnalyticsRequest = z.infer<typeof AlarmAnalyticsRequest>;

/** One alarm source (a tag's alarm, or an asset's prediction alarm) and how often it sounded. */
export const AlarmSource = z.object({
  /** Stable key: the tag id, or "<assetId>:prediction". */
  key: z.string(),
  assetId: Id,
  tagId: Id.nullable(),
  message: z.string(),
  priority: AlarmPriority,
  count: z.number().int().min(0),
  /** Share of all alarms in the window, %. */
  sharePercent: z.number().min(0).max(100),
});
export type AlarmSource = z.infer<typeof AlarmSource>;

export const AlarmAnalytics = z.object({
  window: AlarmAnalyticsWindow,
  from: Timestamp,
  to: Timestamp,
  /** Every time an alarm sounded (annunciation), including each repeat of a chattering alarm. */
  total: z.number().int().min(0),
  /** One row per control room (site). */
  sites: z.array(
    z.object({
      siteId: Id,
      siteName: z.string(),
      total: z.number().int().min(0),
      averagePer10Min: z.number().min(0),
      peakPer10Min: z.number().int().min(0),
      /** % of 10-minute periods with more than ISA_TARGETS.floodAlarmsPer10Min alarms. */
      floodPercent: z.number().min(0).max(100),
    }),
  ),
  /** Alarms per bucket for the whole scope: 10-minute buckets for 24 h, hourly for 7 days. */
  rate: z.object({
    bucketMinutes: z.number().int().positive(),
    points: z.array(z.object({ t: Timestamp, count: z.number().int().min(0) })).max(200),
  }),
  /** The 10 most frequent sources ("bad actors"), most first. */
  badActors: z.array(AlarmSource).max(10),
  top10SharePercent: z.number().min(0).max(100),
  /** Sources that sounded CHATTER_COUNT+ times within CHATTER_MINUTES, with how often that happened. */
  chattering: z.array(AlarmSource.extend({ episodes: z.number().int().min(1) })).max(20),
  priorities: z.record(AlarmPriority, z.number().int().min(0)),
  /** Right now: alarms active for over 24 hours, shelved, and suppressed. */
  standing: z.number().int().min(0),
  shelved: z.number().int().min(0),
  suppressed: z.number().int().min(0),
});
export type AlarmAnalytics = z.infer<typeof AlarmAnalytics>;
