/**
 * HSE and compliance (spec §6.10): "is anything safety-critical at risk?"
 *
 *  - Safety-critical elements (SCEs): equipment whose failure could cause or fail to stop a
 *    major accident (relief valves, vessels, pipelines, tanks, fired heaters, and anything of
 *    the highest criticality). One is "impaired" when its health is poor, its PM is overdue, or
 *    it has an active P1 alarm.
 *  - Permits to work: written permission for hazardous work, raised when the work is scheduled
 *    and issued by the HSE officer. Work can't start without an issued permit.
 *  - Incidents: process safety events (a loss of containment, tier 1 or 2 by consequence, as in
 *    API RP 754), near misses, equipment damage and environmental releases.
 *  - Management of change (MoC): a change to plant, settings or procedure is reviewed for risk
 *    and approved before it's made.
 */
import { z } from "zod";
import { AssetClass } from "./assets";
import { HealthState, Id, ScopeId, Timestamp } from "./common";

// ─── Safety-critical elements ────────────────────────────────────────────────

export const SceReason = z.enum(["health", "pm_overdue", "alarm"]);
export type SceReason = z.infer<typeof SceReason>;

export const SafetyCriticalElement = z.object({
  assetId: Id,
  assetClass: AssetClass,
  siteId: Id,
  health: HealthState,
  /** Why it's impaired; empty when it isn't. */
  reasons: z.array(SceReason),
});
export type SafetyCriticalElement = z.infer<typeof SafetyCriticalElement>;

// ─── Permits to work ─────────────────────────────────────────────────────────

/** The hazard the permit controls, which decides its precautions. */
export const PermitType = z.enum(["cold_work", "hot_work", "electrical_isolation", "confined_space"]);
export type PermitType = z.infer<typeof PermitType>;

export const PermitStatus = z.enum(["requested", "issued", "closed", "cancelled"]);
export type PermitStatus = z.infer<typeof PermitStatus>;

export const Permit = z.object({
  id: Id,
  workOrderId: Id,
  workOrderNumber: z.string(),
  workOrderTitle: z.string(),
  assetId: Id,
  siteId: Id,
  type: PermitType,
  status: PermitStatus,
  requestedAt: Timestamp,
  /** When the work is planned to start. */
  plannedStart: Timestamp.nullable(),
  issuedAt: Timestamp.nullable(),
  issuedBy: Id.nullable(),
  closedAt: Timestamp.nullable(),
});
export type Permit = z.infer<typeof Permit>;

export const PermitListRequest = z.object({
  scopeId: ScopeId.optional(),
  status: z.array(PermitStatus).optional(),
  workOrderId: Id.optional(),
});
export type PermitListRequest = z.infer<typeof PermitListRequest>;

export const IssuePermitRequest = z.object({ permitId: Id });
export type IssuePermitRequest = z.infer<typeof IssuePermitRequest>;

// ─── Incidents ───────────────────────────────────────────────────────────────

export const IncidentKind = z.enum(["process_safety_event", "near_miss", "equipment_damage", "environmental_release"]);
export type IncidentKind = z.infer<typeof IncidentKind>;

export const Incident = z.object({
  id: Id,
  kind: IncidentKind,
  /** Process safety events only: tier 1 (bigger consequence) or 2. */
  tier: z.union([z.literal(1), z.literal(2)]).nullable(),
  assetId: Id.nullable(),
  siteId: Id,
  occurredAt: Timestamp,
  title: z.string(),
  /** The failure behind it, when there was one. */
  failureId: Id.nullable(),
  /** null for incidents recorded before the demo started. */
  reportedBy: Id.nullable(),
});
export type Incident = z.infer<typeof Incident>;

export const IncidentListRequest = z.object({ scopeId: ScopeId.optional() });
export type IncidentListRequest = z.infer<typeof IncidentListRequest>;

export const ReportIncidentRequest = z.object({
  kind: z.enum(["near_miss", "equipment_damage", "environmental_release"]),
  assetId: Id,
  title: z.string().trim().min(5).max(200),
});
export type ReportIncidentRequest = z.infer<typeof ReportIncidentRequest>;

// ─── Management of change ────────────────────────────────────────────────────

export const MocKind = z.enum(["setpoint", "equipment", "procedure", "temporary"]);
export type MocKind = z.infer<typeof MocKind>;

export const MocRisk = z.enum(["low", "medium", "high"]);
export type MocRisk = z.infer<typeof MocRisk>;

export const MocStatus = z.enum(["proposed", "under_review", "approved", "implemented", "rejected"]);
export type MocStatus = z.infer<typeof MocStatus>;

/** proposed → under review → approved → implemented; a proposal or a review can be rejected. */
export const MOC_TRANSITIONS: Record<MocStatus, readonly MocStatus[]> = {
  proposed: ["under_review", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["implemented"],
  implemented: [],
  rejected: [],
};

export const Moc = z.object({
  id: Id,
  title: z.string(),
  description: z.string(),
  assetId: Id,
  siteId: Id,
  kind: MocKind,
  risk: MocRisk,
  status: MocStatus,
  proposedBy: Id,
  proposedAt: Timestamp,
  updatedAt: Timestamp,
  /** Oldest first. */
  history: z.array(z.object({ at: Timestamp, by: Id, to: MocStatus, note: z.string().nullable() })),
});
export type Moc = z.infer<typeof Moc>;

export const MocListRequest = z.object({ scopeId: ScopeId.optional() });
export type MocListRequest = z.infer<typeof MocListRequest>;

export const CreateMocRequest = z.object({
  title: z.string().trim().min(5).max(200),
  description: z.string().trim().min(10).max(2000),
  assetId: Id,
  kind: MocKind,
  risk: MocRisk,
});
export type CreateMocRequest = z.infer<typeof CreateMocRequest>;

export const MocTransitionRequest = z
  .object({ mocId: Id, to: MocStatus, note: z.string().trim().max(1000).optional() })
  .refine((r) => r.to !== "rejected" || (r.note?.length ?? 0) >= 5, {
    error: "A reason of at least 5 characters is required to reject",
    path: ["note"],
  });
export type MocTransitionRequest = z.infer<typeof MocTransitionRequest>;

// ─── Overview ────────────────────────────────────────────────────────────────

export const HseMonth = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  tier1: z.number().int(),
  tier2: z.number().int(),
  nearMiss: z.number().int(),
  other: z.number().int(),
});
export type HseMonth = z.infer<typeof HseMonth>;

export const HseOverviewRequest = z.object({ scopeId: ScopeId.optional() });
export type HseOverviewRequest = z.infer<typeof HseOverviewRequest>;

export const HseOverview = z.object({
  /** Impaired first. */
  sces: z.array(SafetyCriticalElement),
  counts: z.object({
    sces: z.number().int(),
    impaired: z.number().int(),
    permitsWaiting: z.number().int(),
    permitsIssued: z.number().int(),
    tier1: z.number().int(),
    tier2: z.number().int(),
    nearMisses: z.number().int(),
    openMoc: z.number().int(),
  }),
  daysSinceTier1: z.number().int().nullable(),
  /** The last 12 months, oldest first. */
  monthly: z.array(HseMonth),
});
export type HseOverview = z.infer<typeof HseOverview>;
