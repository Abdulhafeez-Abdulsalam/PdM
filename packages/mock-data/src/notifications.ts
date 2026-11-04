/**
 * What each person is told about. Worked out from the plant as it is now, so it can't disagree
 * with it: an alarm someone acknowledged stops being unread by itself. Only what a person chose
 * is kept here: what they've read, and what they've snoozed.
 */
import {
  ALARM_PRIORITY_HEALTH,
  type Alarm,
  type Notification,
  type NotificationList,
  type NotificationListParams,
  type Prediction,
  type RoleId,
  type User,
  type WorkOrder,
  type WorkOrderStatus,
} from "@pdm/contracts";
import { DAY } from "./clock";

const ALARM_WINDOW = DAY;
const PREDICTION_WINDOW = 30 * DAY;
const LIKELY = 0.7;
const DONE: readonly WorkOrderStatus[] = ["completed", "verified", "closed", "cancelled"];

/** Who hears about urgent alarms, and how urgent. */
const ALARM_PRIORITIES: Partial<Record<RoleId, readonly Alarm["priority"][]>> = {
  control_room_operator: ["p1", "p2"],
  plant_manager: ["p1", "p2"],
  reliability_engineer: ["p1"],
  condition_analyst: ["p1"],
  maintenance_planner: ["p1"],
  hse_officer: ["p1"],
  executive: ["p1"],
};
/** Who hears about likely failures. */
const PREDICTION_ROLES: readonly RoleId[] = ["reliability_engineer", "condition_analyst", "maintenance_planner", "plant_manager"];

interface Sources {
  alarms: readonly Alarm[];
  workOrders: readonly WorkOrder[];
  predictions: readonly Prediction[];
  siteOf: (assetId: string) => string | undefined;
}

interface Choices {
  read: Set<string>;
  /** Everything up to this time counts as read ("mark all as read"). */
  readThrough: number;
  snoozed: Map<string, number>;
}

export class NotificationStore {
  private readonly people = new Map<string, Choices>();

  private choices(userId: string): Choices {
    let c = this.people.get(userId);
    if (!c) this.people.set(userId, (c = { read: new Set(), readThrough: 0, snoozed: new Map() }));
    return c;
  }

  list(user: User, params: NotificationListParams, sources: Sources, now: number): NotificationList {
    const c = this.choices(user.id);
    const showing = this.forUser(user, sources, now)
      .filter((n) => (c.snoozed.get(n.id) ?? 0) <= now)
      .map((n) => ({ ...n, read: n.read || c.read.has(n.id) || Date.parse(n.t) <= c.readThrough }))
      .sort((a, b) => b.t.localeCompare(a.t) || a.id.localeCompare(b.id));
    const items = showing.filter((n) => (!params.kinds || params.kinds.includes(n.kind)) && (!params.unreadOnly || !n.read));
    return { items: items.slice(0, params.limit), unread: showing.filter((n) => !n.read).length };
  }

  markRead(user: User, ids: readonly string[] | undefined, now: number): void {
    const c = this.choices(user.id);
    if (ids) for (const id of ids) c.read.add(id);
    else c.readThrough = now;
  }

  snooze(user: User, id: string, until: number): void {
    this.choices(user.id).snoozed.set(id, until);
  }

  private forUser(user: User, { alarms, workOrders, predictions, siteOf }: Sources, now: number): Notification[] {
    const here = (assetId: string) => user.siteIds.length === 0 || user.siteIds.includes(siteOf(assetId) ?? "");
    const out: Notification[] = [];

    const priorities = ALARM_PRIORITIES[user.role] ?? [];
    for (const a of alarms) {
      if (!priorities.includes(a.priority) || now - Date.parse(a.raisedAt) > ALARM_WINDOW || !here(a.assetId)) continue;
      out.push({
        id: `ntf-${a.id}`,
        kind: "alarm",
        t: a.raisedAt,
        title: `${a.priority.toUpperCase()} alarm on ${a.assetId}`,
        detail: a.message,
        severity: ALARM_PRIORITY_HEALTH[a.priority],
        assetId: a.assetId,
        refId: a.id,
        // Someone has dealt with it, so it no longer needs attention.
        read: a.state !== "active_unacked" && a.state !== "rtn_unacked",
      });
    }
    for (const wo of workOrders) {
      const toPlan = user.role === "maintenance_planner" && wo.status === "requested";
      if ((wo.assigneeId !== user.id && !toPlan) || DONE.includes(wo.status)) continue;
      out.push({
        id: `ntf-${wo.id}`,
        kind: "work_order",
        t: wo.createdAt,
        title: toPlan ? `${wo.number} needs planning` : `${wo.number} assigned to you`,
        detail: wo.title,
        severity: null,
        assetId: wo.assetId,
        refId: wo.id,
        read: false,
      });
    }
    if (PREDICTION_ROLES.includes(user.role)) {
      for (const p of predictions) {
        if (p.status !== "open" || p.probability < LIKELY || now - Date.parse(p.detectedAt) > PREDICTION_WINDOW || !here(p.assetId))
          continue;
        out.push({
          id: `ntf-${p.id}`,
          kind: "prediction",
          t: p.detectedAt,
          title: `Likely failure on ${p.assetId}`,
          detail: `${p.failureMode.label}: ${Math.round(p.probability * 100)}% within ${p.horizonDays} days`,
          severity: "warning",
          assetId: p.assetId,
          refId: p.id,
          read: false,
        });
      }
    }
    return out;
  }
}
