/** Builds the shared event timeline from alarms, operator actions, work orders and predictions. */
import { ALARM_PRIORITY_HEALTH, type EventListParams, type TimelineEvent } from "@pdm/contracts";
import type { AlarmEngine } from "./alarms";
import type { Snapshot } from "./snapshot";
import type { WorkOrderStore } from "./work-orders";

interface EventSources {
  alarms: AlarmEngine;
  workOrders: WorkOrderStore;
  snapshot: Snapshot;
  /** Operator actions and storyline milestones, recorded as they happen. */
  log: readonly TimelineEvent[];
  inScope: (assetId: string) => boolean;
}

/** Events in [from, to], oldest first. If more than `limit` match, the most recent `limit` are kept. */
export function listEvents(params: EventListParams, sources: EventSources): TimelineEvent[] {
  const from = Date.parse(params.from);
  const to = Date.parse(params.to);
  const wanted = (e: TimelineEvent) => {
    const t = Date.parse(e.t);
    return (
      t >= from &&
      t <= to &&
      (!params.assetId || e.assetId === params.assetId) &&
      (!params.kinds || params.kinds.includes(e.kind)) &&
      sources.inScope(e.assetId)
    );
  };

  const events: TimelineEvent[] = [];
  for (const a of sources.alarms.all()) {
    events.push({
      id: `ev-${a.id}`,
      kind: "alarm",
      t: a.raisedAt,
      assetId: a.assetId,
      title: a.message,
      detail: `${a.priority.toUpperCase()} · ${a.state.replace(/_/g, " ")}`,
      severity: ALARM_PRIORITY_HEALTH[a.priority],
      refId: a.id,
    });
  }
  for (const wo of sources.workOrders.all()) {
    events.push({
      id: `ev-${wo.id}`,
      kind: "maintenance",
      t: wo.createdAt,
      assetId: wo.assetId,
      title: `${wo.number} created: ${wo.title}`,
      detail: `${wo.type.replace("_", " ")} · ${wo.status.replace("_", " ")}`,
      severity: null,
      refId: wo.id,
    });
  }
  for (const p of sources.snapshot.predictions) {
    events.push({
      id: `ev-${p.id}`,
      kind: "prediction",
      t: p.detectedAt,
      assetId: p.assetId,
      title: `Prediction: ${p.failureMode.label}`,
      detail: `${Math.round(p.probability * 100)}% within ${p.horizonDays} days`,
      severity: p.probability >= 0.7 ? "warning" : "degraded",
      refId: p.id,
    });
  }
  events.push(...sources.log);

  const matching = events.filter(wanted).sort((a, b) => a.t.localeCompare(b.t));
  return matching.slice(Math.max(0, matching.length - params.limit));
}
