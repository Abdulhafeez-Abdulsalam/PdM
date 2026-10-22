/**
 * Gas-to-power operations (spec §6.3): is each plant producing what it was asked to, how
 * efficiently, and what's eating that efficiency? Plus the counters that decide when a gas
 * turbine is opened up for inspection, and the oil analysis that tells how a transformer is.
 *
 * Power is in kW like every power tag; the screens show MW.
 */
import { z } from "zod";
import { OperatingStatus } from "./assets";
import { Id, ScopeId, Timestamp } from "./common";

// ─── Gas turbines ────────────────────────────────────────────────────────────

/**
 * When fouling is worth an offline compressor water wash: heat rate this much above its
 * ambient-corrected baseline (%), or compressor efficiency this many points below it.
 * Real plants set their own triggers from fuel price and lost output; these are typical.
 */
export const WASH_HEAT_RATE_PCT = 1.5;
export const WASH_COMP_EFF_PTS = -1;

/**
 * Equivalent operating hours (EOH): fired hours, plus a fixed number of hours for every start,
 * because heating up and cooling down wears the hot parts as much as hours of steady running.
 * OEM rules differ (some also weigh trips and peak firing); this is the simple common form.
 */
export const EOH_PER_START = 10;
/** A hot-gas-path inspection (combustors, first turbine stages) every this many EOH. */
export const HGP_INTERVAL_EOH = 24_000;
/** Inspection "due soon" when it's forecast within this many days. */
export const INSPECTION_SOON_DAYS = 90;

export const InspectionType = z.enum(["hot_gas_path", "major"]);
export type InspectionType = z.infer<typeof InspectionType>;

export const GasTurbineRow = z.object({
  assetId: Id,
  assetName: z.string(),
  siteId: Id,
  operatingStatus: OperatingStatus,
  capacityKw: z.number(),
  /** Averages over the last hour; null when the turbine isn't running or has no data. */
  outputKw: z.number().nullable(),
  /** kJ/kWh: fuel energy in per kWh out. Lower is better. */
  heatRate: z.number().nullable(),
  /** What a clean machine would show at today's air temperature and load. */
  heatRateExpected: z.number().nullable(),
  /** (actual − expected) / expected, in %. Positive = burning more fuel than it should. */
  heatRateDeviationPct: z.number().nullable(),
  /** % */
  compressorEff: z.number().nullable(),
  compressorEffExpected: z.number().nullable(),
  /** actual − expected, in percentage points. Negative = dirtier compressor. */
  compressorEffDeviationPts: z.number().nullable(),
  /** Spread of exhaust thermocouples (°C difference): a combustion-health sign. */
  exhaustSpread: z.number().nullable(),
  /** Past either trigger above. */
  washRecommended: z.boolean(),
  eoh: z.object({
    total: z.number(),
    sinceInspection: z.number(),
    starts: z.number().int(),
    startsSinceInspection: z.number().int(),
    /** Typical EOH added per day for this unit's duty (base load ≈ 24, a daily-start peaker less hours but more starts). */
    perDay: z.number(),
    nextType: InspectionType,
    remaining: z.number(),
    /** null when the unit isn't accumulating hours (out of service). */
    nextDueAt: Timestamp.nullable(),
  }),
});
export type GasTurbineRow = z.infer<typeof GasTurbineRow>;

export const TurbineTrendRequest = z.object({
  assetId: Id,
  days: z.number().int().min(1).max(30).default(14),
});
export type TurbineTrendRequest = z.infer<typeof TurbineTrendRequest>;

export const TurbineTrendPoint = z.object({
  t: Timestamp,
  /** null while the turbine was stopped. */
  heatRateDeviationPct: z.number().nullable(),
  compressorEffDeviationPts: z.number().nullable(),
});
export type TurbineTrendPoint = z.infer<typeof TurbineTrendPoint>;

export const TurbineEvent = z.object({
  t: Timestamp,
  /** water_wash = the compressor was cleaned; repair = another fault fixed; trip = it shut down on a fault. */
  kind: z.enum(["water_wash", "repair", "trip"]),
});
export type TurbineEvent = z.infer<typeof TurbineEvent>;

export const TurbineTrend = z.object({
  assetId: Id,
  intervalSeconds: z.number().int().positive(),
  points: z.array(TurbineTrendPoint),
  events: z.array(TurbineEvent),
});
export type TurbineTrend = z.infer<typeof TurbineTrend>;

// ─── Transformer oil analysis (DGA) ──────────────────────────────────────────

/**
 * Gases dissolved in transformer oil, from the lab oil sample. Faults break the oil and paper
 * down into these: hydrogen from partial discharge, ethylene from hot spots, acetylene from
 * arcing, carbon monoxide from overheated paper.
 */
export const DGA_GASES = ["H2", "CH4", "C2H6", "C2H4", "C2H2", "CO"] as const;
export const DgaGas = z.enum(DGA_GASES);
export type DgaGas = z.infer<typeof DgaGas>;

/**
 * IEEE C57.104-2008 "condition" limits, ppm: up to the first number is condition 1 (normal),
 * up to the second condition 2, up to the third condition 3, above it condition 4. The worst
 * gas (or the total) sets the transformer's condition. TDCG = total dissolved combustible gas.
 */
export const DGA_CONDITION_LIMITS: Record<DgaGas | "TDCG", readonly [number, number, number]> = {
  H2: [100, 700, 1800],
  CH4: [120, 400, 1000],
  C2H6: [65, 100, 150],
  C2H4: [50, 100, 200],
  C2H2: [1, 9, 35],
  CO: [350, 570, 1400],
  TDCG: [720, 1920, 4630],
};

export const DgaCondition = z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]);
export type DgaCondition = z.infer<typeof DgaCondition>;

export function dgaCondition(ppm: number, limits: readonly [number, number, number]): DgaCondition {
  return ppm <= limits[0] ? 1 : ppm <= limits[1] ? 2 : ppm <= limits[2] ? 3 : 4;
}

/**
 * Duval triangle 1 zones (IEC 60599): PD partial discharge; T1 thermal fault below 300 °C;
 * T2 300–700 °C; T3 above 700 °C; D1 low-energy discharge (sparking); D2 high-energy
 * discharge (arcing); DT a mix of thermal and electrical.
 */
export const DuvalZone = z.enum(["PD", "T1", "T2", "T3", "D1", "D2", "DT"]);
export type DuvalZone = z.infer<typeof DuvalZone>;

/** Which zone a gas mix falls in, from the three gases' shares of their total (%). */
export function duvalZone(ch4Pct: number, c2h4Pct: number, c2h2Pct: number): DuvalZone {
  if (ch4Pct >= 98) return "PD";
  if (c2h2Pct < 4) return c2h4Pct < 20 ? "T1" : c2h4Pct < 50 ? "T2" : "T3";
  if (c2h2Pct >= 13 && c2h4Pct < 23) return "D1";
  if ((c2h2Pct >= 13 && c2h4Pct < 40) || (c2h2Pct >= 29 && c2h4Pct >= 40)) return "D2";
  if (c2h4Pct >= 50 && c2h2Pct < 15) return "T3";
  return "DT";
}

/**
 * The zones' outlines as [%C2H4, %C2H2] corners (%CH4 is the rest), for drawing the triangle.
 * They follow exactly the boundaries `duvalZone` uses.
 */
export const DUVAL_ZONE_SHAPES: Record<DuvalZone, readonly (readonly [number, number])[]> = {
  PD: [
    [0, 0],
    [2, 0],
    [0, 2],
  ],
  T1: [
    [2, 0],
    [20, 0],
    [20, 4],
    [0, 4],
    [0, 2],
  ],
  T2: [
    [20, 0],
    [50, 0],
    [50, 4],
    [20, 4],
  ],
  T3: [
    [50, 0],
    [100, 0],
    [85, 15],
    [50, 15],
  ],
  D1: [
    [0, 13],
    [23, 13],
    [23, 77],
    [0, 100],
  ],
  D2: [
    [23, 13],
    [40, 13],
    [40, 29],
    [71, 29],
    [23, 77],
  ],
  DT: [
    [0, 4],
    [50, 4],
    [50, 15],
    [85, 15],
    [71, 29],
    [40, 29],
    [40, 13],
    [0, 13],
  ],
};

export const DuvalPoint = z.object({
  ch4Pct: z.number(),
  c2h4Pct: z.number(),
  c2h2Pct: z.number(),
  zone: DuvalZone,
});
export type DuvalPoint = z.infer<typeof DuvalPoint>;

export const DgaSample = z.object({
  sampledAt: Timestamp,
  /** ppm */
  gases: z.record(DgaGas, z.number()),
  tdcg: z.number(),
  condition: DgaCondition,
  /** The gas (or "TDCG") that sets the condition. */
  worst: z.union([DgaGas, z.literal("TDCG")]),
  /** null when the three triangle gases are all zero. */
  duval: DuvalPoint.nullable(),
});
export type DgaSample = z.infer<typeof DgaSample>;

export const TransformerDga = z.object({
  assetId: Id,
  assetName: z.string(),
  siteId: Id,
  /** Newest first; the first is the latest result. */
  samples: z.array(DgaSample).min(1),
  /** TDCG change per day between the last two samples. */
  tdcgPerDay: z.number().nullable(),
});
export type TransformerDga = z.infer<typeof TransformerDga>;

// ─── Plants ──────────────────────────────────────────────────────────────────

/** How many days availability and capacity factor are measured over. */
export const PLANT_KPI_DAYS = 30;

export const PowerPlant = z.object({
  siteId: Id,
  siteName: z.string(),
  /** combined cycle: gas turbines plus a steam turbine running on their exhaust heat. */
  kind: z.enum(["combined_cycle", "peaker"]),
  /** Sum of the generating units' ratings. */
  capacityKw: z.number(),
  outputKw: z.number(),
  /** What the grid operator asked the plant for, now. */
  dispatchKw: z.number(),
  unitsRunning: z.number().int(),
  unitsTotal: z.number().int(),
  /** Share of time the units could run (capacity-weighted), over PLANT_KPI_DAYS. */
  availabilityPct: z.number(),
  /** Energy made ÷ what full capacity all the time would make, over PLANT_KPI_DAYS. */
  capacityFactorPct: z.number(),
  /** Whole-plant fuel per kWh, kJ/kWh; null when nothing is running. */
  heatRate: z.number().nullable(),
  /** Gas turbines with a wash recommendation. */
  washesRecommended: z.number().int(),
  /** Transformers whose latest oil sample is condition 2 or worse. */
  transformersOfConcern: z.number().int(),
});
export type PowerPlant = z.infer<typeof PowerPlant>;

export const OutputPoint = z.object({
  t: Timestamp,
  outputKw: z.number(),
  dispatchKw: z.number(),
});
export type OutputPoint = z.infer<typeof OutputPoint>;

export const PowerOperationsRequest = z.object({
  scopeId: ScopeId.optional(),
  /** The plant to show in detail; default the first in scope. */
  siteId: Id.optional(),
});
export type PowerOperationsRequest = z.infer<typeof PowerOperationsRequest>;

export const PowerOperations = z.object({
  plants: z.array(PowerPlant),
  /** The plant shown in detail (null when no gas-to-power plant is in scope). */
  siteId: Id.nullable(),
  /** Hourly, last 48 hours. */
  output: z.array(OutputPoint),
  turbines: z.array(GasTurbineRow),
  transformers: z.array(TransformerDga),
});
export type PowerOperations = z.infer<typeof PowerOperations>;

/** Asset 360's Performance tab: each kind of equipment shows its own measures. */
export const AssetPerformance = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("gas_turbine"), turbine: GasTurbineRow }),
  z.object({ kind: z.literal("transformer"), dga: TransformerDga }),
  z.object({ kind: z.literal("none") }),
]);
export type AssetPerformance = z.infer<typeof AssetPerformance>;
