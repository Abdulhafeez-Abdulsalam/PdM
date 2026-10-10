import { z } from "zod";
import { BusinessLine, GeoPoint, HealthState, Id, PageParams, ScopeId, Timestamp } from "./common";

export const AssetClass = z.enum([
  // Oil & gas
  "wellhead",
  "esp", // electric submersible pump
  "rod_pump",
  "separator",
  "pipeline_segment",
  "compressor",
  "pump",
  "heat_exchanger",
  "fired_heater",
  "pressure_vessel",
  "storage_tank",
  "control_valve",
  "psv", // pressure safety valve
  // Gas-to-power
  "gas_turbine",
  "steam_turbine",
  "hrsg", // heat recovery steam generator
  "generator",
  "transformer",
  "switchgear",
  "recip_engine",
  // Solar
  "inverter",
  "pv_string",
  "combiner_box",
  "tracker",
  "bess", // battery energy storage system
  "weather_station",
]);
export type AssetClass = z.infer<typeof AssetClass>;

export const OperatingStatus = z.enum(["running", "standby", "stopped", "tripped", "maintenance"]);
export type OperatingStatus = z.infer<typeof OperatingStatus>;

/** Health score 0–100 (100 = as new) and the state it maps to. */
export const AssetHealth = z.object({
  score: z.number().min(0).max(100),
  state: HealthState,
  updatedAt: Timestamp,
});
export type AssetHealth = z.infer<typeof AssetHealth>;

/**
 * Remaining Useful Life: how long until the asset is expected to need intervention.
 * Given as a range, because predictions are uncertain. "pXX" = XX% chance it fails before that many days:
 *   p10Days — only a 10% chance of failing sooner (the early, cautious edge)
 *   p50Days — 50/50: the middle estimate
 *   p90Days — 90% chance it has failed by then (the late edge)
 */
export const RulEstimate = z
  .object({
    p10Days: z.number().min(0),
    p50Days: z.number().min(0),
    p90Days: z.number().min(0),
    estimatedAt: Timestamp,
  })
  .refine((r) => r.p10Days <= r.p50Days && r.p50Days <= r.p90Days, {
    error: "RUL percentiles must be ordered p10 ≤ p50 ≤ p90",
  });
export type RulEstimate = z.infer<typeof RulEstimate>;

export const Asset = z.object({
  /** The plant tag, unique enterprise-wide, e.g. "GT-101". Used in URLs. */
  id: Id,
  name: z.string().min(1),
  assetClass: AssetClass,
  businessLine: BusinessLine,
  siteId: Id,
  /** The hierarchy node (area/unit) this asset sits in. */
  areaId: Id,
  /** For components: the equipment they belong to. */
  parentAssetId: Id.nullable(),
  manufacturer: z.string(),
  model: z.string(),
  serialNumber: z.string(),
  commissionedAt: Timestamp,
  /** 1 (low consequence if it fails) … 5 (severe). Same scale as the risk-matrix consequence axis. */
  criticality: z.number().int().min(1).max(5),
  operatingStatus: OperatingStatus,
  health: AssetHealth,
  /** null when no model covers this asset class yet. */
  rul: RulEstimate.nullable(),
  location: GeoPoint,
});
export type Asset = z.infer<typeof Asset>;

export const AssetSort = z.enum(["risk_desc", "health_asc", "criticality_desc", "name_asc"]);

export const AssetListParams = PageParams.extend({
  scopeId: ScopeId.optional(),
  businessLine: BusinessLine.optional(),
  assetClass: z.array(AssetClass).optional(),
  healthState: z.array(HealthState).optional(),
  /** Free text: matches id, name, manufacturer, model. */
  search: z.string().max(100).optional(),
  sort: AssetSort.default("risk_desc"),
});
export type AssetListParams = z.infer<typeof AssetListParams>;
