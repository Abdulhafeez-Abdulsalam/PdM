/**
 * What if we defer the repair? (Phase 4, chunk 9.) Pure arithmetic on a prediction:
 *
 *  - Remaining life: the prediction gives 10 %, 50 % and 90 % points (p10, p50, p90 days from
 *    when it was estimated). Lives like this are skewed (a long tail of late failures), so we
 *    fit a log-normal: the median is p50 and the spread σ comes from p10–p90 (each 1.2816
 *    standard deviations from the middle).
 *  - It hasn't failed yet: days have passed since the estimate, so the chance of failing in the
 *    next d days is conditional on surviving so far: (F(e + d) − F(e)) ÷ (1 − F(e)).
 *  - Cost: repairing now costs the planned repair; deferring risks the failure instead.
 *    Expected cost = P × failure cost + (1 − P) × repair cost.
 */
import type { Prediction } from "@pdm/contracts";

const Z90 = 1.2816; // the standard normal's 90th percentile

/** The standard normal's cumulative distribution, via erf (Abramowitz & Stegun 7.1.26, error < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const erf = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return z >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
}

export interface Rul {
  p10Days: number;
  p50Days: number;
  p90Days: number;
}

/** Chance of failing within `days` of the estimate (the fitted log-normal's CDF). */
export function failedBy(rul: Rul, days: number): number {
  if (days <= 0) return 0;
  const sigma = Math.max(0.05, (Math.log(rul.p90Days) - Math.log(rul.p10Days)) / (2 * Z90));
  return normalCdf(Math.log(days / rul.p50Days) / sigma);
}

/** Chance of failing in the next `days`, given it has survived the `elapsed` days since the estimate. */
export function failsWithin(rul: Rul, elapsed: number, days: number): number {
  const survived = 1 - failedBy(rul, elapsed);
  if (survived <= 1e-9) return 1;
  return Math.min(1, Math.max(0, (failedBy(rul, elapsed + days) - failedBy(rul, elapsed)) / survived));
}

export interface Deferral {
  days: number;
  /** Chance it fails before the repair. */
  chance: number;
  /** P × failure cost + (1 − P) × repair cost. */
  expectedCost: number;
  /** Expected cost above repairing now: P × (failure cost − repair cost). */
  extra: number;
}

/** The cost of deferring a prediction's repair by `days`, `elapsed` days after its estimate. */
export function deferral(prediction: Pick<Prediction, "rul" | "recommendedAction">, elapsed: number, days: number): Deferral | null {
  if (!prediction.rul) return null;
  const repair = prediction.recommendedAction.interventionCost.amount;
  const failure = prediction.recommendedAction.failureCost.amount;
  const chance = failsWithin(prediction.rul, Math.max(0, elapsed), days);
  return { days, chance, expectedCost: chance * failure + (1 - chance) * repair, extra: chance * (failure - repair) };
}
