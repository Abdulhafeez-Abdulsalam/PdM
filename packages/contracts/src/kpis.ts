import { z } from "zod";
import { ScopeId, Timestamp } from "./common";

/** The Command Center KPI strip (spec §6.1). */
export const KpiKey = z.enum([
  "enterprise_health",
  "availability",
  "mtbf", // mean time between failures
  "mttr", // mean time to repair
  "oee", // overall equipment effectiveness
  "forecast_failures_7d",
  "forecast_failures_30d",
  "forecast_failures_90d",
  "open_critical_alarms",
  "maintenance_backlog",
  "pm_compliance", // preventive maintenance done on time
  "avoided_downtime_hours",
  "avoided_downtime_cost",
  "planned_maintenance_ratio",
]);
export type KpiKey = z.infer<typeof KpiKey>;

/** How to display the number. Labels and descriptions live in the UI text catalog, keyed by KpiKey. */
export const KpiFormat = z.enum(["score", "percent", "hours", "count", "currency"]);

export const Kpi = z.object({
  key: KpiKey,
  /** null = could not be calculated (shown as "—" with the reason in the lineage tooltip). */
  value: z.number().nullable(),
  format: KpiFormat,
  /** ISO 4217 code, only when format is "currency". */
  currency: z.string().length(3).nullable(),
  target: z.number().nullable(),
  /** Tells the UI whether a rising value is good news (green arrow) or bad news. */
  higherIsBetter: z.boolean(),
  /** Change vs the previous period, in percent. */
  changePct: z.number().nullable(),
  /** Recent values for the sparkline, oldest first. */
  trend: z.array(z.number()).max(60),
  updatedAt: Timestamp,
  /** Plain-language provenance: "Calculated from 1,942 assets across 12 sites". */
  lineage: z.string(),
});
export type Kpi = z.infer<typeof Kpi>;

export const KpiParams = z.object({
  scopeId: ScopeId.optional(),
  keys: z.array(KpiKey).optional(),
});

export const KpiResponse = z.object({
  scopeId: ScopeId,
  kpis: z.array(Kpi),
});
export type KpiResponse = z.infer<typeof KpiResponse>;
