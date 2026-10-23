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
