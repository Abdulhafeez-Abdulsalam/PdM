/**
 * Preventive maintenance (PM) programs: the planned, repeating work that keeps equipment from
 * failing. Each plan targets one failure mode of one kind of equipment and comes from FMEA's
 * recommended strategy (Phase 3, chunk 6):
 *   - time_based modes (wearing out)  → a planned replacement or overhaul, every so many days
 *     or running hours, set from the mode's B10 life;
 *   - condition_based modes            → a regular condition check (an inspection route).
 * Run-to-failure and design-fix modes get no plan, and say why.
 *
 * PM compliance: of the PM occurrences due in a period, the share done within their window.
 */
import { z } from "zod";
import { AssetClass } from "./assets";
import { Id, ScopeId, Timestamp } from "./common";
import { FailureModeCode, RemedyCode } from "./iso14224";
import { MaintenanceStrategy } from "./rca";
import { FailurePattern } from "./reliability";

/** How far ahead "due soon" and "generate work orders" look. */
export const PM_HORIZON_DAYS = 30;
/** The compliance period, like the Command Center tile. */
export const PM_COMPLIANCE_DAYS = 90;

/** By the calendar, or by running hours (converted to typical days for the plan view). */
export const PmTrigger = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("calendar"), days: z.number().int().positive() }),
  z.object({ kind: z.literal("running_hours"), hours: z.number().int().positive(), typicalDays: z.number().int().positive() }),
]);
export type PmTrigger = z.infer<typeof PmTrigger>;

/** What the plan does: a planned replacement/repair/overhaul, or a condition check. */
export const PmTask = z.enum(["planned_remedy", "condition_check"]);
export type PmTask = z.infer<typeof PmTask>;

export const PmPart = z.object({
  partNumber: z.string(),
  description: z.string(),
  quantity: z.number().int().positive(),
});
export type PmPart = z.infer<typeof PmPart>;

/** One PM falling due on one asset: what became of it. */
export const PmOutcome = z.enum(["on_time", "late", "missed", "overdue", "planned", "upcoming"]);
export type PmOutcome = z.infer<typeof PmOutcome>;

export const PmCounts = z.object({
  /** Due in the compliance period and past their window, or done. */
  decided: z.number().int(),
  onTime: z.number().int(),
  late: z.number().int(),
  missed: z.number().int(),
  /** Past due, not done, not yet a work order: needs action. */
  overdue: z.number().int(),
  /** Due in the next PM_HORIZON_DAYS. */
  dueSoon: z.number().int(),
  /** onTime ÷ decided, %, or null when nothing was due. */
  compliancePct: z.number().nullable(),
});
export type PmCounts = z.infer<typeof PmCounts>;

export const PmPlanSummary = z.object({
  id: Id,
  assetClass: AssetClass,
  mode: FailureModeCode,
  task: PmTask,
  /** For planned_remedy: what is done (replace, overhaul…). */
  remedy: RemedyCode.nullable(),
  strategy: MaintenanceStrategy,
  workType: z.enum(["preventive", "inspection"]),
  trigger: PmTrigger,
  estimatedHours: z.number(),
  parts: z.array(PmPart),
  assets: z.number().int(),
  counts: PmCounts,
  nextDue: Timestamp.nullable(),
});
export type PmPlanSummary = z.infer<typeof PmPlanSummary>;

/** A mode with no plan, and FMEA's reason. */
export const PmUncovered = z.object({
  assetClass: AssetClass,
  mode: FailureModeCode,
  strategy: MaintenanceStrategy,
});
export type PmUncovered = z.infer<typeof PmUncovered>;

export const PmMonth = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  onTime: z.number().int(),
  late: z.number().int(),
  missed: z.number().int(),
});
export type PmMonth = z.infer<typeof PmMonth>;

export const PmOverviewRequest = z.object({
  scopeId: ScopeId.optional(),
  assetClass: AssetClass.optional(),
});
export type PmOverviewRequest = z.infer<typeof PmOverviewRequest>;

export const PmOverview = z.object({
  counts: PmCounts,
  /** Most overdue first. */
  plans: z.array(PmPlanSummary),
  uncovered: z.array(PmUncovered),
  /** The last 12 months, oldest first: occurrences by outcome, by the month they were due. */
  monthly: z.array(PmMonth),
});
export type PmOverview = z.infer<typeof PmOverview>;

export const PmAssetStatus = z.object({
  assetId: Id,
  siteId: Id,
  lastDone: Timestamp.nullable(),
  nextDue: Timestamp.nullable(),
  /** The state of its most pressing occurrence. */
  status: z.enum(["ok", "due_soon", "overdue", "planned"]),
  /** The open work order from this plan, if one is planned. */
  workOrderId: Id.nullable(),
  workOrderNumber: z.string().nullable(),
  compliancePct: z.number().nullable(),
});
export type PmAssetStatus = z.infer<typeof PmAssetStatus>;

export const PmPlanRequest = z.object({ planId: Id, scopeId: ScopeId.optional() });
export type PmPlanRequest = z.infer<typeof PmPlanRequest>;

export const PmPlanDetail = PmPlanSummary.extend({
  /** Why the plan exists: the FMEA scores and Weibull life of its mode. */
  why: z.object({
    severity: z.number().int(),
    occurrence: z.number().int(),
    detection: z.number().int(),
    rpn: z.number().int(),
    pattern: FailurePattern.nullable(),
    b10Days: z.number().nullable(),
  }),
  /** Overdue first, then by next due date. */
  assetStatus: z.array(PmAssetStatus),
  monthly: z.array(PmMonth),
});
export type PmPlanDetail = z.infer<typeof PmPlanDetail>;

/** Raise work orders for everything due within the horizon (or overdue) that has none yet. */
export const GeneratePmRequest = z.object({ planId: Id, scopeId: ScopeId.optional() });
export type GeneratePmRequest = z.infer<typeof GeneratePmRequest>;

export const GeneratePmResult = z.object({
  created: z.array(z.object({ workOrderId: Id, number: z.string(), assetId: Id, dueAt: Timestamp })),
});
export type GeneratePmResult = z.infer<typeof GeneratePmResult>;
