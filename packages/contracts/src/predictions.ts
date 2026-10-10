import { z } from "zod";
import { AssetClass, AssetHealth, RulEstimate } from "./assets";
import { Id, Money, PageParams, Probability, ScopeId, Timestamp } from "./common";
import { MAX_SERIES_PER_CHART } from "./timeseries";

/** A way the asset can fail. Codes follow ISO 14224 where one exists, e.g. "VIB" (vibration), "OHE" (overheating). */
export const FailureMode = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
});
export type FailureMode = z.infer<typeof FailureMode>;

/**
 * How much one sensor pushed the prediction. Positive = towards failure, negative = away from it.
 * Weights across a prediction's contributions sum (in absolute value) to about 1.
 */
export const FeatureContribution = z.object({
  tagId: Id,
  label: z.string(),
  weight: z.number().min(-1).max(1),
});
export type FeatureContribution = z.infer<typeof FeatureContribution>;

/** A reason to trust a prediction less. Shown next to every prediction ("users must always see why"). */
export const DataQualityFlag = z.object({
  code: z.enum(["missing_data", "stale_data", "sensor_drift", "flatline", "out_of_range", "low_sample_count"]),
  tagId: Id.nullable(),
  message: z.string(),
});
export type DataQualityFlag = z.infer<typeof DataQualityFlag>;

export const RecommendedAction = z.object({
  summary: z.string().min(1),
  /** Act before this time to stay ahead of the predicted failure. */
  actBy: Timestamp,
  interventionCost: Money,
  /** Expected cost if we do nothing and it fails (repair + lost production). */
  failureCost: Money,
});
export type RecommendedAction = z.infer<typeof RecommendedAction>;

export const PredictionStatus = z.enum(["open", "acknowledged", "actioned", "dismissed", "closed"]);
export type PredictionStatus = z.infer<typeof PredictionStatus>;

/** What a person found when they checked the prediction (the feedback loop). */
export const PredictionFeedback = z.enum(["true_positive", "false_positive", "found_something_else"]);
export type PredictionFeedback = z.infer<typeof PredictionFeedback>;

export const Prediction = z.object({
  id: Id,
  assetId: Id,
  failureMode: FailureMode,
  /** Chance the failure happens within `horizonDays`. */
  probability: Probability,
  horizonDays: z.number().int().positive(),
  /** How sure the model is of its own estimate (affected by data quality). */
  confidence: Probability,
  detectedAt: Timestamp,
  updatedAt: Timestamp,
  status: PredictionStatus,
  modelId: Id,
  modelVersion: z.string(),
  rul: RulEstimate.nullable(),
  /** Sorted, biggest absolute weight first. */
  contributions: z.array(FeatureContribution),
  dataQuality: z.array(DataQualityFlag),
  /** The signals to chart as evidence. At most one chart's worth. */
  evidenceTagIds: z.array(Id).min(1).max(MAX_SERIES_PER_CHART),
  recommendedAction: RecommendedAction,
  feedback: PredictionFeedback.nullable(),
  workOrderId: Id.nullable(),
});
export type Prediction = z.infer<typeof Prediction>;

export const PredictionListParams = PageParams.extend({
  scopeId: ScopeId.optional(),
  assetId: Id.optional(),
  status: z.array(PredictionStatus).optional(),
});
export type PredictionListParams = z.infer<typeof PredictionListParams>;

/**
 * One row of the "Top risks" list. Risk = probability × consequence,
 * where consequence is the asset's criticality (1–5), so riskScore runs 0–5.
 */
export const RiskItem = z.object({
  rank: z.number().int().positive(),
  assetId: Id,
  assetName: z.string(),
  assetClass: AssetClass,
  siteId: Id,
  health: AssetHealth,
  probability: Probability,
  consequence: z.number().int().min(1).max(5),
  riskScore: z.number().min(0).max(5),
  /** The prediction driving this risk; opens the prediction drawer in one click (acceptance criterion B). */
  predictionId: Id.nullable(),
  failureModeLabel: z.string().nullable(),
  horizonDays: z.number().int().positive().nullable(),
});
export type RiskItem = z.infer<typeof RiskItem>;

export const TopRisksParams = z.object({
  scopeId: ScopeId.optional(),
  limit: z.number().int().min(1).max(50).default(10),
});
export type TopRisksParams = z.infer<typeof TopRisksParams>;
