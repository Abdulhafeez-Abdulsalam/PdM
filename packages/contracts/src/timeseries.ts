import { z } from "zod";
import { DataQuality, Id, Timestamp } from "./common";

/** ADR-0006: never send more points than this per line. */
export const MAX_POINTS_PER_SERIES = 2000;
/** ADR-0006: at most this many lines on one chart. */
export const MAX_SERIES_PER_CHART = 5;
/** Longest range a single history request may cover (2,000 days at 1-day interval = 2,000 points). */
export const MAX_HISTORY_RANGE_DAYS = 2000;

/** The "nice" aggregation intervals, in seconds, smallest first (ADR-0006). */
export const NICE_INTERVALS_SECONDS = [
  1, 2, 5, 10, 15, 30, // seconds
  60, 120, 300, 600, 900, 1800, // 1, 2, 5, 10, 15, 30 minutes
  3600, 7200, 21600, 43200, // 1, 2, 6, 12 hours
  86400, // 1 day
] as const;
const LONGEST_INTERVAL_SECONDS = 86400;

/**
 * Picks the smallest nice interval that keeps a range under `maxPoints` points.
 * Both the mock and any real backend must use this rule, so it lives in the contract.
 *
 * @example pickIntervalSeconds(7 * 86400) // → 600 (10 minutes → 1,008 points)
 */
export function pickIntervalSeconds(rangeSeconds: number, maxPoints: number = MAX_POINTS_PER_SERIES): number {
  for (const interval of NICE_INTERVALS_SECONDS) {
    if (Math.ceil(rangeSeconds / interval) <= maxPoints) return interval;
  }
  return LONGEST_INTERVAL_SECONDS;
}

/** "Give me history for these tags between `from` and `to`." */
export const HistoryRequest = z
  .object({
    tagIds: z.array(Id).min(1).max(MAX_SERIES_PER_CHART),
    from: Timestamp,
    to: Timestamp,
    maxPoints: z.number().int().min(1).max(MAX_POINTS_PER_SERIES).default(MAX_POINTS_PER_SERIES),
  })
  .refine((r) => Date.parse(r.from) < Date.parse(r.to), { error: "`from` must be before `to`" })
  .refine((r) => Date.parse(r.to) - Date.parse(r.from) <= MAX_HISTORY_RANGE_DAYS * 86_400_000, {
    error: `Range may not exceed ${MAX_HISTORY_RANGE_DAYS} days`,
  });
export type HistoryRequest = z.infer<typeof HistoryRequest>;

/**
 * One aggregated point: average, minimum and maximum of all raw samples in the interval.
 * The chart draws `avg` as the line and `min`–`max` as a band so short spikes stay visible.
 * Intervals with no data are simply missing — a gap in `t` means a gap in the line.
 */
export const HistoryPoint = z.object({
  /** Start of the interval. */
  t: Timestamp,
  avg: z.number(),
  min: z.number(),
  max: z.number(),
  /** Worst quality of any raw sample in the interval. */
  quality: DataQuality,
});
export type HistoryPoint = z.infer<typeof HistoryPoint>;

export const HistorySeries = z.object({
  tagId: Id,
  points: z.array(HistoryPoint).max(MAX_POINTS_PER_SERIES),
});
export type HistorySeries = z.infer<typeof HistorySeries>;

export const HistoryResponse = z.object({
  from: Timestamp,
  to: Timestamp,
  /** The interval the server chose with pickIntervalSeconds. Same for every series. */
  intervalSeconds: z.number().int().positive(),
  series: z.array(HistorySeries),
});
export type HistoryResponse = z.infer<typeof HistoryResponse>;

/** One live reading of one tag. */
export const LiveValue = z.object({
  tagId: Id,
  t: Timestamp,
  value: z.number(),
  quality: DataQuality,
});
export type LiveValue = z.infer<typeof LiveValue>;
