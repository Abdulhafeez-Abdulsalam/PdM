/**
 * Solar operations (spec §6.3): how much energy are we losing, and where? Power against what
 * the sunlight should give, the performance ratio, the losses step by step from sunlight to
 * grid, inverters and strings that lag their sisters, dust on the panels, and the batteries.
 *
 * Power is in kW, energy in kWh; the screens show MW and MWh.
 */
import { z } from "zod";
import { OperatingStatus } from "./assets";
import { Id, ScopeId, Timestamp } from "./common";

/** How many days the performance ratio and the loss waterfall cover. */
export const SOLAR_KPI_DAYS = 7;
/** An inverter making less than this share of its expected energy is flagged. */
export const INVERTER_FLAG_PCT = 95;
/** A string making less than this share of its sister strings' median is flagged. */
export const STRING_FLAG_PCT = 95;

/**
 * The steps from sunlight to the grid, in order. Each is energy lost (kWh); "temperature" can
 * be a small gain on cold mornings.
 *
 *   temperature  hot panels make less (about 0.4% per °C above 25 °C)
 *   soiling      dust on the panels
 *   inverter     DC→AC conversion
 *   clipping     sunlight the inverter couldn't pass (the array is bigger than the inverter)
 *   downtime     inverters stopped, tripped or derated by a fault
 *   strings      strings underperforming (failed bypass diodes, hot spots…)
 *   other        everything else: wiring, mismatch, measurement noise
 */
export const SOLAR_LOSS_STEPS = ["temperature", "soiling", "inverter", "clipping", "downtime", "strings", "other"] as const;
export const SolarLossStep = z.enum(SOLAR_LOSS_STEPS);
export type SolarLossStep = z.infer<typeof SolarLossStep>;

export const SolarWaterfall = z.object({
  /** What the panels' nameplate would make from the sunlight that fell on them (kWh). */
  sunKwh: z.number(),
  losses: z.array(z.object({ step: SolarLossStep, kwh: z.number() })),
  /** Delivered (kWh). sunKwh − Σ losses = actualKwh. */
  actualKwh: z.number(),
});
export type SolarWaterfall = z.infer<typeof SolarWaterfall>;

export const SolarPlant = z.object({
  siteId: Id,
  siteName: z.string(),
  /** Panel nameplate (kWp). */
  dcCapacityKw: z.number(),
  /** Inverter nameplate. */
  acCapacityKw: z.number(),
  outputKw: z.number(),
  /** What the PV model says the sunlight should give right now, with every inverter running. */
  expectedKw: z.number(),
  /** Sunlight on the panels now, W/m². */
  irradiance: z.number(),
  /**
   * Performance ratio over SOLAR_KPI_DAYS, %: energy delivered ÷ what the nameplate would make
   * from the sunlight that fell (IEC 61724). Takes the weather out, so plants can be compared.
   */
  performanceRatioPct: z.number().nullable(),
  energyKwh: z.number(),
  soilingPct: z.number(),
  invertersFlagged: z.number().int(),
  stringsFlagged: z.number().int(),
});
export type SolarPlant = z.infer<typeof SolarPlant>;

export const SolarPowerPoint = z.object({
  t: Timestamp,
  actualKw: z.number(),
  expectedKw: z.number(),
});
export type SolarPowerPoint = z.infer<typeof SolarPowerPoint>;

export const InverterTile = z.object({
  assetId: Id,
  /** The block it sits in, e.g. "Block A". */
  areaName: z.string(),
  operatingStatus: OperatingStatus,
  /** Energy made ÷ expected over the last 24 hours, %. null: offline (no data). */
  performancePct: z.number().nullable(),
  energyKwh: z.number().nullable(),
  /** Expected − made, kWh (last 24 hours). */
  lossKwh: z.number().nullable(),
});
export type InverterTile = z.infer<typeof InverterTile>;

export const StringRow = z.object({
  assetId: Id,
  inverterId: Id,
  /** This string's energy over the last 24 hours ÷ the median of its sister strings (same inverter), %. */
  pctOfSisters: z.number(),
  /** The string monitor's own performance index (%), now. */
  perfIndex: z.number().nullable(),
});
export type StringRow = z.infer<typeof StringRow>;

export const BessRow = z.object({
  assetId: Id,
  assetName: z.string(),
  operatingStatus: OperatingStatus,
  socPct: z.number().nullable(),
  /** State of health: usable capacity left compared with new, %. */
  sohPct: z.number().nullable(),
  /** Spread between the highest and lowest cell voltage, mV. A growing spread means cells drifting apart. */
  cellSpreadMv: z.number().nullable(),
  cellTempMaxC: z.number().nullable(),
  state: z.enum(["charging", "discharging", "idle"]),
  /** Hourly state of charge (%), aligned with SolarOperations.power. */
  soc: z.array(z.number().nullable()),
});
export type BessRow = z.infer<typeof BessRow>;

/**
 * When to wash the panels. Dust builds up at a steady rate, so the money lost grows every day,
 * while a wash costs the same each time. The cheapest rhythm is to wash every
 *
 *   T* = √(2 × wash cost ÷ (daily revenue × soiling rate per day))   days
 *
 * (lost revenue over a cycle is revenue × rate × T² ÷ 2; add the wash and divide by T, then
 * find the T where that's smallest).
 */
export const SoilingAdvice = z.object({
  soilingPct: z.number(),
  ratePctPerDay: z.number(),
  lastCleanedAt: Timestamp,
  /** Energy and revenue lost per day at today's soiling. */
  lossKwhPerDay: z.number(),
  lossValuePerDay: z.number(),
  /** Revenue lost since the last cleaning. */
  lossValueSinceCleaning: z.number(),
  cleaningCost: z.number(),
  currency: z.literal("USD"),
  pricePerMwh: z.number(),
  optimalIntervalDays: z.number(),
  recommendation: z.enum(["clean_now", "clean_soon", "wait"]),
  /** Days until the next cleaning pays (0 = now). */
  cleanInDays: z.number(),
});
export type SoilingAdvice = z.infer<typeof SoilingAdvice>;

/** Within this many days of the best time, "clean soon". */
export const CLEAN_SOON_DAYS = 7;

export const SolarOperationsRequest = z.object({
  scopeId: ScopeId.optional(),
  /** The plant to show in detail; default the first in scope. */
  siteId: Id.optional(),
});
export type SolarOperationsRequest = z.infer<typeof SolarOperationsRequest>;

export const SolarOperations = z.object({
  plants: z.array(SolarPlant),
  siteId: Id.nullable(),
  /** Hourly, last 48 hours. */
  power: z.array(SolarPowerPoint),
  waterfall: SolarWaterfall.nullable(),
  inverters: z.array(InverterTile),
  /** Flagged strings only, worst first. */
  strings: z.array(StringRow),
  bess: z.array(BessRow),
  soiling: SoilingAdvice.nullable(),
});
export type SolarOperations = z.infer<typeof SolarOperations>;

/** Asset 360 for an inverter: its output against the PV model, hourly over 48 hours. */
export const InverterPerformance = z.object({
  tile: InverterTile,
  power: z.array(SolarPowerPoint),
  /** Energy clipped in the last 24 hours, kWh. */
  clippedKwh: z.number(),
  strings: z.array(z.object({ assetId: Id, pctOfSisters: z.number().nullable() })),
});
export type InverterPerformance = z.infer<typeof InverterPerformance>;

/** Asset 360 for a string: its power against the median of its sisters, hourly over 48 hours. */
export const StringPerformance = z.object({
  assetId: Id,
  inverterId: Id,
  pctOfSisters: z.number().nullable(),
  perfIndex: z.number().nullable(),
  power: z.array(z.object({ t: Timestamp, kw: z.number().nullable(), sistersMedianKw: z.number().nullable() })),
});
export type StringPerformance = z.infer<typeof StringPerformance>;

/** Asset 360 for a battery: its row, with SOC over 48 hours. */
export const BessPerformance = z.object({
  row: BessRow,
  times: z.array(Timestamp),
});
export type BessPerformance = z.infer<typeof BessPerformance>;
