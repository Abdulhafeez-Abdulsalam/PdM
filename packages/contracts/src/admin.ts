/**
 * Administration (spec §6.15, "who can do what, and who changed what?").
 *
 *  - The audit log records every change made through the API: who, when, what and to which
 *    item. It is written by the server for every successful non-GET request, so a new action
 *    can't be forgotten.
 *  - Threshold editing changes a tag's alert / alarm / trip limits, which the alarm engine reads
 *    on every check: an edit really changes when alarms sound. Allowed to `threshold.edit` roles.
 *  - A person's role can be changed, but never so that a role is left with nobody in it.
 */
import { z } from "zod";
import { Id, PageParams, Timestamp, page } from "./common";
import { TagLimits } from "./tags";
import { RoleId } from "./users";

export const AuditEntry = z.object({
  id: Id,
  at: Timestamp,
  userId: Id,
  /** The endpoint, e.g. "workOrders.transition". */
  action: z.string(),
  /** What it does, in words (the endpoint's description). */
  description: z.string(),
  /** The item changed, e.g. a work order or tag id, if there is one. */
  targetId: Id.nullable(),
  /** What changed, when it's worth spelling out (e.g. "High alarm 95 → 100"). */
  detail: z.string().nullable(),
});
export type AuditEntry = z.infer<typeof AuditEntry>;

export const AuditListParams = PageParams.extend({
  userId: Id.optional(),
  /** Endpoint names starting with this, e.g. "workOrders." or "admin.". */
  action: z.string().max(64).optional(),
});
export type AuditListParams = z.infer<typeof AuditListParams>;
export const AuditPage = page(AuditEntry);

/** Each limit in its tag's SI unit; leave one out to remove it. Must be in order: low trip < … < high trip. */
export const SetLimitsRequest = z.object({ tagId: Id, limits: TagLimits });
export type SetLimitsRequest = z.infer<typeof SetLimitsRequest>;

export const SetUserRoleRequest = z.object({ userId: Id, role: RoleId });
export type SetUserRoleRequest = z.infer<typeof SetUserRoleRequest>;
