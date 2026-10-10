import type { HealthState, TagLimits } from "@pdm/contracts";

export type LimitLevel = "alert" | "alarm" | "trip";

/** Which limit (if any) a value is beyond. Checked worst-first. Values are in SI. */
export function limitLevel(value: number, limits: TagLimits): LimitLevel | null {
  if ((limits.highTrip !== undefined && value >= limits.highTrip) || (limits.lowTrip !== undefined && value <= limits.lowTrip)) return "trip";
  if ((limits.highAlarm !== undefined && value >= limits.highAlarm) || (limits.lowAlarm !== undefined && value <= limits.lowAlarm)) return "alarm";
  if ((limits.highAlert !== undefined && value >= limits.highAlert) || (limits.lowAlert !== undefined && value <= limits.lowAlert)) return "alert";
  return null;
}

/** Limits as a list, for drawing lines and tables. */
export function limitList(limits: TagLimits): { level: LimitLevel; value: number }[] {
  const out: { level: LimitLevel; value: number }[] = [];
  const add = (level: LimitLevel, v: number | undefined) => v !== undefined && out.push({ level, value: v });
  add("alert", limits.highAlert ?? limits.lowAlert);
  add("alarm", limits.highAlarm ?? limits.lowAlarm);
  add("trip", limits.highTrip ?? limits.lowTrip);
  return out;
}

/** The health colour a limit crossing is shown in — matches the alarm priorities. */
export const LIMIT_HEALTH: Record<LimitLevel, HealthState> = { alert: "degraded", alarm: "warning", trip: "critical" };
