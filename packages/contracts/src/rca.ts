/**
 * FMEA and root-cause analysis (spec §6.7): turning the analysis into action.
 *
 * FMEA (failure mode and effects analysis): for each way a type of equipment fails, how bad
 * it would be (severity), how often it happens (occurrence) and how likely we are to catch it
 * first (detection), each 1–10. RPN = S × O × D ranks where to act.
 *
 * RCA (root-cause analysis): one investigation into a failure, the "why" behind it, and the
 * corrective actions that stop it coming back, which become work orders.
 */
import { z } from "zod";
import { AssetClass } from "./assets";
import { Id, Timestamp } from "./common";
import { FailureCauseCode, FailureModeCode } from "./iso14224";
import { FailurePattern } from "./reliability";

// ─── FMEA ────────────────────────────────────────────────────────────────────

/** Act on a mode with RPN at least this, or severity at least FMEA_SEVERITY_ACT, whatever its RPN. */
export const FMEA_RPN_ACT = 200;
export const FMEA_SEVERITY_ACT = 9;

const Score = z.number().int().min(1).max(10);

/** What the maintenance plan should do about a mode, from its Weibull β and how detectable it is. */
export const MaintenanceStrategy = z.enum(["time_based", "condition_based", "redesign", "run_to_failure"]);
export type MaintenanceStrategy = z.infer<typeof MaintenanceStrategy>;

export const FmeaRow = z.object({
  mode: FailureModeCode,
  cause: FailureCauseCode,
  severity: Score,
  occurrence: Score,
  detection: Score,
  rpn: z.number().int(),
  act: z.boolean(),
  /** Failures per asset per year, over the history (what occurrence comes from). */
  ratePerAssetYear: z.number(),
  failures: z.number().int(),
  /** true when a predictive model watches for this mode on this type (it lowers detection). */
  monitored: z.boolean(),
  pattern: FailurePattern.nullable(),
  /** B10 life in days, when the Weibull fit has one. */
  b10Days: z.number().nullable(),
  strategy: MaintenanceStrategy,
});
export type FmeaRow = z.infer<typeof FmeaRow>;

export const FmeaRequest = z.object({ assetClass: AssetClass });
export type FmeaRequest = z.infer<typeof FmeaRequest>;

export const Fmea = z.object({
  assetClass: AssetClass,
  assets: z.number().int(),
  /** Highest RPN first. */
  rows: z.array(FmeaRow),
  /** Preventive work orders not yet closed for this type: the PM plan these rows feed. */
  plannedPreventive: z.number().int(),
});
export type Fmea = z.infer<typeof Fmea>;

// ─── RCA ─────────────────────────────────────────────────────────────────────

export const RcaStatus = z.enum(["open", "in_review", "closed"]);
export type RcaStatus = z.infer<typeof RcaStatus>;

/** The six classic fishbone (Ishikawa) categories: where causes usually hide. */
export const FISHBONE_CATEGORIES = ["people", "machine", "method", "material", "measurement", "environment"] as const;
export const FishboneCategory = z.enum(FISHBONE_CATEGORIES);
export type FishboneCategory = z.infer<typeof FishboneCategory>;

const CauseText = z.string().trim().min(2).max(200);
export const Fishbone = z.record(FishboneCategory, z.array(CauseText).max(8));
export type Fishbone = z.infer<typeof Fishbone>;

export const CorrectiveAction = z.object({
  id: Id,
  text: z.string().trim().min(5).max(300),
  /** The work order raised for it, if any, and its number as people know it (WO-123). */
  workOrderId: Id.nullable(),
  workOrderNumber: z.string().nullable(),
  createdAt: Timestamp,
});
export type CorrectiveAction = z.infer<typeof CorrectiveAction>;

/** One thing that happened around the failure, for the timeline. */
export const RcaEvent = z.object({
  t: Timestamp,
  kind: z.enum(["failure", "work_order", "alarm", "prediction"]),
  title: z.string(),
  refId: Id.nullable(),
});
export type RcaEvent = z.infer<typeof RcaEvent>;

export const Rca = z.object({
  id: Id,
  assetId: Id,
  assetName: z.string(),
  assetClass: AssetClass,
  title: z.string().trim().min(5).max(200),
  /** The failure being investigated, if it started from one. */
  failureId: Id.nullable(),
  status: RcaStatus,
  /** Ask "why?" until the answer is something you can fix; usually about five times. */
  whys: z.array(z.string().max(300)).length(5),
  fishbone: Fishbone,
  rootCause: z.string().max(1000),
  actions: z.array(CorrectiveAction),
  createdAt: Timestamp,
  updatedAt: Timestamp,
  /** Built from the asset's records when read: failures, work orders, alarms, predictions. Oldest first. */
  timeline: z.array(RcaEvent),
});
export type Rca = z.infer<typeof Rca>;

export const RcaSummary = Rca.pick({ id: true, assetId: true, assetClass: true, title: true, status: true, updatedAt: true }).extend({
  actions: z.number().int(),
});
export type RcaSummary = z.infer<typeof RcaSummary>;

export const CreateRcaRequest = z.object({
  assetId: Id,
  title: z.string().trim().min(5).max(200),
  failureId: Id.nullable().default(null),
});
export type CreateRcaRequest = z.infer<typeof CreateRcaRequest>;

export const UpdateRcaRequest = z.object({
  rcaId: Id,
  whys: z.array(z.string().max(300)).length(5).optional(),
  fishbone: Fishbone.optional(),
  rootCause: z.string().max(1000).optional(),
  status: RcaStatus.optional(),
});
export type UpdateRcaRequest = z.infer<typeof UpdateRcaRequest>;

export const AddActionRequest = z.object({
  rcaId: Id,
  text: z.string().trim().min(5).max(300),
  /** Also raise a work order for it (corrective, assigned to nobody yet, from this RCA). */
  createWorkOrder: z.boolean().default(true),
});
export type AddActionRequest = z.infer<typeof AddActionRequest>;
