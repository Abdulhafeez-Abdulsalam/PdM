/**
 * The 2D digital twin (spec §6.8): "where is it, what's around it, and what happened when?"
 * One area of a site at one moment: every asset's health, its headline value and how far past
 * its limits it is, laid out the way the area works. Process areas as a flow from left to
 * right, solar blocks as inverters with their strings, pipelines as a route by distance.
 * Any moment in the last few days can be replayed.
 */
import { z } from "zod";
import { AssetClass, OperatingStatus } from "./assets";
import { HealthState, Id, Timestamp } from "./common";
import { Quantity } from "./quantities";

/** How far back the time slider goes. */
export const TWIN_REPLAY_HOURS = 72;

export const TwinKind = z.enum(["process", "solar", "pipeline"]);
export type TwinKind = z.infer<typeof TwinKind>;

/** The worst any of the asset's sensors is against its limits at that moment. */
export const LimitLevel = z.enum(["normal", "alert", "alarm", "trip"]);
export type LimitLevel = z.infer<typeof LimitLevel>;

export const TwinValue = z.object({
  tag: z.string(),
  description: z.string(),
  quantity: Quantity,
  value: z.number().nullable(),
});
export type TwinValue = z.infer<typeof TwinValue>;

export const TwinAssetState = z.object({
  assetId: Id,
  name: z.string(),
  assetClass: AssetClass,
  parentAssetId: Id.nullable(),
  health: HealthState,
  score: z.number(),
  status: OperatingStatus,
  limit: LimitLevel,
  /** The sensor furthest past its limits, when one is. */
  limitTag: TwinValue.nullable(),
  /** The values worth showing on the drawing: the first is the headline. */
  values: z.array(TwinValue),
  /** Pipelines only: where the segment starts and ends along the route, km. */
  fromKm: z.number().nullable(),
  toKm: z.number().nullable(),
});
export type TwinAssetState = z.infer<typeof TwinAssetState>;

/** One hour of the replay window: how bad the area's worst sensor got. */
export const TwinHour = z.object({
  t: Timestamp,
  worst: LimitLevel,
  /** Assets past a limit at some point in the hour. */
  assets: z.number().int(),
});
export type TwinHour = z.infer<typeof TwinHour>;

export const TwinRequest = z.object({
  areaId: Id,
  /** How many hours before now to show: 0 is now, TWIN_REPLAY_HOURS the start of the replay window. */
  hoursAgo: z.number().int().min(0).max(TWIN_REPLAY_HOURS).default(0),
});
export type TwinRequest = z.infer<typeof TwinRequest>;

export const TwinArea = z.object({
  areaId: Id,
  areaName: z.string(),
  siteId: Id,
  siteName: z.string(),
  kind: TwinKind,
  /** The moment shown, the start of the replay window, and now. */
  t: Timestamp,
  from: Timestamp,
  now: Timestamp,
  assets: z.array(TwinAssetState),
  /** Hour by hour over the replay window, oldest first. */
  hours: z.array(TwinHour),
});
export type TwinArea = z.infer<typeof TwinArea>;

/**
 * Where each kind of equipment sits in a process area's flow, left to right: what feeds the
 * process, what drives it, what treats it, what turns it into power, and the electrical side.
 * Valves and relief valves protect the whole area and sit underneath.
 */
export const TWIN_STAGES = ["supply", "drive", "process", "power", "grid", "protection"] as const;
export type TwinStage = (typeof TWIN_STAGES)[number];

export const STAGE_OF: Record<AssetClass, TwinStage> = {
  wellhead: "supply",
  storage_tank: "supply",
  weather_station: "supply",
  pipeline_segment: "supply",
  esp: "drive",
  rod_pump: "drive",
  pump: "drive",
  compressor: "drive",
  gas_turbine: "drive",
  steam_turbine: "drive",
  recip_engine: "drive",
  fired_heater: "process",
  separator: "process",
  heat_exchanger: "process",
  hrsg: "process",
  pressure_vessel: "process",
  tracker: "process",
  pv_string: "process",
  combiner_box: "process",
  generator: "power",
  inverter: "power",
  bess: "power",
  transformer: "grid",
  switchgear: "grid",
  control_valve: "protection",
  psv: "protection",
};
