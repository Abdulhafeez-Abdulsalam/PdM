/**
 * Energy and ESG (spec §6.11): "are we on track for emissions targets?"
 *
 * Emissions are worked out from the plant's own measurements, the way a real inventory is:
 *  - combustion: fuel gas burned (turbines, heaters; engines from their output) × an emission factor;
 *  - flaring: gas burned at the flare, higher when compressors are down and gas can't be moved;
 *  - methane: vented or leaked natural gas (compressor seals, pipelines, gas-driven valves,
 *    wellheads), counted as CO₂-equivalent at GWP_CH4.
 * Intensity divides by what the site produces: MWh of power, or barrels of oil equivalent.
 * "Avoidable" is what poor equipment health adds: a fouled turbine burning more fuel per MWh,
 * a leaking seal or pipeline. That's where maintenance and ESG meet.
 */
import { z } from "zod";
import { AssetClass } from "./assets";
import { BusinessLine, HealthState, Id, ScopeId } from "./common";

/** Methane's 100-year global warming potential, fossil origin (IPCC AR6). */
export const GWP_CH4 = 29.8;
/** Days of history the page covers. */
export const ESG_DAYS = 90;

export const EsgRequest = z.object({ scopeId: ScopeId.optional() });
export type EsgRequest = z.infer<typeof EsgRequest>;

/** One day, tonnes CO₂e, and what was produced. */
export const EsgDay = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  combustion: z.number(),
  flaring: z.number(),
  methane: z.number(),
  mwh: z.number(),
  boe: z.number(),
  /** Solar output × the grid's emission factor: emissions the grid didn't have to make. */
  avoided: z.number(),
});
export type EsgDay = z.infer<typeof EsgDay>;

export const EsgIntensity = z.object({ value: z.number(), unit: z.enum(["t_per_mwh", "kg_per_boe"]) });
export type EsgIntensity = z.infer<typeof EsgIntensity>;

export const EsgSite = z.object({
  siteId: Id,
  siteName: z.string(),
  businessLine: BusinessLine,
  /** Over the period, t CO₂e. */
  co2e: z.number(),
  methaneShare: z.number(),
  intensity: EsgIntensity.nullable(),
  avoided: z.number(),
  /** This year's target and where the current rate would end the year, t CO₂e. */
  annualTarget: z.number(),
  projectedAnnual: z.number(),
});
export type EsgSite = z.infer<typeof EsgSite>;

export const EsgEmitter = z.object({
  assetId: Id,
  assetClass: AssetClass,
  siteId: Id,
  health: HealthState,
  source: z.enum(["combustion", "flaring", "methane"]),
  co2e: z.number(),
  /** The part due to poor condition, and why: lost efficiency, a leak, or gas flared while compressors were down. */
  avoidable: z.number(),
  reason: z.enum(["efficiency", "leak", "downtime"]).nullable(),
});
export type EsgEmitter = z.infer<typeof EsgEmitter>;

export const EsgOverview = z.object({
  /** The period, whole days, oldest first. */
  days: z.array(EsgDay),
  totals: z.object({
    combustion: z.number(),
    flaring: z.number(),
    methane: z.number(),
    co2e: z.number(),
    avoided: z.number(),
    avoidable: z.number(),
    annualTarget: z.number(),
    projectedAnnual: z.number(),
  }),
  /** Most emitting first. */
  sites: z.array(EsgSite),
  /** The 20 assets emitting most, with what's avoidable. */
  emitters: z.array(EsgEmitter),
});
export type EsgOverview = z.infer<typeof EsgOverview>;
