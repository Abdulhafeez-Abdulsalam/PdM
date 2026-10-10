/**
 * Live messages (WebSocket in real mode, worker messages in demo mode — same shapes either way).
 * Budgets come from ADR-0005.
 */
import { z } from "zod";
import { Alarm, AlarmSummary } from "./alarms";
import { ApiError, Id, ScopeId, Timestamp } from "./common";
import { LiveValue } from "./timeseries";

/** Most tags the whole app may be subscribed to at once. */
export const MAX_SUBSCRIBED_TAGS = 300;
/** The server sends at most one tag_values batch per this many ms; the UI redraws at the same rate. */
export const LIVE_FLUSH_INTERVAL_MS = 1000;
/** A live value with no update for this long is shown as stale. */
export const STALE_AFTER_MS = 10_000;

// ─── Client → server ────────────────────────────────────────────────────────

export const ClientMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("subscribe_tags"), tagIds: z.array(Id).min(1).max(MAX_SUBSCRIBED_TAGS) }),
  z.object({ type: z.literal("unsubscribe_tags"), tagIds: z.array(Id).min(1).max(MAX_SUBSCRIBED_TAGS) }),
  /** Alarm changes and summary counts for everything under a hierarchy node. One alarm scope at a time. */
  z.object({ type: z.literal("subscribe_alarms"), scopeId: ScopeId }),
  z.object({ type: z.literal("unsubscribe_alarms") }),
  z.object({ type: z.literal("ping"), t: Timestamp }),
]);
export type ClientMessage = z.infer<typeof ClientMessage>;

// ─── Server → client ────────────────────────────────────────────────────────

export const ServerMessage = z.discriminatedUnion("type", [
  /**
   * New values for subscribed tags, batched. Only tags that changed are included.
   * `seq` goes up by 1 each batch; a jump means batches were lost and the client should refetch latest values.
   */
  z.object({
    type: z.literal("tag_values"),
    seq: z.number().int().min(0),
    t: Timestamp,
    values: z.array(LiveValue).max(MAX_SUBSCRIBED_TAGS),
  }),
  /** An alarm was raised, acknowledged, shelved, returned to normal, etc. Carries the full new state. */
  z.object({ type: z.literal("alarm_changed"), alarm: Alarm }),
  /** Fresh counts for the alarm bar, sent whenever they change. */
  z.object({ type: z.literal("alarm_summary"), summary: AlarmSummary }),
  z.object({ type: z.literal("pong"), t: Timestamp }),
  /** e.g. code "too_many_tags" when a subscription would exceed MAX_SUBSCRIBED_TAGS. */
  z.object({ type: z.literal("error"), error: ApiError }),
]);
export type ServerMessage = z.infer<typeof ServerMessage>;
