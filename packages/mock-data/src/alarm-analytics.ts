/**
 * Alarm system performance (ISA-18.2), worked out from the activation log: one line for every
 * time an alarm sounded. Kept apart from the engine so the arithmetic is easy to read and test.
 */
import {
  AlarmPriority,
  CHATTER_COUNT,
  CHATTER_MINUTES,
  ISA_TARGETS,
  type Alarm,
  type AlarmAnalytics,
  type AlarmAnalyticsWindow,
  type AlarmSource,
} from "@pdm/contracts";
import { DAY, HOUR, MINUTE, iso } from "./clock";

/** One alarm sounding (an annunciation). */
export interface Activation {
  t: number;
  assetId: string;
  siteId: string;
  tagId: string | null;
  priority: AlarmPriority;
  message: string;
}

const WINDOW_MS: Record<AlarmAnalyticsWindow, number> = { "24h": DAY, "7d": 7 * DAY };
const TEN_MINUTES = 10 * MINUTE;

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const sourceKey = (a: Activation) => a.tagId ?? `${a.assetId}:prediction`;

export function alarmAnalytics(input: {
  log: readonly Activation[];
  /** Every step up the on-call chain. */
  escalations: readonly { t: number; assetId: string }[];
  /** Current alarms in scope (for standing, shelved and suppressed). */
  alarms: readonly Alarm[];
  /** Sites (control rooms) in scope, with their names. */
  sites: readonly { id: string; name: string }[];
  inScope: (assetId: string) => boolean;
  window: AlarmAnalyticsWindow;
  now: number;
}): AlarmAnalytics {
  const { window, now } = input;
  const to = Math.floor(now / TEN_MINUTES) * TEN_MINUTES;
  const from = to - WINDOW_MS[window];
  const entries = input.log.filter((a) => a.t >= from && a.t < to && input.inScope(a.assetId));
  const buckets10 = WINDOW_MS[window] / TEN_MINUTES;

  // Per control room: alarms in each 10-minute period.
  const perSite = new Map(input.sites.map((s) => [s.id, new Array<number>(buckets10).fill(0)]));
  for (const a of entries) {
    const counts = perSite.get(a.siteId);
    if (counts) counts[Math.floor((a.t - from) / TEN_MINUTES)]!++;
  }
  const sites = input.sites.map((s) => {
    const counts = perSite.get(s.id)!;
    const total = counts.reduce((sum, n) => sum + n, 0);
    return {
      siteId: s.id,
      siteName: s.name,
      total,
      averagePer10Min: r2(total / buckets10),
      peakPer10Min: Math.max(0, ...counts),
      floodPercent: r1((counts.filter((n) => n > ISA_TARGETS.floodAlarmsPer10Min).length / buckets10) * 100),
    };
  });

  // The whole scope over time: 10-minute buckets for a day, hourly for a week (≤ 200 points).
  const bucketMs = window === "24h" ? TEN_MINUTES : HOUR;
  const points = Array.from({ length: WINDOW_MS[window] / bucketMs }, (_, i) => ({ t: iso(from + i * bucketMs), count: 0 }));
  for (const a of entries) points[Math.floor((a.t - from) / bucketMs)]!.count++;

  // Sources: how often each alarm sounded, and its times (for chattering).
  const bySource = new Map<string, { latest: Activation; times: number[] }>();
  for (const a of entries) {
    const key = sourceKey(a);
    const s = bySource.get(key);
    if (s) {
      s.times.push(a.t);
      if (a.t >= s.latest.t) s.latest = a;
    } else bySource.set(key, { latest: a, times: [a.t] });
  }
  const total = entries.length;
  const toSource = (key: string, latest: Activation, count: number): AlarmSource => ({
    key,
    assetId: latest.assetId,
    tagId: latest.tagId,
    message: latest.message,
    priority: latest.priority,
    count,
    sharePercent: total === 0 ? 0 : r1((count / total) * 100),
  });
  const ranked = [...bySource]
    .map(([key, s]) => toSource(key, s.latest, s.times.length))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
  const badActors = ranked.slice(0, 10);

  // Chattering: CHATTER_COUNT soundings within CHATTER_MINUTES, counted as separate episodes.
  const chattering = [...bySource]
    .map(([key, s]) => {
      const times = [...s.times].sort((a, b) => a - b);
      let episodes = 0;
      for (let i = 0; i + CHATTER_COUNT - 1 < times.length;) {
        if (times[i + CHATTER_COUNT - 1]! - times[i]! <= CHATTER_MINUTES * MINUTE) {
          episodes++;
          i += CHATTER_COUNT;
        } else i++;
      }
      return { ...toSource(key, s.latest, s.times.length), episodes };
    })
    .filter((s) => s.episodes > 0)
    .sort((a, b) => b.episodes - a.episodes || b.count - a.count)
    .slice(0, 20);

  const priorities = Object.fromEntries(AlarmPriority.options.map((p) => [p, 0])) as Record<AlarmPriority, number>;
  for (const a of entries) priorities[a.priority]++;

  const active = (a: Alarm) => a.state === "active_unacked" || a.state === "active_acked";
  return {
    window,
    from: iso(from),
    to: iso(to),
    total,
    sites,
    rate: { bucketMinutes: bucketMs / MINUTE, points },
    badActors,
    top10SharePercent: total === 0 ? 0 : r1((badActors.reduce((sum, s) => sum + s.count, 0) / total) * 100),
    chattering,
    priorities,
    escalated: input.escalations.filter((e) => e.t >= from && e.t < to && input.inScope(e.assetId)).length,
    standing: input.alarms.filter((a) => active(a) && now - Date.parse(a.raisedAt) > DAY).length,
    shelved: input.alarms.filter((a) => a.state === "shelved").length,
    suppressed: input.alarms.filter((a) => a.state === "suppressed" || a.state === "out_of_service").length,
  };
}
