/**
 * Anomaly score (spec §6.4): one number per moment saying how unusual the asset's sensors look
 * together, compared with its normal behaviour. 0 = perfectly normal, 1 = extremely unusual.
 * Crossing the threshold is what triggers a prediction.
 */
import { z } from "zod";
import { AssetClass } from "./assets";
import { Id, PageParams, Probability, ScopeId, Timestamp } from "./common";
import { FeatureContribution } from "./predictions";

export const ANOMALY_MAX_POINTS = 500;

export const AnomalyHistoryRequest = z
  .object({
    assetId: Id,
    from: Timestamp,
    to: Timestamp,
    maxPoints: z.number().int().min(10).max(ANOMALY_MAX_POINTS).default(ANOMALY_MAX_POINTS),
  })
  .refine((r) => Date.parse(r.from) < Date.parse(r.to), { error: "`from` must be before `to`" });
export type AnomalyHistoryRequest = z.infer<typeof AnomalyHistoryRequest>;

export const AnomalyPoint = z.object({
  t: Timestamp,
  score: Probability,
});
export type AnomalyPoint = z.infer<typeof AnomalyPoint>;

export const AnomalyHistory = z.object({
  assetId: Id,
  /** Scores above this count as anomalous. */
  threshold: Probability,
  intervalSeconds: z.number().int().positive(),
  points: z.array(AnomalyPoint).max(ANOMALY_MAX_POINTS),
});
export type AnomalyHistory = z.infer<typeof AnomalyHistory>;

// ─── The fleet view (/predictive/anomalies) ──────────────────────────────────

/**
 * Where an asset's anomaly score stands right now:
 *  - anomalous: at or above the threshold (a prediction is raised at this point)
 *  - rising:    below the threshold but at the watch level, or climbing fast: the early warning
 *  - normal:    nothing unusual
 *  - no_data:   no score (the asset is offline, so its sensors are silent)
 */
export const AnomalyState = z.enum(["anomalous", "rising", "normal", "no_data"]);
export type AnomalyState = z.infer<typeof AnomalyState>;

/** Below the threshold, a score this high is worth a look. */
export const ANOMALY_WATCH_LEVEL = 0.3;
/** …and so is a score that rose this much in the last 24 hours. */
export const ANOMALY_RISE_PER_DAY = 0.1;

export const AnomalySummary = z.object({
  assetId: Id,
  assetName: z.string(),
  assetClass: AssetClass,
  siteId: Id,
  state: AnomalyState,
  score: Probability.nullable(),
  scoreDayAgo: Probability.nullable(),
  threshold: Probability,
  /** When the score last crossed the threshold (anomalous assets only). */
  aboveSince: Timestamp.nullable(),
  /** Hourly scores for the last 24 hours, oldest first (null = no data that hour). */
  trend: z.array(Probability.nullable()).max(48),
  /** Contribution analysis: which sensors drive the score, biggest first. Empty when nothing stands out. */
  contributions: z.array(FeatureContribution).max(5),
  /** The open prediction this anomaly led to, if any. */
  predictionId: Id.nullable(),
});
export type AnomalySummary = z.infer<typeof AnomalySummary>;

export const AnomalyFleetRequest = PageParams.extend({
  scopeId: ScopeId.optional(),
  state: z.array(AnomalyState).optional(),
  /** Matches asset id or name. */
  search: z.string().trim().max(100).optional(),
  /** score = most unusual first; rise = biggest climb in the last 24 hours first. */
  sort: z.enum(["score", "rise"]).default("score"),
});
export type AnomalyFleetRequest = z.infer<typeof AnomalyFleetRequest>;

export const AnomalyFleetResponse = z.object({
  items: z.array(AnomalySummary),
  total: z.number().int().min(0),
  offset: z.number().int().min(0),
  limit: z.number().int().min(1),
  /** How many assets in scope are in each state (ignores the state filter and search). */
  counts: z.record(AnomalyState, z.number().int().min(0)),
});
export type AnomalyFleetResponse = z.infer<typeof AnomalyFleetResponse>;
