/**
 * Shift handover (Phase 4, chunk 6). A shift is 12 hours from 06:00 or 18:00 UTC. The summary
 * counts what happened since the shift started, picks the events that matter most, and keeps the
 * notes the crew leaves for the next shift. The previous shift's notes are seeded from what was
 * really going on (urgent alarms still active, predictions with no finished work), written by
 * that site's control-room operator; notes added during the session are kept with them.
 */
import {
  DAY_SHIFT_START_UTC,
  SHIFT_HOURS,
  type AddHandoverNoteRequest,
  type Alarm,
  type Handover,
  type HandoverNote,
  type HealthState,
  type Prediction,
  type Shift,
  type TimelineEvent,
} from "@pdm/contracts";
import type { AlarmEngine } from "./alarms";
import { HOUR, iso } from "./clock";
import { listEvents } from "./events";
import { hashNoise, hashString } from "./random";
import type { Snapshot } from "./snapshot";
import type { WorkOrderStore } from "./work-orders";
import type { World } from "./world";

/** The shift that `t` falls in. */
export function shiftAt(t: number): Shift {
  const d = new Date(t);
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), DAY_SHIFT_START_UTC);
  // Before 06:00 is still last night's shift; from 18:00 it's tonight's.
  const start = t < day ? day - SHIFT_HOURS * HOUR : t < day + SHIFT_HOURS * HOUR ? day : day + SHIFT_HOURS * HOUR;
  return {
    name: start === day ? "day" : "night",
    start: iso(start),
    end: iso(start + SHIFT_HOURS * HOUR),
  };
}

const SEVERITY_RANK: Record<HealthState, number> = {
  critical: 5,
  warning: 4,
  degraded: 3,
  watch: 2,
  maintenance: 1,
  offline: 1,
  healthy: 0,
};
const rank = (e: TimelineEvent) => (e.severity ? SEVERITY_RANK[e.severity] : 0);
const OPEN_ALARM = new Set(["active_unacked", "active_acked"]);

interface Ctx {
  alarms: AlarmEngine;
  workOrders: WorkOrderStore;
  snapshot: Snapshot;
  log: readonly TimelineEvent[];
  inScope: (assetId: string) => boolean;
  /** Is this site inside the scope? (null = enterprise-wide note: always.) */
  siteInScope: (siteId: string | null) => boolean;
  now: number;
}

export class HandoverStore {
  private notes: HandoverNote[] | null = null;
  private nextNote = 1;

  constructor(private readonly world: World) {}

  summary(ctx: Ctx): Handover {
    const shift = shiftAt(ctx.now);
    const from = Date.parse(shift.start);
    const previous = shiftAt(from - 1);
    const within = (t: string | null | undefined) => {
      if (!t) return false;
      const ms = Date.parse(t);
      return ms >= from && ms <= ctx.now;
    };

    const alarms = ctx.alarms.all().filter((a) => ctx.inScope(a.assetId));
    const raised = alarms.filter((a) => within(a.raisedAt));
    const orders = ctx.workOrders.all().filter((o) => ctx.inScope(o.assetId));
    const events =
      ctx.now > from
        ? listEvents(
            { scopeId: undefined, from: shift.start, to: iso(ctx.now), limit: 500 },
            { alarms: ctx.alarms, workOrders: ctx.workOrders, snapshot: ctx.snapshot, log: ctx.log, inScope: ctx.inScope },
          )
        : [];

    const since = Date.parse(previous.start);
    return {
      shift,
      previous,
      counts: {
        alarmsRaised: raised.length,
        urgentAlarms: raised.filter((a) => a.priority === "p1" || a.priority === "p2").length,
        alarmsCleared: alarms.filter((a) => within(a.returnedToNormalAt)).length,
        workCreated: orders.filter((o) => within(o.createdAt)).length,
        workFinished: orders.filter((o) => within(o.closeOut?.completedAt)).length,
        predictions: ctx.snapshot.predictions.filter((p) => ctx.inScope(p.assetId) && within(p.detectedAt)).length,
        operatorActions: ctx.log.filter((e) => e.kind === "operator_action" && ctx.inScope(e.assetId) && within(e.t)).length,
      },
      highlights: [...events].sort((a, b) => rank(b) - rank(a) || b.t.localeCompare(a.t)).slice(0, 12),
      notes: this.all(ctx)
        .filter((n) => Date.parse(n.at) >= since && Date.parse(n.at) <= ctx.now && ctx.siteInScope(n.siteId))
        .sort((a, b) => b.at.localeCompare(a.at)),
    };
  }

  add(request: AddHandoverNoteRequest, authorId: string, ctx: Ctx): HandoverNote {
    const note: HandoverNote = {
      id: `HN-${String(this.nextNote++).padStart(4, "0")}`,
      at: iso(ctx.now),
      authorId,
      siteId: request.siteId,
      text: request.text.trim(),
    };
    this.all(ctx).push(note);
    return note;
  }

  /** Seeded on first use from the plant as it was then, so they read like real notes. */
  private all(ctx: Ctx): HandoverNote[] {
    if (this.notes) return this.notes;
    const seedAt = this.world.createdAt;
    const previous = shiftAt(Date.parse(shiftAt(seedAt).start) - 1);
    const start = Date.parse(previous.start);
    const notes: HandoverNote[] = [];
    // Per site: its most urgent active alarm and its most likely open prediction.
    const bySite = new Map<string, { alarm?: Alarm; prediction?: Prediction }>();
    const site = (assetId: string) => {
      const siteId = this.world.assets.get(assetId)?.data.siteId ?? "";
      const entry = bySite.get(siteId) ?? {};
      bySite.set(siteId, entry);
      return entry;
    };
    for (const a of ctx.alarms.all()) {
      if ((a.priority !== "p1" && a.priority !== "p2") || !OPEN_ALARM.has(a.state) || Date.parse(a.raisedAt) >= seedAt) continue;
      const entry = site(a.assetId);
      if (!entry.alarm || a.priority < entry.alarm.priority) entry.alarm = a;
    }
    for (const p of ctx.snapshot.predictions) {
      if (p.status === "closed" || p.status === "dismissed" || p.probability < 0.6) continue;
      const entry = site(p.assetId);
      if (!entry.prediction || p.probability > entry.prediction.probability) entry.prediction = p;
    }
    const sites = [...bySite]
      .filter(([siteId]) => siteId)
      .sort(([, a], [, b]) => Number(!!b.prediction) - Number(!!a.prediction))
      .slice(0, 6);
    for (const [siteId, { alarm, prediction }] of sites) {
      const texts: string[] = [];
      if (prediction) {
        const p = prediction;
        const wo = ctx.workOrders.all().find((o) => o.source.kind === "prediction" && o.source.refId === p.id);
        texts.push(
          wo
            ? `${p.assetId}: ${p.failureMode.label.toLowerCase()} predicted; ${wo.number} is ${wo.status.replace("_", " ")}. Keep an eye on it until the work is done.`
            : `${p.assetId}: ${p.failureMode.label.toLowerCase()} predicted (${Math.round(p.probability * 100)}%), no work order yet. Raised with the planner.`,
        );
      }
      if (alarm)
        texts.push(`${alarm.assetId}: "${alarm.message}" (${alarm.priority.toUpperCase()}) is still active. Check it early in the shift.`);
      const author =
        this.world.users.find((u) => u.role === "control_room_operator" && u.siteIds.includes(siteId)) ??
        this.world.usersWithRole("control_room_operator")[0];
      if (!author) continue;
      texts.forEach((text, i) => {
        // Written in the last few hours of the previous shift.
        const at = start + (8 + 3.5 * hashNoise(hashString(`handover:${siteId}:${i}`), 1)) * HOUR;
        notes.push({
          id: `HN-${String(this.nextNote++).padStart(4, "0")}`,
          at: iso(Math.min(at, seedAt)),
          authorId: author.id,
          siteId,
          text,
        });
      });
    }
    this.notes = notes;
    return notes;
  }
}
