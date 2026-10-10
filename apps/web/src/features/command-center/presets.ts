/**
 * Role-specific Command Center layouts (IA §5): each role's KPI strip answers its first
 * question of the day. Six KPIs max — enough to scan in a few seconds.
 */
import type { KpiKey, RoleId } from "@pdm/contracts";

export const KPI_PRESETS: Record<RoleId, readonly KpiKey[]> = {
  executive: ["enterprise_health", "availability", "avoided_downtime_cost", "forecast_failures_30d", "open_critical_alarms", "planned_maintenance_ratio"],
  plant_manager: ["enterprise_health", "availability", "maintenance_backlog", "forecast_failures_30d", "pm_compliance", "open_critical_alarms"],
  reliability_engineer: ["enterprise_health", "mtbf", "forecast_failures_30d", "forecast_failures_90d", "planned_maintenance_ratio", "avoided_downtime_hours"],
  condition_analyst: ["enterprise_health", "forecast_failures_7d", "forecast_failures_30d", "forecast_failures_90d", "open_critical_alarms", "avoided_downtime_hours"],
  control_room_operator: ["open_critical_alarms", "availability", "forecast_failures_7d", "enterprise_health"],
  maintenance_planner: ["maintenance_backlog", "pm_compliance", "forecast_failures_30d", "planned_maintenance_ratio", "mttr", "availability"],
  field_technician: ["forecast_failures_7d", "maintenance_backlog", "open_critical_alarms", "enterprise_health"],
  hse_officer: ["open_critical_alarms", "enterprise_health", "forecast_failures_7d", "pm_compliance"],
  procurement: ["forecast_failures_30d", "forecast_failures_90d", "maintenance_backlog", "enterprise_health"],
  esg_lead: ["enterprise_health", "availability", "forecast_failures_30d", "avoided_downtime_hours"],
  system_admin: ["enterprise_health", "availability", "open_critical_alarms", "maintenance_backlog"],
};
