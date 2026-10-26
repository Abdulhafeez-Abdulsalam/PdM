/**
 * Shift handover (spec §6.13, "can I hand this over?"): what happened this shift, so the
 * incoming crew starts with the same picture. Shifts are 12 hours, starting 06:00 and 18:00
 * UTC. Open alarms and work in progress come from their own lists; this adds the counts,
 * the events that matter most, and the notes the crew leaves for each other.
 */
import { z } from "zod";
import { Id, ScopeId, Timestamp } from "./common";
import { TimelineEvent } from "./events";

/** Hours in a shift; day shift starts at this hour UTC, night shift 12 hours later. */
export const SHIFT_HOURS = 12;
export const DAY_SHIFT_START_UTC = 6;

export const Shift = z.object({ name: z.enum(["day", "night"]), start: Timestamp, end: Timestamp });
export type Shift = z.infer<typeof Shift>;

export const HandoverNote = z.object({
  id: Id,
  at: Timestamp,
  authorId: Id,
  /** The site it's about, or null for the whole enterprise. */
  siteId: Id.nullable(),
  text: z.string(),
});
export type HandoverNote = z.infer<typeof HandoverNote>;

export const HandoverRequest = z.object({ scopeId: ScopeId.optional() });
export type HandoverRequest = z.infer<typeof HandoverRequest>;

export const Handover = z.object({
  shift: Shift,
  previous: Shift,
  /** Since the start of this shift. */
  counts: z.object({
    alarmsRaised: z.number().int(),
    /** Of those, P1 and P2. */
    urgentAlarms: z.number().int(),
    alarmsCleared: z.number().int(),
    workCreated: z.number().int(),
    workFinished: z.number().int(),
    predictions: z.number().int(),
    operatorActions: z.number().int(),
  }),
  /** The events that matter most this shift: most severe first, then newest (at most 12). */
  highlights: z.array(TimelineEvent),
  /** Notes from this shift and the one before, newest first. */
  notes: z.array(HandoverNote),
});
export type Handover = z.infer<typeof Handover>;

export const AddHandoverNoteRequest = z.object({
  siteId: Id.nullable(),
  text: z.string().trim().min(3).max(1000),
});
export type AddHandoverNoteRequest = z.infer<typeof AddHandoverNoteRequest>;
