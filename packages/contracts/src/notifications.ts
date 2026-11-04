import { z } from "zod";
import { HealthState, Id, Timestamp } from "./common";

/** What a notification is about. */
export const NotificationKind = z.enum(["alarm", "escalation", "work_order", "prediction"]);
export type NotificationKind = z.infer<typeof NotificationKind>;

/** One thing that needs attention. Worked out from the plant: only read and snooze are kept. */
export const Notification = z.object({
  id: Id,
  kind: NotificationKind,
  t: Timestamp,
  title: z.string().min(1),
  detail: z.string().nullable(),
  severity: HealthState.nullable(),
  assetId: Id,
  /** The alarm, work order or prediction it is about. */
  refId: Id,
  read: z.boolean(),
});
export type Notification = z.infer<typeof Notification>;

export const NotificationListParams = z.object({
  kinds: z.array(NotificationKind).optional(),
  unreadOnly: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(100),
});
export type NotificationListParams = z.infer<typeof NotificationListParams>;

export const NotificationList = z.object({
  items: z.array(Notification),
  /** Everything unread, whatever the filters: the number on the bell. */
  unread: z.number().int().min(0),
});
export type NotificationList = z.infer<typeof NotificationList>;

/** Mark these as read, or everything so far when no ids are given. */
export const MarkNotificationsReadRequest = z.object({ ids: z.array(Id).min(1).optional() });
export type MarkNotificationsReadRequest = z.infer<typeof MarkNotificationsReadRequest>;

/** Hide a notification until this time. */
export const SnoozeNotificationRequest = z.object({ id: Id, until: Timestamp });
export type SnoozeNotificationRequest = z.infer<typeof SnoozeNotificationRequest>;
