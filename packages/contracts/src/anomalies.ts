/**
 * Anomaly score (spec §6.4): one number per moment saying how unusual the asset's sensors look
 * together, compared with its normal behaviour. 0 = perfectly normal, 1 = extremely unusual.
 * Crossing the threshold is what triggers a prediction.
 */
import { z } from "zod";
import { Id, Probability, Timestamp } from "./common";

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
