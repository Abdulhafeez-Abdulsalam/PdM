/**
 * The global time range lives in the URL (?range=7d) so a copied link shows the same view (IA §7).
 * Invalid values fall back to the default instead of breaking the page.
 */
import { z } from "zod";

export const TIME_RANGES = ["live", "1h", "24h", "7d", "30d"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];
export const DEFAULT_TIME_RANGE: TimeRange = "24h";

export const globalSearchSchema = z.object({
  range: z.enum(TIME_RANGES).optional().catch(undefined),
});
export type GlobalSearch = z.infer<typeof globalSearchSchema>;

const HOUR = 3_600_000;
const DURATION_MS: Record<TimeRange, number> = { live: HOUR, "1h": HOUR, "24h": 24 * HOUR, "7d": 7 * 24 * HOUR, "30d": 30 * 24 * HOUR };

/** The [from, to] window for a range, ending at `now`. "Live" shows the last hour and keeps moving. */
export function rangeWindow(range: TimeRange, now: number): { from: number; to: number } {
  return { from: now - DURATION_MS[range], to: now };
}
