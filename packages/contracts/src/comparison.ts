/**
 * Fleet comparison (spec §6.2: "benchmark similar assets (e.g. 40 identical inverters,
 * 12 compressors) … rank charts, and outlier detection"). Assets of one class, ranked on one
 * measure, with the ones that stand apart from their sisters flagged.
 */
import { z } from "zod";
import { AssetClass, OperatingStatus } from "./assets";
import { Id, ScopeId } from "./common";
import { Quantity } from "./quantities";

/**
 * What to compare on: "health" (score 0–100), "anomaly" (score 0–1), "rul" (middle estimate,
 * days), or "tag:<SIGNAL>", the current value of a sensor every asset of the class has.
 */
export const CompareMeasureId = z.string().regex(/^(health|anomaly|rul|tag:[A-Z0-9_]+)$/);
export type CompareMeasureId = z.infer<typeof CompareMeasureId>;

export const CompareMeasure = z.object({
  id: CompareMeasureId,
  /** For sensor measures, the sensor's description. Built-in measures are named by the client. */
  label: z.string(),
  /** For converting to the user's units; null for scores and days. */
  quantity: Quantity.nullable(),
  /** Which direction is bad, if either. Used to rank worst first. */
  worse: z.enum(["high", "low"]).nullable(),
});
export type CompareMeasure = z.infer<typeof CompareMeasure>;

/**
 * Outliers use the modified z-score (Iglewicz & Hoaglin): 0.6745 × (value − median) / MAD,
 * where MAD is the median distance from the median. Beyond ±3.5 is an outlier. The median
 * isn't pulled around by the outliers themselves, unlike the average.
 */
export const OUTLIER_SCORE = 3.5;

export const FleetCompareRequest = z.object({
  assetClass: AssetClass,
  scopeId: ScopeId.optional(),
  measure: CompareMeasureId.default("health"),
});
export type FleetCompareRequest = z.infer<typeof FleetCompareRequest>;

export const FleetCompareRow = z.object({
  assetId: Id,
  assetName: z.string(),
  siteId: Id,
  operatingStatus: OperatingStatus,
  /**
   * null when there's no value: offline, no model, a sensor gap, or, for sensor measures, the
   * asset isn't running (a stopped pump's vibration says nothing about its condition).
   */
  value: z.number().nullable(),
  /** Modified z-score; null when the value is missing or the fleet doesn't vary. */
  deviation: z.number().nullable(),
  outlier: z.enum(["high", "low"]).nullable(),
});
export type FleetCompareRow = z.infer<typeof FleetCompareRow>;

export const FleetCompareResponse = z.object({
  assetClass: AssetClass,
  measure: CompareMeasure,
  /** Everything this class can be compared on. */
  measures: z.array(CompareMeasure),
  /** Classes in scope with at least two assets, for the class picker. */
  classes: z.array(z.object({ assetClass: AssetClass, count: z.number().int().min(2) })),
  /** Worst first (by `measure.worse`), then by value; missing values last. */
  items: z.array(FleetCompareRow),
  median: z.number().nullable(),
  /** MAD: the median distance from the median, the "typical spread". */
  mad: z.number().nullable(),
});
export type FleetCompareResponse = z.infer<typeof FleetCompareResponse>;
