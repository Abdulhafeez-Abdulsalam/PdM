/** Made-up but realistic chart data. Fixed (no randomness, no clock), so screenshots repeat exactly. */
import type { LaneEvent, SeriesPoint } from "@pdm/charts";

export const START = Date.UTC(2026, 9, 10, 0);
export const HOUR = 3_600_000;

/** A repeatable pseudo-random sequence in [0, 1). */
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1_103_515_245 + 12_345) % 2_147_483_648;
    return s / 2_147_483_648;
  };
}

/** `hours` hourly points: a slow rise with a daily swing, like a wearing bearing's vibration. */
export function series(hours: number, opts: { base?: number; rise?: number; swing?: number; seed?: number } = {}): SeriesPoint[] {
  const { base = 4, rise = 1.2, swing = 0.25, seed = 7 } = opts;
  const r = noise(seed);
  return Array.from({ length: hours }, (_, i) => {
    const avg = base + (rise * i) / hours + swing * Math.sin((i / 24) * 2 * Math.PI) + (r() - 0.5) * 0.2;
    const spread = 0.1 + r() * 0.25;
    return { t: START + i * HOUR, avg, min: avg - spread, max: avg + spread, quality: "good" as const };
  });
}

export const formatTime = (t: number) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(t) +
  " UTC";
export const formatValue = (v: number) => v.toLocaleString("en-GB", { maximumFractionDigits: 2 });
export const labels = {
  value: "Average",
  range: "Min – max",
  quality: "Data quality",
  qualityNames: { good: "Good", uncertain: "Uncertain", bad: "Bad" },
};

export const LANES = [
  { id: "alarm", label: "Alarms" },
  { id: "operator_action", label: "Operator actions" },
  { id: "maintenance", label: "Maintenance" },
  { id: "process", label: "Process" },
  { id: "prediction", label: "Predictions" },
];

/** A week of events on one asset, from the first warning to the repair. */
export const WEEK_EVENTS: LaneEvent[] = [
  { id: "e1", lane: "prediction", t: START + 20 * HOUR, tone: "degraded", label: "Prediction: bearing wear, 41 % within 30 days" },
  { id: "e2", lane: "alarm", t: START + 52 * HOUR, tone: "watch", label: "Bearing vibration velocity high" },
  { id: "e3", lane: "operator_action", t: START + 53 * HOUR, tone: "neutral", label: "Alarm acknowledged by the control room" },
  { id: "e4", lane: "prediction", t: START + 70 * HOUR, tone: "warning", label: "Prediction: bearing wear, 74 % within 30 days" },
  { id: "e5", lane: "maintenance", t: START + 74 * HOUR, tone: "neutral", label: "WO-1042 created: replace drive-end bearing" },
  { id: "e6", lane: "alarm", t: START + 101 * HOUR, tone: "warning", label: "Bearing vibration velocity high-high" },
  { id: "e7", lane: "process", t: START + 120 * HOUR, tone: "neutral", label: "Pump stopped for maintenance" },
  { id: "e8", lane: "maintenance", t: START + 126 * HOUR, tone: "healthy", label: "WO-1042 completed and verified" },
  { id: "e9", lane: "process", t: START + 128 * HOUR, tone: "neutral", label: "Pump restarted" },
];

/** An alarm flood: many alarms close together, as the lanes must cope with. */
export function floodEvents(count: number): LaneEvent[] {
  const r = noise(11);
  const tones = ["watch", "degraded", "warning", "critical"] as const;
  return Array.from({ length: count }, (_, i) => ({
    id: `f${i}`,
    lane: i % 9 === 0 ? "operator_action" : "alarm",
    t: START + 60 * HOUR + r() * 18 * HOUR,
    tone: tones[Math.floor(r() * tones.length)] ?? "warning",
    label: `Alarm ${i + 1}`,
  }));
}
