/**
 * Oil & gas operations (spec §6.3), in the industry's three parts:
 *
 *   upstream    wells: are they producing what the reservoir allows, and are their pumps healthy?
 *   midstream   pipelines and compressor stations: is the steel thick enough, is gas moving?
 *   downstream  refining: are exchangers fouling, and which inspections are due?
 *
 * Flows use the tags' quantities (liquid_flow, gas_flow) so the screens convert them to the
 * user's units (m³/h, bbl/d…). Thicknesses are mm, rates mm a year.
 */
import { z } from "zod";
import { AssetClass, OperatingStatus } from "./assets";
import { Id, ScopeId, Timestamp } from "./common";

export const OilGasSegment = z.enum(["upstream", "midstream", "downstream"]);
export type OilGasSegment = z.infer<typeof OilGasSegment>;

// ─── Upstream ────────────────────────────────────────────────────────────────

/** Days of production history fitted, and days forecast. */
export const DECLINE_HISTORY_DAYS = 180;
export const DECLINE_FORECAST_DAYS = 180;

/** Daily oil rate (liquid_flow), with the fitted decline curve. `actual` is null in the forecast. */
export const ProductionPoint = z.object({
  t: Timestamp,
  actual: z.number().nullable(),
  fit: z.number(),
});
export type ProductionPoint = z.infer<typeof ProductionPoint>;

/**
 * An exponential (Arps, b = 0) decline q(t) = qᵢ · e^(−D·t), fitted by least squares on ln q.
 * `r2` says how well it fits (1 = perfectly).
 */
export const DeclineFit = z.object({
  qi: z.number(),
  declinePctPerYear: z.number(),
  r2: z.number(),
  from: Timestamp,
});
export type DeclineFit = z.infer<typeof DeclineFit>;

export const LiftType = z.enum(["esp", "rod_pump", "natural"]);
export type LiftType = z.infer<typeof LiftType>;

export const WellRow = z.object({
  assetId: Id,
  siteId: Id,
  areaName: z.string(),
  liftType: LiftType,
  liftAssetId: Id.nullable(),
  operatingStatus: OperatingStatus,
  /** liquid_flow; null without data. */
  oilRate: z.number().nullable(),
  gasRate: z.number().nullable(),
  waterCutPct: z.number().nullable(),
  /** Oil the well would make with its pump working as designed, minus what it makes (liquid_flow). */
  lostOilRate: z.number(),
  declinePctPerYear: z.number(),
});
export type WellRow = z.infer<typeof WellRow>;

/**
 * What an ESP's readings say, checked in this order (the first that applies wins):
 * stopped; motor_hot (winding temperature past its alert limit: insulation is cooking);
 * low_intake (intake pressure past its low alert: the well is being pumped off, or gas is
 * getting in); high_amps (current past its alert: wear, or heavier fluid); else normal.
 */
export const EspDiagnosis = z.enum(["normal", "motor_hot", "low_intake", "high_amps", "stopped", "no_data"]);
export type EspDiagnosis = z.infer<typeof EspDiagnosis>;

export const EspRow = z.object({
  assetId: Id,
  wellId: Id.nullable(),
  operatingStatus: OperatingStatus,
  motorAmps: z.number().nullable(),
  /** °C */
  motorTemp: z.number().nullable(),
  /** pressure (bar) */
  intakePressure: z.number().nullable(),
  /** Hz */
  frequency: z.number().nullable(),
  diagnosis: EspDiagnosis,
});
export type EspRow = z.infer<typeof EspRow>;

export const UpstreamView = z.object({
  segment: z.literal("upstream"),
  production: z.array(ProductionPoint),
  fit: DeclineFit.nullable(),
  oilRate: z.number(),
  gasRate: z.number(),
  waterCutPct: z.number().nullable(),
  wellsProducing: z.number().int(),
  wellsTotal: z.number().int(),
  lostOilRate: z.number(),
  wells: z.array(WellRow),
  esps: z.array(EspRow),
});
export type UpstreamView = z.infer<typeof UpstreamView>;

// ─── Midstream ───────────────────────────────────────────────────────────────

/**
 * Pipeline design for the minimum wall thickness (Barlow's formula, t = P·D ÷ (2·S·F)):
 * 24-inch (610 mm) X65 line pipe (S = 448 MPa yield), design factor 0.72, at 72 bar.
 */
export const PIPELINE_DESIGN = { pressureBar: 72, diameterMm: 610, smysMpa: 448, designFactor: 0.72 } as const;

export function barlowThicknessMm(d = PIPELINE_DESIGN): number {
  return ((d.pressureBar / 10) * d.diameterMm) / (2 * d.smysMpa * d.designFactor);
}

/** Cathodic protection works when the pipe sits at least this negative against the soil (−0.85 V vs Cu/CuSO₄). */
export const CP_CRITERION_V = 0.85;
/** Remaining life under this many years: act; under the second: watch. */
export const REMAINING_LIFE_ACT_YEARS = 10;
export const REMAINING_LIFE_WATCH_YEARS = 25;

export const IntegrityStatus = z.enum(["ok", "watch", "act"]);
export type IntegrityStatus = z.infer<typeof IntegrityStatus>;

/**
 * Wall thickness and corrosion of one piece of steel (pipeline segment, vessel, tank).
 * Remaining life uses the higher of two corrosion rates, as API 570 asks: the long-term one
 * (metal lost since it was new ÷ its age) and the short-term one (the corrosion probe now).
 */
export const Integrity = z.object({
  wallMm: z.number(),
  nominalMm: z.number(),
  requiredMm: z.number(),
  longTermRate: z.number(),
  shortTermRate: z.number().nullable(),
  /** The higher of the two, mm a year. */
  rate: z.number(),
  /** (wall − required) ÷ rate. null when the rate is ~0. */
  remainingLifeYears: z.number().nullable(),
  status: IntegrityStatus,
});
export type Integrity = z.infer<typeof Integrity>;

export const PipelineSegmentRow = z.object({
  assetId: Id,
  sectionName: z.string(),
  /** Kilometre post along the route: where the segment starts and ends. */
  kmFrom: z.number(),
  kmTo: z.number(),
  integrity: Integrity.nullable(),
  /** Pipe-to-soil potential magnitude, V. */
  cpPotentialV: z.number().nullable(),
  cpOk: z.boolean().nullable(),
  leakIndex: z.number().nullable(),
});
export type PipelineSegmentRow = z.infer<typeof PipelineSegmentRow>;

export const CompressorFlag = z.enum(["ok", "surge_close", "efficiency_low", "stopped"]);
export type CompressorFlag = z.infer<typeof CompressorFlag>;

export const CompressorRow = z.object({
  assetId: Id,
  siteId: Id,
  areaName: z.string(),
  operatingStatus: OperatingStatus,
  /** gas_flow */
  flow: z.number().nullable(),
  polytropicEffPct: z.number().nullable(),
  designEffPct: z.number(),
  /** How far (%) the operating point is from surge: flow reversing through the machine. */
  surgeMarginPct: z.number().nullable(),
  flag: CompressorFlag,
});
export type CompressorRow = z.infer<typeof CompressorRow>;

export const MidstreamView = z.object({
  segment: z.literal("midstream"),
  /** Along the route, first kilometre first. */
  pipelines: z.array(PipelineSegmentRow),
  requiredWallMm: z.number(),
  compressors: z.array(CompressorRow),
  /** Gas moving through the pipeline now (gas_flow): the first segment's flow. */
  throughput: z.number().nullable(),
});
export type MidstreamView = z.infer<typeof MidstreamView>;

// ─── Downstream ──────────────────────────────────────────────────────────────

/** Plan an exchanger clean when its effectiveness (vs clean design) drops below this, %. */
export const EXCHANGER_CLEAN_PCT = 85;

export const ExchangerRow = z.object({
  assetId: Id,
  siteId: Id,
  areaName: z.string(),
  operatingStatus: OperatingStatus,
  /** Heat actually transferred ÷ what the clean exchanger would transfer, %. */
  effectivenessPct: z.number().nullable(),
  designPct: z.number(),
  /** bar */
  tubeDpBar: z.number().nullable(),
  /** Change over the last 30 days, points per 30 days (negative = fouling). */
  trendPtsPer30d: z.number().nullable(),
  /** Days until it reaches EXCHANGER_CLEAN_PCT at the current trend; 0 = already there; null = not falling. */
  daysToClean: z.number().nullable(),
  /** 30 daily points of effectiveness, oldest first, for a sparkline. */
  history: z.array(z.number().nullable()),
});
export type ExchangerRow = z.infer<typeof ExchangerRow>;

/**
 * Which rule sets the inspection:
 *   api_510  pressure vessels: internal inspection at least every 10 years, or half the remaining life
 *   api_653  storage tanks: internal inspection at least every 20 years, or half the remaining life
 *   api_576  pressure relief valves: bench test every 3 or 5 years by service (sooner if it leaks)
 *   ili      pipelines: in-line inspection ("pigging") at least every 7 years, or half the remaining life
 */
export const InspectionCode = z.enum(["api_510", "api_653", "api_576", "ili"]);
export type InspectionCode = z.infer<typeof InspectionCode>;

export const InspectionBasis = z.enum(["max_interval", "half_life", "leaking"]);
export type InspectionBasis = z.infer<typeof InspectionBasis>;

export const InspectionItem = z.object({
  assetId: Id,
  assetClass: AssetClass,
  siteId: Id,
  code: InspectionCode,
  lastAt: Timestamp,
  intervalYears: z.number(),
  basis: InspectionBasis,
  nextDueAt: Timestamp,
  remainingLifeYears: z.number().nullable(),
  status: z.enum(["overdue", "due_soon", "ok"]),
});
export type InspectionItem = z.infer<typeof InspectionItem>;

/** "Due soon" when within this many days. */
export const INSPECTION_DUE_SOON_DAYS = 90;

export const DownstreamView = z.object({
  segment: z.literal("downstream"),
  exchangers: z.array(ExchangerRow),
  /** Soonest first. */
  inspections: z.array(InspectionItem),
});
export type DownstreamView = z.infer<typeof DownstreamView>;

// ─── The page ────────────────────────────────────────────────────────────────

/** One line per part, for the cards at the top (whatever part is open). */
export const OilGasSummary = z.object({
  upstream: z.object({
    oilRate: z.number(),
    wellsProducing: z.number().int(),
    wellsTotal: z.number().int(),
    espsFlagged: z.number().int(),
  }),
  midstream: z.object({ segments: z.number().int(), segmentsFlagged: z.number().int(), compressorsFlagged: z.number().int() }),
  downstream: z.object({ exchangersToClean: z.number().int(), inspectionsDue: z.number().int() }),
});
export type OilGasSummary = z.infer<typeof OilGasSummary>;

export const OilGasRequest = z.object({
  scopeId: ScopeId.optional(),
  segment: OilGasSegment.default("upstream"),
});
export type OilGasRequest = z.infer<typeof OilGasRequest>;

export const OilGasOperations = z.object({
  summary: OilGasSummary,
  view: z.discriminatedUnion("segment", [UpstreamView, MidstreamView, DownstreamView]),
});
export type OilGasOperations = z.infer<typeof OilGasOperations>;

/** Asset 360 for oil & gas equipment. */
export const WellPerformance = z.object({ well: WellRow, production: z.array(ProductionPoint), fit: DeclineFit.nullable() });
export type WellPerformance = z.infer<typeof WellPerformance>;
export const IntegrityPerformance = z.object({
  assetId: Id,
  integrity: Integrity.nullable(),
  inspection: InspectionItem.nullable(),
});
export type IntegrityPerformance = z.infer<typeof IntegrityPerformance>;
