import { z } from "zod";
import { HealthState, Id, ScopeId, Timestamp } from "./common";

/** Everything that can appear on the shared event timeline. */
export const TimelineEventKind = z.enum(["alarm", "operator_action", "maintenance", "process", "prediction"]);
export type TimelineEventKind = z.infer<typeof TimelineEventKind>;

export const TimelineEvent = z.object({
  id: Id,
  kind: TimelineEventKind,
  t: Timestamp,
  assetId: Id,
  title: z.string().min(1),
  detail: z.string().nullable(),
  severity: HealthState.nullable(),
  /** The id of the alarm / work order / prediction this event is about, for click-through. */
  refId: Id.nullable(),
});
export type TimelineEvent = z.infer<typeof TimelineEvent>;

export const EventListParams = z
  .object({
    scopeId: ScopeId.optional(),
    assetId: Id.optional(),
    from: Timestamp,
    to: Timestamp,
    kinds: z.array(TimelineEventKind).optional(),
    limit: z.number().int().min(1).max(500).default(200),
  })
  .refine((p) => Date.parse(p.from) < Date.parse(p.to), { error: "`from` must be before `to`" });
export type EventListParams = z.infer<typeof EventListParams>;
