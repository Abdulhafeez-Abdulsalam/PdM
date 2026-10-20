/**
 * Pre-filling a work order from an alarm (acceptance criterion C: alarm → assigned work
 * order in under 30 seconds). The more we fill in correctly, the fewer clicks it takes.
 * Pure functions — no React — so they're easy to test.
 */
import type { Alarm, AlarmPriority, Prediction, User, WorkOrderPriority, WorkOrderType } from "@pdm/contracts";

/** ISA-18.2 alarm priority → how urgently the work is needed. */
export const PRIORITY_FROM_ALARM: Record<AlarmPriority, WorkOrderPriority> = {
  p1: "emergency",
  p2: "urgent",
  p3: "high",
  p4: "normal",
};

/** Default time to complete, by work-order priority. */
export const DUE_DAYS: Record<WorkOrderPriority, number> = { emergency: 1, urgent: 3, high: 7, normal: 14, low: 30 };

export interface WorkOrderDraft {
  title: string;
  description: string;
  type: WorkOrderType;
  priority: WorkOrderPriority;
  /** yyyy-mm-dd, for a date input. */
  dueDate: string;
}

const MAX_TITLE = 120;

export function draftFromAlarm(alarm: Alarm, now: number, valueText: string | null): WorkOrderDraft {
  const priority = PRIORITY_FROM_ALARM[alarm.priority];
  const title = `${alarm.message} — ${alarm.assetId}`;
  const lines = [
    `Raised from alarm ${alarm.id} (${alarm.priority.toUpperCase()}) at ${alarm.raisedAt}.`,
    valueText ? `Reading at alarm: ${valueText}.` : null,
    alarm.occurrenceCount > 5 ? `Re-triggered ${alarm.occurrenceCount} times in the last hour.` : null,
  ];
  return {
    title: title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title,
    description: lines.filter(Boolean).join("\n"),
    type: alarm.kind === "prediction" ? "predictive" : "corrective",
    priority,
    dueDate: new Date(now + DUE_DAYS[priority] * 86_400_000).toISOString().slice(0, 10),
  };
}

/**
 * From a prediction: the recommended action becomes the title; urgency comes from how likely
 * and how soon; the due date is never later than the prediction's "act by" date.
 */
export function draftFromPrediction(p: Prediction, now: number, money: (amount: number) => string): WorkOrderDraft {
  const days = p.rul?.p50Days ?? Infinity;
  const priority: WorkOrderPriority = p.probability >= 0.8 && days <= 7 ? "urgent" : days <= 30 ? "high" : "normal";
  const due = Math.min(now + DUE_DAYS[priority] * 86_400_000, Date.parse(p.recommendedAction.actBy));
  const title = `${p.recommendedAction.summary} — ${p.assetId}`;
  return {
    title: title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title,
    description: [
      `Raised from prediction ${p.id}: ${p.failureMode.label} (${Math.round(p.probability * 100)}% within ${p.horizonDays} days).`,
      p.rul ? `Median remaining life ${Math.round(p.rul.p50Days)} days.` : null,
      `Cost to act now ${money(p.recommendedAction.interventionCost.amount)} vs ${money(p.recommendedAction.failureCost.amount)} if it fails.`,
    ]
      .filter(Boolean)
      .join("\n"),
    type: "predictive",
    priority,
    dueDate: new Date(due).toISOString().slice(0, 10),
  };
}

/** Technicians who work at the asset's site come first, then everyone else. */
export function suggestAssignees(technicians: readonly User[], siteId: string): User[] {
  const local = technicians.filter((u) => u.siteIds.includes(siteId));
  const others = technicians.filter((u) => !u.siteIds.includes(siteId));
  return [...local, ...others];
}
