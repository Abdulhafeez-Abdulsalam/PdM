/**
 * Reliability KPIs (spec §6.7): how often does equipment fail, how long does it take to fix,
 * how much of the time is it available, and which failures and which assets cost the most?
 *
 * Built from failure records: corrective work coded with ISO 14224 (what failed, why, what
 * was done). Five years of maintenance-system history, plus failures closed out in this session.
 */
import { z } from "zod";
import { AssetClass } from "./assets";
import { Id, ScopeId, Timestamp } from "./common";
import { FailureCauseCode, FailureModeCode, RemedyCode } from "./iso14224";

/** How far back the failure history goes. */
export const FAILURE_HISTORY_YEARS = 5;
/** The same failure mode again on the same asset within this many days is a "repeat failure". */
export const REPEAT_WINDOW_DAYS = 90;
/**
 * A bad actor: an asset failing at least this many times as often as the average of its class,
 * with at least BAD_ACTOR_MIN_FAILURES failures in the period (so one unlucky failure isn't enough).
 */
export const BAD_ACTOR_RATIO = 3;
export const BAD_ACTOR_MIN_FAILURES = 3;

export const FailureRecord = z.object({
  id: Id,
  assetId: Id,
  assetClass: AssetClass,
  siteId: Id,
  failedAt: Timestamp,
  /** Back in service. */
  restoredAt: Timestamp,
  mode: FailureModeCode,
  cause: FailureCauseCode,
  remedy: RemedyCode,
  /** Hands-on repair time: what MTTR measures. */
  repairHours: z.number(),
  /** Out of service in total: waiting for people, parts and permits, plus the repair. */
  downtimeHours: z.number(),
  /** The same mode failed on this asset within REPEAT_WINDOW_DAYS before. */
  repeat: z.boolean(),
  /** "history" = from the maintenance system's records; "work_order" = closed out in this app. */
  source: z.enum(["history", "work_order"]),
  workOrderId: Id.nullable(),
});
export type FailureRecord = z.infer<typeof FailureRecord>;

/**
 * The classic reliability numbers for a group of assets over a period:
 *   MTBF  mean time between failures = operating hours ÷ failures
 *   MTTR  mean time to repair = average hands-on repair hours
 *   availability = time in service ÷ calendar time
 * MTBF is null with no failures in the period (it's "longer than the period"), not infinite.
 */
export const ReliabilityKpis = z.object({
  assets: z.number().int(),
  failures: z.number().int(),
  /** Hours. */
  mtbfHours: z.number().nullable(),
  mttrHours: z.number().nullable(),
  availabilityPct: z.number(),
  downtimeHours: z.number(),
  /** Failures per asset per year. */
  failureRatePerYear: z.number(),
  repeatFailures: z.number().int(),
});
export type ReliabilityKpis = z.infer<typeof ReliabilityKpis>;

export const ClassReliability = ReliabilityKpis.extend({ assetClass: AssetClass });
export type ClassReliability = z.infer<typeof ClassReliability>;

/** One bar of the Pareto: a failure mode's share of all failures (or downtime). */
export const ParetoBar = z.object({
  mode: FailureModeCode,
  failures: z.number().int(),
  downtimeHours: z.number(),
  /** Share of the total (by the chosen measure), and the running total from the biggest down, %. */
  sharePct: z.number(),
  cumulativePct: z.number(),
});
export type ParetoBar = z.infer<typeof ParetoBar>;

export const BadActor = z.object({
  assetId: Id,
  assetName: z.string(),
  assetClass: AssetClass,
  siteId: Id,
  failures: z.number().int(),
  downtimeHours: z.number(),
  repeatFailures: z.number().int(),
  /** This asset's failure rate ÷ its class's average. */
  ratioToClass: z.number(),
  /** The mode it fails by most. */
  topMode: FailureModeCode,
});
export type BadActor = z.infer<typeof BadActor>;

export const MonthCount = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), failures: z.number().int() });
export type MonthCount = z.infer<typeof MonthCount>;

export const ReliabilityPeriod = z.union([z.literal(1), z.literal(3), z.literal(5)]);
export type ReliabilityPeriod = z.infer<typeof ReliabilityPeriod>;

export const ReliabilityRequest = z.object({
  scopeId: ScopeId.optional(),
  /** Years back from now. */
  years: ReliabilityPeriod.default(1),
  /** Only this class (the class table still lists every class). */
  assetClass: AssetClass.optional(),
  paretoBy: z.enum(["failures", "downtime"]).default("failures"),
});
export type ReliabilityRequest = z.infer<typeof ReliabilityRequest>;

export const ReliabilitySummary = z.object({
  from: Timestamp,
  to: Timestamp,
  kpis: ReliabilityKpis,
  /** Every class in scope with at least one asset; most failures first. */
  byClass: z.array(ClassReliability),
  pareto: z.array(ParetoBar),
  /** Bad actors only, worst first (at most 20). */
  badActors: z.array(BadActor),
  monthly: z.array(MonthCount),
});
export type ReliabilitySummary = z.infer<typeof ReliabilitySummary>;

// ─── Weibull analysis ────────────────────────────────────────────────────────

/**
 * What β says about how things fail, and what to do about it:
 *   infant_mortality (β < 0.9)  failures come early after a repair: fix installation and quality;
 *                               replacing on a schedule makes it worse (new parts fail more)
 *   random (0.9–1.1)            age doesn't matter: watch condition instead of replacing on a schedule
 *   wear_out (β > 1.1)          the longer it runs, the likelier it fails: replace or overhaul before B10
 */
export const FailurePattern = z.enum(["infant_mortality", "random", "wear_out"]);
export type FailurePattern = z.infer<typeof FailurePattern>;

export function failurePattern(beta: number): FailurePattern {
  return beta < 0.9 ? "infant_mortality" : beta <= 1.1 ? "random" : "wear_out";
}

export const WeibullRequest = z.object({
  assetClass: AssetClass,
  /** Default: the class's most frequent mode. */
  mode: FailureModeCode.optional(),
  scopeId: ScopeId.optional(),
});
export type WeibullRequest = z.infer<typeof WeibullRequest>;

/**
 * A two-parameter Weibull fitted by maximum likelihood, counting the running items that
 * haven't failed yet ("suspensions") as well as the failures. β = shape, η = scale in days
 * (by η, 63.2 % have failed). Bounds are 90 % two-sided (from the likelihood's curvature).
 */
export const WeibullFit = z.object({
  beta: z.number(),
  betaLow: z.number(),
  betaHigh: z.number(),
  etaDays: z.number(),
  etaLowDays: z.number(),
  etaHighDays: z.number(),
  /** Time by which 10 % have failed. */
  b10Days: z.number(),
  /** Mean time to failure, η·Γ(1 + 1/β). */
  mttfDays: z.number(),
  pattern: FailurePattern,
});
export type WeibullFit = z.infer<typeof WeibullFit>;

export const WeibullAnalysis = z.object({
  assetClass: AssetClass,
  mode: FailureModeCode.nullable(),
  /** The class's modes with their failure counts, most first, for the picker. */
  modes: z.array(z.object({ mode: FailureModeCode, failures: z.number().int() })),
  failures: z.number().int(),
  suspensions: z.number().int(),
  /** null with fewer than WEIBULL_MIN_FAILURES failures. */
  fit: WeibullFit.nullable(),
  /** The failures on Weibull paper: time (days) and estimated share failed by then (median rank, %). */
  points: z.array(z.object({ days: z.number(), unreliabilityPct: z.number() })),
  /** Reliability R(t) = chance of still running at t, with its 90 % band; 100 points to 2.5 × η. */
  curve: z.array(z.object({ days: z.number(), reliability: z.number(), low: z.number(), high: z.number() })),
});
export type WeibullAnalysis = z.infer<typeof WeibullAnalysis>;

/** Too few failures and the fit means little. */
export const WEIBULL_MIN_FAILURES = 5;

// ─── Risk matrix ─────────────────────────────────────────────────────────────

/** Likelihood 1–5 from the chance of failing within a year: under 5 %, 20 %, 50 %, 80 %, and above. */
export const LIKELIHOOD_BOUNDS = [0.05, 0.2, 0.5, 0.8] as const;

export function likelihoodLevel(probability: number): 1 | 2 | 3 | 4 | 5 {
  const i = LIKELIHOOD_BOUNDS.findIndex((b) => probability < b);
  return (i === -1 ? 5 : i + 1) as 1 | 2 | 3 | 4 | 5;
}

export const RiskLevel = z.enum(["low", "medium", "high", "extreme"]);
export type RiskLevel = z.infer<typeof RiskLevel>;

/** Risk = likelihood × consequence (1–25): up to 4 low, up to 9 medium, up to 14 high, 15+ extreme. */
export function riskLevel(likelihood: number, consequence: number): RiskLevel {
  const s = likelihood * consequence;
  return s <= 4 ? "low" : s <= 9 ? "medium" : s <= 14 ? "high" : "extreme";
}

export const Level = z.number().int().min(1).max(5);

export const RiskRequest = z.object({
  scopeId: ScopeId.optional(),
  /** A cell to list; without one, the riskiest assets are listed. */
  likelihood: Level.optional(),
  consequence: Level.optional(),
});
export type RiskRequest = z.infer<typeof RiskRequest>;

export const RiskMatrixItem = z.object({
  assetId: Id,
  assetName: z.string(),
  assetClass: AssetClass,
  siteId: Id,
  likelihood: Level,
  /** The asset's criticality (1–5): how bad a failure would be. */
  consequence: Level,
  /** Chance of failing within a year. */
  probability: z.number(),
  /** "prediction" when an open prediction set it; else "history" (its own failure rate). */
  basis: z.enum(["prediction", "history"]),
});
export type RiskMatrixItem = z.infer<typeof RiskMatrixItem>;

export const RiskMatrix = z.object({
  /** All 25 cells, likelihood 5…1 then consequence 1…5. */
  cells: z.array(z.object({ likelihood: Level, consequence: Level, count: z.number().int() })),
  /** The chosen cell's assets, or the riskiest 30; riskiest first. */
  items: z.array(RiskMatrixItem),
  total: z.number().int(),
});
export type RiskMatrix = z.infer<typeof RiskMatrix>;

/** Asset 360 → Failures: the asset's records, its KPIs and its class's, over the whole history. */
export const AssetFailures = z.object({
  assetId: Id,
  from: Timestamp,
  to: Timestamp,
  /** Newest first. */
  failures: z.array(FailureRecord),
  kpis: ReliabilityKpis,
  classKpis: ReliabilityKpis,
});
export type AssetFailures = z.infer<typeof AssetFailures>;
