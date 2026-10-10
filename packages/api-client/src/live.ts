/**
 * Live data on the client side (ADR-0005).
 *
 * - Components ask for tags; subscriptions are reference-counted, so two widgets showing
 *   the same tag cost one subscription, and the last one to leave unsubscribes.
 * - Values arrive in batches (at most once per second) and are stored here.
 * - React reads them through useSyncExternalStore (see react.tsx), re-rendering only
 *   components whose tags changed.
 */
import { MAX_SUBSCRIBED_TAGS, type Alarm, type AlarmSummary, type LiveValue, type ServerMessage } from "@pdm/contracts";
import type { Transport } from "./transport";

type Listener = () => void;

export class LiveClient {
  private readonly counts = new Map<string, number>();
  private readonly values = new Map<string, LiveValue>();
  private readonly tagListeners = new Map<string, Set<Listener>>();
  private readonly summaryHandlers = new Set<(s: AlarmSummary) => void>();
  private readonly alarmHandlers = new Set<(alarms: Alarm[]) => void>();
  private readonly gapHandlers = new Set<(tagIds: string[]) => void>();
  private lastSeq: number | null = null;
  private alarmScope: string | null = null;
  private alarmWatchers = 0;

  constructor(private readonly transport: Transport) {
    transport.onMessage((m) => this.receive(m));
  }

  // ─── Tags ──────────────────────────────────────────────────────────────────

  /** Start receiving these tags. Returns a function that stops. */
  subscribeTags(tagIds: readonly string[]): () => void {
    const fresh: string[] = [];
    for (const id of tagIds) {
      const n = this.counts.get(id) ?? 0;
      if (n === 0) fresh.push(id);
      this.counts.set(id, n + 1);
    }
    if (fresh.length > 0) {
      if (this.counts.size > MAX_SUBSCRIBED_TAGS) {
        console.warn(`[live] ${this.counts.size} tags subscribed — over the budget of ${MAX_SUBSCRIBED_TAGS} (ADR-0005)`);
      }
      this.transport.send({ type: "subscribe_tags", tagIds: fresh });
    }

    let done = false;
    return () => {
      if (done) return;
      done = true;
      const gone: string[] = [];
      for (const id of tagIds) {
        const n = (this.counts.get(id) ?? 1) - 1;
        if (n <= 0) {
          this.counts.delete(id);
          this.values.delete(id);
          gone.push(id);
        } else this.counts.set(id, n);
      }
      if (gone.length > 0) this.transport.send({ type: "unsubscribe_tags", tagIds: gone });
    };
  }

  getValue(tagId: string): LiveValue | undefined {
    return this.values.get(tagId);
  }

  /** Listen for changes to one tag (used by useSyncExternalStore). */
  listenTag(tagId: string, listener: Listener): () => void {
    let set = this.tagListeners.get(tagId);
    if (!set) this.tagListeners.set(tagId, (set = new Set()));
    set.add(listener);
    return () => set.delete(listener);
  }

  /** Seed values (e.g. from timeseries.latest) so screens aren't blank before the first live batch. */
  setValues(values: readonly LiveValue[]): void {
    for (const v of values) {
      if (!this.counts.has(v.tagId)) continue;
      this.values.set(v.tagId, v);
      this.tagListeners.get(v.tagId)?.forEach((l) => l());
    }
  }

  /** Called when batches were lost (sequence jump) — the app should refetch latest values. */
  onGap(handler: (tagIds: string[]) => void): () => void {
    this.gapHandlers.add(handler);
    return () => this.gapHandlers.delete(handler);
  }

  // ─── Alarms ────────────────────────────────────────────────────────────────

  /** Watch alarm counts and changes under a hierarchy node. Only one scope at a time. */
  watchAlarms(scopeId: string): () => void {
    this.alarmWatchers++;
    if (this.alarmScope !== scopeId) {
      this.alarmScope = scopeId;
      this.transport.send({ type: "subscribe_alarms", scopeId });
    }
    return () => {
      this.alarmWatchers--;
      if (this.alarmWatchers === 0) {
        this.alarmScope = null;
        this.transport.send({ type: "unsubscribe_alarms" });
      }
    };
  }

  onAlarmSummary(handler: (s: AlarmSummary) => void): () => void {
    this.summaryHandlers.add(handler);
    return () => this.summaryHandlers.delete(handler);
  }

  onAlarmsChanged(handler: (alarms: Alarm[]) => void): () => void {
    this.alarmHandlers.add(handler);
    return () => this.alarmHandlers.delete(handler);
  }

  // ─── Incoming ──────────────────────────────────────────────────────────────

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case "tag_values": {
        if (this.lastSeq !== null && message.seq !== this.lastSeq + 1) {
          const ids = [...this.counts.keys()];
          this.gapHandlers.forEach((h) => h(ids));
        }
        this.lastSeq = message.seq;
        for (const v of message.values) {
          if (!this.counts.has(v.tagId)) continue;
          this.values.set(v.tagId, v);
          this.tagListeners.get(v.tagId)?.forEach((l) => l());
        }
        break;
      }
      case "alarm_summary":
        this.summaryHandlers.forEach((h) => h(message.summary));
        break;
      case "alarm_changed":
        this.alarmHandlers.forEach((h) => h([message.alarm]));
        break;
      case "error":
        console.warn(`[live] ${message.error.code}: ${message.error.message}`);
        break;
      case "pong":
        break;
    }
  }
}
