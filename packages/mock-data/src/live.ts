/**
 * One live connection: remembers which tags and which alarm scope the client wants,
 * and once per tick sends only what changed (ADR-0005).
 */
import { MAX_SUBSCRIBED_TAGS, type ClientMessage, type ServerMessage } from "@pdm/contracts";
import type { AlarmEngine } from "./alarms";
import { iso } from "./clock";
import { type ChaosWindows, tagValue } from "./signals";
import type { World } from "./world";

export class LiveHub {
  private readonly tagIds = new Set<string>();
  private alarmScope: string | null = null;
  private readonly lastSent = new Map<string, number>();
  private seq = 0;

  constructor(
    private readonly world: World,
    private readonly chaos: ChaosWindows,
    private readonly alarms: AlarmEngine,
    private readonly send: (message: ServerMessage) => void,
  ) {}

  handle(message: ClientMessage, now: number): void {
    switch (message.type) {
      case "subscribe_tags": {
        const fresh = message.tagIds.filter((id) => !this.tagIds.has(id));
        if (this.tagIds.size + fresh.length > MAX_SUBSCRIBED_TAGS) {
          this.send({
            type: "error",
            error: {
              code: "too_many_tags",
              message: `Subscribing to ${fresh.length} more tags would exceed the limit of ${MAX_SUBSCRIBED_TAGS}`,
              details: { current: this.tagIds.size, requested: fresh.length },
            },
          });
          return;
        }
        const unknown = fresh.filter((id) => !this.world.tags.has(id));
        if (unknown.length > 0) {
          this.send({
            type: "error",
            error: { code: "not_found", message: `Unknown tags: ${unknown.slice(0, 5).join(", ")}`, details: { unknown } },
          });
        }
        for (const id of fresh) if (this.world.tags.has(id)) this.tagIds.add(id);
        break;
      }
      case "unsubscribe_tags":
        for (const id of message.tagIds) {
          this.tagIds.delete(id);
          this.lastSent.delete(id);
        }
        break;
      case "subscribe_alarms":
        this.alarmScope = message.scopeId;
        this.send({ type: "alarm_summary", summary: this.alarms.summary(message.scopeId, now) });
        break;
      case "unsubscribe_alarms":
        this.alarmScope = null;
        break;
      case "ping":
        this.send({ type: "pong", t: iso(now) });
        break;
    }
  }

  get subscribedCount(): number {
    return this.tagIds.size;
  }

  tick(now: number): void {
    this.sendTagValues(now);
    this.flushAlarms(now);
  }

  private sendTagValues(now: number): void {
    if (this.tagIds.size === 0) return;
    const values = [];
    for (const id of this.tagIds) {
      const tag = this.world.tags.get(id);
      if (!tag) continue;
      const reading = tagValue(this.world, this.chaos, tag, now);
      if (!reading || this.lastSent.get(id) === reading.value) continue; // no data or unchanged
      this.lastSent.set(id, reading.value);
      values.push({ tagId: id, t: iso(now), ...reading });
    }
    if (values.length > 0) this.send({ type: "tag_values", seq: this.seq++, t: iso(now), values });
  }

  /**
   * Send alarm changes in the subscribed scope, then fresh counts if anything changed.
   * Note: draining is shared, so this assumes one connection per backend — true in the worker.
   */
  flushAlarms(now: number): void {
    const changed = this.alarms.drainChanges();
    if (!this.alarmScope) return;
    const scopeId = this.alarmScope;
    const relevant = changed.filter((a) => this.world.assets.get(a.assetId)?.scopeIds.has(scopeId));
    for (const alarm of relevant) this.send({ type: "alarm_changed", alarm });
    if (relevant.length > 0) this.send({ type: "alarm_summary", summary: this.alarms.summary(scopeId, now) });
  }
}
