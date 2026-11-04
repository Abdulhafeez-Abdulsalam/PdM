/**
 * Alarm engine. Three sources of alarms:
 *   1. Faults crossing a tag's alert / alarm / trip limit (times worked out exactly, see faults.ts)
 *   2. Predictions on critical assets ("predicted bearing wear within 30 days")
 *   3. Background "nuisance" alarms, a few chattering bad actors, and floods in chaos mode —
 *      because real alarm systems are noisy, and the UI must cope with that.
 * Alarms then live through the ISA-18.2 states as operators acknowledge and shelve them.
 */
import {
  AlarmPriority,
  ESCALATION_CHAIN,
  ESCALATION_MINUTES,
  type Alarm,
  type AlarmAnalytics,
  type AlarmAnalyticsWindow,
  type AlarmKind,
  type AlarmListParams,
  type AlarmState,
  type OnCall,
  type TagLimits,
  type AlarmSummary,
  type User,
} from "@pdm/contracts";
import { alarmAnalytics, type Activation } from "./alarm-analytics";
import { DAY, HOUR, MINUTE, iso } from "./clock";
import { DETECTION_PROGRESS, limitCrossings, timeAtProgress } from "./faults";
import type { AssetRecord, Fault, TagRecord } from "./model";
import { Rng, hash2, hashNoise, hashString } from "./random";
import { ApiFailure } from "./errors";
import type { ChaosWindows } from "./signals";
import type { World } from "./world";

const PRIORITY_BY_LEVEL: readonly AlarmPriority[] = ["p3", "p2", "p1"];
const LEVEL_WORDS = ["high", "high-high", "trip"] as const;
/** Chance of a background alarm starting in any given simulated minute, enterprise-wide. */
const BACKGROUND_RATE = 0.12;
/** Unacknowledged alarms older than this are treated as already handled when the simulation starts. */
const INITIAL_AUTO_ACK_AGE = 45 * MINUTE;
/** How long a simulated operator takes to deal with a nuisance alarm. */
const DUTY_DELAY_MIN = 5;
const DUTY_DELAY_SPREAD = 40;
/** On-call shifts change every 12 hours. */
const SHIFT = 12 * HOUR;
const MAX_SHELVE = 24 * HOUR;
const RETENTION = 7 * DAY;
/** How much alarm history the analytics page can look back over. */
const LOG_RETENTION = 7 * DAY;

interface AlarmRecord {
  alarm: Alarm;
  /** When a background alarm returns to normal by itself. */
  rtnAt: number | null;
  faultId: string | null;
  /** The state to go back to when un-shelved. */
  heldState: AlarmState | null;
  raisedAtMs: number;
  /** Raise order (the number in its id): the order the alarms are kept in. */
  seq: number;
}

interface Crossing {
  level: 0 | 1 | 2;
  t: number;
  limit: number;
  key: string;
}

const SHELVE_REASONS = [
  "Instrument technician recalibrating transmitter",
  "Known nuisance alarm — rationalisation request MOC-2291 open",
  "Equipment isolated for permit-to-work",
  "Sensor fault confirmed, replacement ordered",
];

export class AlarmEngine {
  private records = new Map<string, AlarmRecord>();
  private changed = new Map<string, Alarm>();
  private faultKeys = new Set<string>();
  private nextNumber = 1;
  private processedUntil: number;
  private readonly bgSeed: number;
  private readonly candidates: TagRecord[];
  private readonly chatterTags: TagRecord[];
  private readonly operators: User[];
  /** Every time an alarm sounded, for the analytics page (ISA-18.2 counts each annunciation). */
  private log: Activation[] = [];
  /** How many of the log's first entries are in time order; the rest were added since (see sortLog). */
  private logSorted = 0;
  /**
   * While true, alarms are only written to the log, not kept as live alarms. Used at start-up
   * to fill a week of history without changing the alarm list every other screen shows.
   */
  private logOnly = false;
  /**
   * When each chattering tag's alarm clears, for the log. Tracked apart from the live alarms
   * so the log counts its re-soundings the same way however fast the simulation catches up.
   */
  private readonly chatterActiveUntil = new Map<string, number>();

  // ─── Indexes ───────────────────────────────────────────────────────────────
  // Each simulated minute needs only a few of the alarms: those still waiting to return to normal,
  // the shelved ones, and the cleared ones old enough to forget. Looking through every alarm
  // instead made each minute slower than the last, as unacknowledged alarms pile up in an
  // unattended plant (13,000 after 16 simulated days), and replaying a month took 99 s (Phase 5
  // review). These are kept up to date by markChanged, which every change of an alarm goes through.

  /** Alarms not yet returned to normal, in raise order (the order the step used to visit them). */
  private readonly waiting = new Set<AlarmRecord>();
  /** The same, by tag: the alarm currently sounding on a tag is the first of these that isn't cleared. */
  private readonly waitingByTag = new Map<string, Set<AlarmRecord>>();
  private readonly shelved = new Set<AlarmRecord>();
  /** Cleared alarms (a final state), in the order they returned to normal, to forget after RETENTION. */
  private readonly clearedQueue: { at: number; record: AlarmRecord }[] = [];
  private readonly queued = new WeakSet<AlarmRecord>();
  /** Nuisance alarms waiting for the simulated operator, by the minute they'll be dealt with. */
  private readonly duty = new Map<number, AlarmRecord[]>();
  /** Urgent alarms to check, by the minute their time at this level of the chain runs out. */
  private readonly toEscalate = new Map<number, { record: AlarmRecord; level: number }[]>();
  /** Every step up the on-call chain, for the analytics page. */
  private readonly escalations: { t: number; assetId: string }[] = [];
  /**
   * Each fault's limit crossings on each tag, with their keys, worked out once and kept until the
   * tag's limits are edited (an edit replaces the limits object). Working them out afresh every
   * minute made garbage the collector had to clear, slower and slower as the alarm list grew.
   */
  private readonly crossings = new Map<Fault, Map<TagRecord, { limits: TagLimits; list: Crossing[] }>>();

  constructor(
    private readonly world: World,
    private readonly chaos: ChaosWindows,
    now: number,
    private readonly onOperatorAction: (alarm: Alarm, title: string, t: number) => void,
    private readonly onEscalated: (alarm: Alarm, t: number) => void = () => {},
  ) {
    this.bgSeed = hashString(`${world.seed}:alarms`);
    this.operators = world.usersWithRole("control_room_operator");
    this.candidates = [...world.tags.values()].filter(
      (t) => t.template.bad && t.asset.staticStatus === "normal" && world.faultsOf(t.asset.data.id).length === 0,
    );
    const rng = Rng.for(world.seed, "chatter");
    this.chatterTags = [0, 1, 2].map(() => rng.pick(this.candidates));

    // A week of history for the analytics, from the repeatable background sources only.
    this.logOnly = true;
    this.processedUntil = now - LOG_RETENTION;
    this.processBackground(now - DAY);
    this.logOnly = false;

    this.processedUntil = now - DAY;
    this.processBackground(now);
    this.processFaults(now);
    this.processReturns(now);
    this.seedStanding(now);
    this.autoAcknowledgeOld(now);
    // The starting conditions set some states directly: build the indexes from scratch, in order.
    this.waiting.clear();
    this.waitingByTag.clear();
    this.shelved.clear();
    for (const record of this.records.values()) this.index(record);
    this.processedUntil = now;
    // The starting conditions set some states directly: time to answer starts from now.
    this.toEscalate.clear();
    for (const record of this.records.values()) if (record.alarm.state === "active_unacked") this.scheduleEscalation(record, now);
    this.changed.clear();
  }

  // ─── Time passing ──────────────────────────────────────────────────────────

  /**
   * Move on to `now`, one simulated minute at a time and always in the same order, so the alarms
   * are the same however the time was reached: ticked once a second (live, at any speed) or in
   * one jump (replaying the server's command log, ADR-0015). Processing a long jump in one batch
   * gave different alarms, because whether a tag's alarm was still active depended on the batch.
   * The cost: an alarm appears at the first whole minute after it happens (its time is exact).
   */
  tick(now: number): void {
    const lastMinute = Math.floor(now / MINUTE);
    for (let m = Math.floor(this.processedUntil / MINUTE) + 1; m <= lastMinute; m++) {
      const t = m * MINUTE;
      this.processBackground(t);
      this.processFaults(t);
      this.processReturns(t);
      this.processDuty(m, t);
      this.processEscalations(m, t);
      this.processShelveExpiry(t);
      this.prune(t);
      this.processedUntil = t;
    }
  }

  /** Alarms that changed since the last call (for live alarm_changed messages). */
  drainChanges(): Alarm[] {
    const list = [...this.changed.values()];
    this.changed.clear();
    return list;
  }

  private raise(input: {
    t: number;
    asset: AssetRecord;
    tag: TagRecord | null;
    priority: AlarmPriority;
    kind: AlarmKind;
    message: string;
    value: number | null;
    limit: number | null;
    rtnAt: number | null;
    faultId: string | null;
    occurrenceCount?: number;
    /** false when the caller writes the log itself (chattering alarms). */
    log?: boolean;
  }): void {
    if (input.log !== false)
      this.log.push({
        t: input.t,
        assetId: input.asset.data.id,
        siteId: input.asset.data.siteId,
        tagId: input.tag?.tag.id ?? null,
        priority: input.priority,
        message: input.message,
      });
    if (this.logOnly) return;
    const seq = this.nextNumber++;
    const id = `ALM-${String(seq).padStart(6, "0")}`;
    const record: AlarmRecord = {
      seq,
      rtnAt: input.rtnAt,
      faultId: input.faultId,
      heldState: null,
      raisedAtMs: input.t,
      alarm: {
        id,
        assetId: input.asset.data.id,
        tagId: input.tag?.tag.id ?? null,
        priority: input.priority,
        state: "active_unacked",
        kind: input.kind,
        message: input.message,
        value: input.value === null ? null : Number(input.value.toPrecision(5)),
        limit: input.limit === null ? null : Number(input.limit.toPrecision(5)),
        quantity: input.tag && input.value !== null ? input.tag.template.quantity : null,
        raisedAt: iso(input.t),
        acknowledgedAt: null,
        acknowledgedBy: null,
        returnedToNormalAt: null,
        shelve: null,
        escalation: null,
        workOrderId: null,
        occurrenceCount: input.occurrenceCount ?? 1,
      },
    };
    this.records.set(id, record);
    this.markChanged(record);
    // Nobody works alarms in the simulation, so someone on shift deals with the low-priority noise.
    // Alarms from real faults, and urgent ones, stay for people.
    if (input.faultId === null && (input.priority === "p3" || input.priority === "p4")) {
      const at = Math.floor(input.t / MINUTE) + DUTY_DELAY_MIN + (hash2(this.bgSeed + 11, seq) % DUTY_DELAY_SPREAD);
      const due = this.duty.get(at);
      if (due) due.push(record);
      else this.duty.set(at, [record]);
    }
    this.scheduleEscalation(record, input.t);
  }

  /** If this alarm goes unanswered, when does it move up next? (Only urgent alarms do, by themselves.) */
  private scheduleEscalation(record: AlarmRecord, from: number): void {
    const level = record.alarm.escalation?.level ?? 0;
    const wait = ESCALATION_MINUTES[record.alarm.priority]?.[level];
    if (wait === undefined) return;
    const at = Math.floor(from / MINUTE) + wait;
    const due = this.toEscalate.get(at);
    if (due) due.push({ record, level });
    else this.toEscalate.set(at, [{ record, level }]);
  }

  private processEscalations(m: number, t: number): void {
    const due = this.toEscalate.get(m);
    if (!due) return;
    this.toEscalate.delete(m);
    for (const { record, level } of due) {
      // Answered, returned to normal, or already moved up by hand: nothing to do.
      if (record.alarm.state === "active_unacked" && (record.alarm.escalation?.level ?? 0) === level) this.stepUp(record, t, null);
    }
  }

  private stepUp(record: AlarmRecord, t: number, by: string | null): void {
    const a = record.alarm;
    const level = (a.escalation?.level ?? 0) + 1;
    const person = this.onCallAt(this.world.assets.get(a.assetId)?.data.siteId ?? "", level, t);
    a.escalation = { level, to: person.id, toName: person.name, at: iso(t), by };
    this.escalations.push({ t, assetId: a.assetId });
    this.markChanged(record);
    this.scheduleEscalation(record, t);
    this.onEscalated(a, t);
  }

  /** Who holds this place in the chain at this site. Worked out from the time, so a restart can't change it. */
  private onCallAt(siteId: string, level: number, t: number): User {
    const role = ESCALATION_CHAIN[level] ?? "executive";
    const everyone = this.world.usersWithRole(role);
    const here = everyone.filter((u) => u.siteIds.includes(siteId));
    const pool = here.length > 0 ? here : everyone;
    return pool[(Math.floor(t / SHIFT) + hashString(siteId)) % pool.length] as User;
  }

  onCall(sites: readonly { id: string; name: string }[], now: number): OnCall {
    return {
      shiftEndsAt: iso((Math.floor(now / SHIFT) + 1) * SHIFT),
      sites: sites.map((s) => ({
        siteId: s.id,
        siteName: s.name,
        chain: ESCALATION_CHAIN.map((_, level) => {
          const person = this.onCallAt(s.id, level, now);
          return { userId: person.id, name: person.name };
        }),
      })),
    };
  }

  /** The simulated operator: acknowledges the nuisance alarms due this minute, if nobody has yet. */
  private processDuty(m: number, t: number): void {
    const due = this.duty.get(m);
    if (!due) return;
    this.duty.delete(m);
    for (const record of due) {
      const a = record.alarm;
      if (a.state !== "active_unacked" && a.state !== "rtn_unacked") continue;
      const asset = this.world.assets.get(a.assetId);
      if (!asset) continue;
      a.state = a.state === "active_unacked" ? "active_acked" : "cleared";
      a.acknowledgedAt = iso(t);
      a.acknowledgedBy = this.operatorFor(asset).id;
      this.markChanged(record);
    }
  }

  private markChanged(record: AlarmRecord): void {
    this.changed.set(record.alarm.id, record.alarm);
    this.index(record);
  }

  /** Put an alarm in (or take it out of) the indexes its current state belongs in. */
  private index(record: AlarmRecord): void {
    const a = record.alarm;
    if (a.returnedToNormalAt === null) {
      this.waiting.add(record);
      if (a.tagId) {
        let onTag = this.waitingByTag.get(a.tagId);
        if (!onTag) this.waitingByTag.set(a.tagId, (onTag = new Set()));
        onTag.add(record);
      }
    } else {
      this.waiting.delete(record);
      if (a.tagId) this.waitingByTag.get(a.tagId)?.delete(record);
    }
    if (a.state === "shelved") this.shelved.add(record);
    else this.shelved.delete(record);
    if (a.state === "cleared" && a.returnedToNormalAt && !this.queued.has(record)) {
      this.queued.add(record);
      const at = Date.parse(a.returnedToNormalAt);
      // Keep the queue in time order (after any with the same time).
      let lo = 0;
      let hi = this.clearedQueue.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.clearedQueue[mid]!.at <= at) lo = mid + 1;
        else hi = mid;
      }
      this.clearedQueue.splice(lo, 0, { at, record });
    }
  }

  /** Background alarms, chattering bad actors, chaos floods — processed one simulated minute at a time. */
  private processBackground(now: number): void {
    const firstMinute = Math.max(Math.floor(this.processedUntil / MINUTE) + 1, Math.floor(now / MINUTE) - LOG_RETENTION / MINUTE);
    const lastMinute = Math.floor(now / MINUTE);
    for (let m = firstMinute; m <= lastMinute; m++) {
      const t = m * MINUTE;
      if (hashNoise(this.bgSeed, m) < BACKGROUND_RATE) this.raiseBackground(m, t);
      this.chatter(m, t);
      if (this.chaos.activeAt(t) && m % 30 === 0 && hashNoise(this.bgSeed + 99, m) < 0.6) this.flood(m, t);
    }
  }

  private raiseBackground(m: number, t: number): void {
    const tag = this.candidates[hash2(this.bgSeed + 1, m) % this.candidates.length];
    if (!tag) return;
    const roll = hashNoise(this.bgSeed + 2, m);
    const priority: AlarmPriority = roll < 0.65 ? "p4" : roll < 0.95 ? "p3" : "p2";
    const durationMin = 3 + hashNoise(this.bgSeed + 3, m) * 120;
    this.raiseOnLimit(tag, 0, priority, t + hashNoise(this.bgSeed + 4, m) * 50_000, t + durationMin * MINUTE);
  }

  private raiseOnLimit(
    tag: TagRecord,
    level: 0 | 1 | 2,
    priority: AlarmPriority,
    t: number,
    rtnAt: number | null,
    occurrenceCount?: number,
    log = true,
  ): void {
    const high = tag.template.bad === "high";
    const limits = tag.tag.limits;
    const limit =
      (high ? [limits.highAlert, limits.highAlarm, limits.highTrip] : [limits.lowAlert, limits.lowAlarm, limits.lowTrip])[level] ??
      tag.base;
    this.raise({
      t,
      asset: tag.asset,
      tag,
      priority,
      kind: high ? (level === 0 ? "high" : "high_high") : level === 0 ? "low" : "low_low",
      message: `${tag.template.description} ${high ? LEVEL_WORDS[level] : LEVEL_WORDS[level].replace("high", "low")}`,
      value: high ? limit * 1.01 : limit * 0.99,
      limit,
      rtnAt,
      faultId: null,
      occurrenceCount,
      log,
    });
  }

  /** Three "bad actor" tags that keep re-alarming: the classic chattering alarm. */
  private chatter(m: number, t: number): void {
    this.chatterTags.forEach((tag, i) => {
      const seed = this.bgSeed + 1000 + i;
      if (hashNoise(seed, m) >= 0.3) return;
      let count = 0;
      for (let k = m - 59; k <= m; k++) if (hashNoise(seed, k) < 0.3) count++;
      // The log: it sounds again only once it has cleared (2 minutes without a trigger).
      if ((this.chatterActiveUntil.get(tag.tag.id) ?? 0) <= t) {
        const high = tag.template.bad === "high";
        this.log.push({
          t,
          assetId: tag.asset.data.id,
          siteId: tag.asset.data.siteId,
          tagId: tag.tag.id,
          priority: "p4",
          message: `${tag.template.description} ${high ? LEVEL_WORDS[0] : LEVEL_WORDS[0].replace("high", "low")}`,
        });
      }
      this.chatterActiveUntil.set(tag.tag.id, t + 2 * MINUTE);
      if (this.logOnly) return;

      // The live alarm list.
      const existing = this.findActive(tag.tag.id);
      if (existing) {
        existing.alarm.occurrenceCount = Math.min(99, count);
        existing.rtnAt = t + 2 * MINUTE;
        this.markChanged(existing);
      } else {
        this.raiseOnLimit(tag, 0, "p4", t, t + 2 * MINUTE, count, false);
      }
    });
  }

  /** Chaos mode: an alarm flood — 25 alarms in one area within a minute. */
  private flood(m: number, t: number): void {
    const areas = [...new Set(this.candidates.map((c) => c.asset.data.areaId))];
    const areaId = areas[hash2(this.bgSeed + 5, m) % areas.length];
    const inArea = this.candidates.filter((c) => c.asset.data.areaId === areaId);
    for (let i = 0; i < 25 && inArea.length > 0; i++) {
      const tag = inArea[hash2(this.bgSeed + 6, m * 31 + i) % inArea.length];
      if (!tag) continue;
      const priority: AlarmPriority = hashNoise(this.bgSeed + 7, m * 31 + i) < 0.3 ? "p3" : "p4";
      this.raiseOnLimit(tag, 0, priority, t + i * 2000, t + (10 + hashNoise(this.bgSeed + 8, m * 31 + i) * 30) * MINUTE);
    }
  }

  /** Faults crossing limits, and predictions on critical assets. */
  private processFaults(now: number): void {
    for (const fault of this.world.faults) {
      for (const tag of fault.asset.tags) {
        for (const crossing of this.crossingsOf(fault, tag)) {
          if (crossing.t > now || this.faultKeys.has(crossing.key)) continue;
          if (fault.resolvedAt !== null && crossing.t >= fault.resolvedAt) continue;
          this.faultKeys.add(crossing.key);
          const high = tag.template.bad === "high";
          this.raise({
            t: crossing.t,
            asset: fault.asset,
            tag,
            priority: PRIORITY_BY_LEVEL[crossing.level] ?? "p3",
            kind: high ? (crossing.level === 0 ? "high" : "high_high") : crossing.level === 0 ? "low" : "low_low",
            message: `${tag.template.description} ${high ? LEVEL_WORDS[crossing.level] : LEVEL_WORDS[crossing.level].replace("high", "low")}`,
            value: high ? crossing.limit * 1.002 : crossing.limit * 0.998,
            limit: crossing.limit,
            rtnAt: null,
            faultId: fault.id,
          });
        }
      }

      const detectedAt = timeAtProgress(fault, DETECTION_PROGRESS);
      // The cheap checks first, so the key is only built when it might be needed.
      if (fault.asset.data.criticality < 4 || detectedAt > now) continue;
      const key = `${fault.id}:prediction`;
      if (!this.faultKeys.has(key)) {
        if (fault.resolvedAt !== null && detectedAt >= fault.resolvedAt) continue;
        this.faultKeys.add(key);
        const days = Math.round((fault.failAt - detectedAt) / DAY);
        this.raise({
          t: detectedAt,
          asset: fault.asset,
          tag: null,
          priority: "p3",
          kind: "prediction",
          message: `Predicted ${fault.type.failureMode.label.toLowerCase()} — estimated ${days} days to failure`,
          value: null,
          limit: null,
          rtnAt: null,
          faultId: fault.id,
        });
      }
    }
  }

  private crossingsOf(fault: Fault, tag: TagRecord): Crossing[] {
    let byTag = this.crossings.get(fault);
    if (!byTag) this.crossings.set(fault, (byTag = new Map()));
    let entry = byTag.get(tag);
    if (!entry || entry.limits !== tag.tag.limits) {
      const list = limitCrossings(fault, tag).map((c) => ({ ...c, key: `${fault.id}:${tag.tag.id}:${c.level}` }));
      entry = { limits: tag.tag.limits, list };
      byTag.set(tag, entry);
    }
    return entry.list;
  }

  /** Background alarms clearing by themselves; fault alarms clearing after a repair. */
  private processReturns(now: number): void {
    const resolved = new Map<string, number>();
    for (const f of this.world.faults) if (f.resolvedAt !== null && f.resolvedAt <= now) resolved.set(f.id, f.resolvedAt);

    for (const record of this.waiting) {
      const rtn = record.faultId ? resolved.get(record.faultId) : record.rtnAt !== null && record.rtnAt <= now ? record.rtnAt : undefined;
      if (rtn === undefined) continue;
      this.returnToNormal(record, rtn);
    }
  }

  private returnToNormal(record: AlarmRecord, t: number): void {
    const a = record.alarm;
    a.returnedToNormalAt = iso(t);
    const settle = (state: AlarmState): AlarmState =>
      state === "active_unacked" ? "rtn_unacked" : state === "active_acked" ? "cleared" : state;
    if (a.state === "shelved") record.heldState = settle(record.heldState ?? "active_acked");
    else a.state = settle(a.state);
    this.markChanged(record);
  }

  private processShelveExpiry(now: number): void {
    // In raise order, as before; restoring changes the set, so go through a copy.
    for (const record of [...this.shelved].sort((x, y) => x.seq - y.seq)) {
      if (record.alarm.shelve && Date.parse(record.alarm.shelve.until) <= now) {
        this.restoreFromShelf(record);
      }
    }
  }

  private prune(now: number): void {
    const oldest = now - LOG_RETENTION - HOUR;
    if (this.log.length > 0 && this.log[0]!.t < oldest) {
      this.sortLog();
      // The first entry new enough to keep (none: keep everything, as before).
      let lo = 0;
      let hi = this.log.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (this.log[mid]!.t < oldest) lo = mid + 1;
        else hi = mid;
      }
      if (lo < this.log.length) this.log.splice(0, lo);
      this.logSorted = this.log.length;
    }
    // Cleared alarms are forgotten a while after they returned to normal: only the queue's front can be due.
    let due = 0;
    while (due < this.clearedQueue.length && now - this.clearedQueue[due]!.at > RETENTION) due++;
    for (const { record } of this.clearedQueue.splice(0, due)) this.records.delete(record.alarm.id);
  }

  /**
   * Sort the log by time, keeping the order of entries with the same time: exactly what sorting the
   * whole log would do, but the front is already sorted, so only what was added since is sorted
   * and then merged in.
   */
  private sortLog(): void {
    if (this.logSorted >= this.log.length) return;
    const head = this.log;
    const tail = head.slice(this.logSorted).sort((a, b) => a.t - b.t);
    const merged: Activation[] = [];
    let i = 0;
    let j = 0;
    while (i < this.logSorted && j < tail.length) merged.push(head[i]!.t <= tail[j]!.t ? head[i++]! : tail[j++]!);
    while (i < this.logSorted) merged.push(head[i++]!);
    while (j < tail.length) merged.push(tail[j++]!);
    this.log = merged;
    this.logSorted = merged.length;
  }

  // ─── Starting conditions ───────────────────────────────────────────────────

  private operatorFor(asset: AssetRecord): User {
    const regional = this.operators.filter((u) => u.siteIds.includes(asset.data.siteId));
    const pool = regional.length > 0 ? regional : this.operators;
    return pool[hashString(asset.data.id) % pool.length] as User;
  }

  /** Long-standing ("stale") alarms, shelved alarms, and alarms suppressed on equipment under maintenance. */
  private seedStanding(now: number): void {
    const rng = Rng.for(this.world.seed, "standing-alarms");
    for (let i = 0; i < 6; i++) {
      const tag = rng.pick(this.candidates);
      this.raiseOnLimit(tag, 0, rng.pick(["p3", "p4"] as const), now - rng.between(3, 20) * DAY, null);
    }
    for (let i = 0; i < 4; i++) {
      const tag = rng.pick(this.candidates);
      this.raiseOnLimit(tag, 0, "p4", now - rng.between(1, 10) * HOUR, null);
      const record = [...this.records.values()].at(-1);
      if (!record) continue;
      const by = this.operatorFor(tag.asset);
      record.heldState = "active_acked";
      record.alarm.state = "shelved";
      record.alarm.acknowledgedAt = iso(record.raisedAtMs + 5 * MINUTE);
      record.alarm.acknowledgedBy = by.id;
      record.alarm.shelve = { by: by.id, reason: rng.pick(SHELVE_REASONS), until: iso(now + rng.between(2, 20) * HOUR) };
    }
    const inMaintenance = [...this.world.assets.values()].filter(
      (a) => a.staticStatus === "maintenance" && a.tags.some((t) => t.template.bad),
    );
    for (const asset of inMaintenance.slice(0, 6)) {
      const tag = asset.tags.find((t) => t.template.bad);
      if (!tag) continue;
      this.raiseOnLimit(tag, 0, "p4", now - rng.between(1, 48) * HOUR, null);
      const record = [...this.records.values()].at(-1);
      if (record) record.alarm.state = "suppressed";
    }
  }

  private autoAcknowledgeOld(now: number): void {
    for (const record of this.records.values()) {
      const a = record.alarm;
      if ((a.state === "active_unacked" || a.state === "rtn_unacked") && now - record.raisedAtMs > INITIAL_AUTO_ACK_AGE) {
        const asset = this.world.assets.get(a.assetId);
        if (!asset) continue;
        const ackAt = Math.min(now, record.raisedAtMs + (2 + (hashString(a.id) % 38)) * MINUTE);
        a.acknowledgedAt = iso(ackAt);
        a.acknowledgedBy = this.operatorFor(asset).id;
        a.state = a.state === "active_unacked" ? "active_acked" : "cleared";
      }
    }
  }

  // ─── Queries ───────────────────────────────────────────────────────────────

  private inScope(alarm: Alarm, scopeId: string | undefined): boolean {
    if (!scopeId) return true;
    return this.world.assets.get(alarm.assetId)?.scopeIds.has(scopeId) ?? false;
  }

  private findActive(tagId: string): AlarmRecord | undefined {
    for (const r of this.waitingByTag.get(tagId) ?? []) if (r.alarm.state !== "cleared") return r;
    return undefined;
  }

  /** Matching alarms, sorted. With no `states` filter, everything except cleared alarms. */
  query(params: AlarmListParams): Alarm[] {
    const priorityRank = (p: AlarmPriority) => AlarmPriority.options.indexOf(p);
    return [...this.records.values()]
      .map((r) => r.alarm)
      .filter((a) => (params.states ? params.states.includes(a.state) : a.state !== "cleared"))
      .filter((a) => !params.priorities || params.priorities.includes(a.priority))
      .filter((a) => !params.assetId || a.assetId === params.assetId)
      .filter((a) => this.inScope(a, params.scopeId))
      .sort((a, b) =>
        params.sort === "priority" && a.priority !== b.priority
          ? priorityRank(a.priority) - priorityRank(b.priority)
          : b.raisedAt.localeCompare(a.raisedAt),
      );
  }

  all(): Alarm[] {
    return [...this.records.values()].map((r) => r.alarm);
  }

  summary(scopeId: string, now: number): AlarmSummary {
    const zero = () => ({ p1: 0, p2: 0, p3: 0, p4: 0 });
    const summary: AlarmSummary = { scopeId, active: zero(), unacknowledged: zero(), shelved: 0, suppressed: 0, updatedAt: iso(now) };
    for (const { alarm } of this.records.values()) {
      if (!this.inScope(alarm, scopeId)) continue;
      if (alarm.state === "active_unacked" || alarm.state === "active_acked") summary.active[alarm.priority]++;
      if (alarm.state === "active_unacked") summary.unacknowledged[alarm.priority]++;
      if (alarm.state === "shelved") summary.shelved++;
      if (alarm.state === "suppressed" || alarm.state === "out_of_service") summary.suppressed++;
    }
    return summary;
  }

  analytics(params: {
    window: AlarmAnalyticsWindow;
    scopeId: string | undefined;
    sites: readonly { id: string; name: string }[];
    now: number;
  }): AlarmAnalytics {
    return alarmAnalytics({
      log: this.log,
      escalations: this.escalations,
      alarms: this.all().filter((a) => this.inScope(a, params.scopeId)),
      sites: params.sites,
      inScope: (assetId) => !params.scopeId || (this.world.assets.get(assetId)?.scopeIds.has(params.scopeId) ?? false),
      window: params.window,
      now: params.now,
    });
  }

  get(id: string): Alarm {
    return this.record(id).alarm;
  }

  private record(id: string): AlarmRecord {
    const record = this.records.get(id);
    if (!record) throw new ApiFailure("not_found", `Alarm ${id} not found`);
    return record;
  }

  // ─── Operator actions ──────────────────────────────────────────────────────

  acknowledge(ids: readonly string[], userId: string, now: number): Alarm[] {
    const records = ids.map((id) => this.record(id)); // fail before changing anything
    for (const record of records) {
      const a = record.alarm;
      if (a.state !== "active_unacked" && a.state !== "rtn_unacked") continue;
      a.state = a.state === "active_unacked" ? "active_acked" : "cleared";
      a.acknowledgedAt = iso(now);
      a.acknowledgedBy = userId;
      this.markChanged(record);
      this.onOperatorAction(a, `Alarm acknowledged: ${a.message}`, now);
    }
    return records.map((r) => r.alarm);
  }

  escalate(id: string, userId: string, now: number): Alarm {
    const record = this.record(id);
    const a = record.alarm;
    if (a.state !== "active_unacked" && a.state !== "rtn_unacked")
      throw new ApiFailure("conflict", "Only an unanswered alarm can be escalated");
    if ((a.escalation?.level ?? 0) >= ESCALATION_CHAIN.length - 1)
      throw new ApiFailure("conflict", "This alarm is already at the top of the on-call chain");
    this.stepUp(record, now, userId);
    return a;
  }

  shelve(id: string, reason: string, until: number, userId: string, now: number): Alarm {
    if (until <= now) throw new ApiFailure("bad_request", "Shelve expiry must be in the future");
    if (until - now > MAX_SHELVE) throw new ApiFailure("bad_request", "Alarms may be shelved for at most 24 hours");
    const record = this.record(id);
    const a = record.alarm;
    if (a.state === "cleared") throw new ApiFailure("conflict", "A cleared alarm cannot be shelved");
    if (a.state !== "shelved") record.heldState = a.state;
    a.state = "shelved";
    a.shelve = { by: userId, reason, until: iso(until) };
    this.markChanged(record);
    this.onOperatorAction(a, `Alarm shelved until ${a.shelve.until}: ${reason}`, now);
    return a;
  }

  unshelve(id: string, userId: string, now: number): Alarm {
    const record = this.record(id);
    if (record.alarm.state !== "shelved") throw new ApiFailure("conflict", "Alarm is not shelved");
    this.restoreFromShelf(record);
    this.onOperatorAction(record.alarm, `Alarm un-shelved by ${userId}`, now);
    return record.alarm;
  }

  private restoreFromShelf(record: AlarmRecord): void {
    record.alarm.state = record.heldState ?? "active_acked";
    record.alarm.shelve = null;
    record.heldState = null;
    this.markChanged(record);
  }

  linkWorkOrder(id: string, workOrderId: string): void {
    const record = this.record(id);
    record.alarm.workOrderId = workOrderId;
    this.markChanged(record);
  }

  /** For tests and the storyline: alarms raised by a given fault. */
  forFault(fault: Fault): Alarm[] {
    return [...this.records.values()].filter((r) => r.faultId === fault.id).map((r) => r.alarm);
  }
}
