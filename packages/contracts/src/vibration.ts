/**
 * Rotating-equipment diagnostics (spec §6.3): "what exactly is wrong with this machine's
 * vibration?" The overall level (one number, mm/s) says *how much* a machine shakes; the
 * spectrum says *at which frequencies*, and each fault shakes at its own: unbalance at once per
 * revolution (1×), misalignment at twice (2×), a damaged rolling bearing at its defect
 * frequencies (BPFO, BPFI…), an oil-film bearing going unstable just under half speed.
 */
import { z } from "zod";
import type { AssetClass } from "./assets";
import { Id, Timestamp } from "./common";

/** The kinds of equipment with vibration measurements, and so a Vibration tab. */
export const VIBRATION_CLASSES = [
  "gas_turbine",
  "steam_turbine",
  "generator",
  "compressor",
  "pump",
  "esp",
  "recip_engine",
] as const satisfies readonly AssetClass[];

/** The spectrum runs from 0 to this many times the nominal running speed… */
export const VIBRATION_MAX_ORDER = 12;
/** …in this many lines (bins). */
export const VIBRATION_LINES = 480;

/**
 * Rolling bearings (balls between two rings: pumps, ESPs) have defect frequencies; oil-film
 * ("journal") bearings (big turbines, compressors, generators) don't, but they carry proximity
 * probes that measure the shaft's movement directly, which is what the orbit plot shows.
 */
export const BearingKind = z.enum(["rolling", "journal"]);
export type BearingKind = z.infer<typeof BearingKind>;

export const BearingGeometry = z.object({
  designation: z.string(),
  balls: z.number().int().min(3),
  ballMm: z.number().positive(),
  pitchMm: z.number().positive(),
  contactDeg: z.number().min(0).max(45),
});
export type BearingGeometry = z.infer<typeof BearingGeometry>;

export const VibrationMarkerKey = z.enum(["1x", "2x", "3x", "vane_pass", "ftf", "bsf", "bpfo", "bpfi", "oil_whirl"]);
export type VibrationMarkerKey = z.infer<typeof VibrationMarkerKey>;

export const VibrationFindingCode = z.enum([
  "bearing_outer_race",
  "bearing_inner_race",
  "oil_whirl",
  "flow_instability",
  "misalignment",
  "unbalance",
]);
export type VibrationFindingCode = z.infer<typeof VibrationFindingCode>;

export const VibrationFinding = z.object({
  code: VibrationFindingCode,
  /** "act" once the overall level is past its alert limit; before that, "watch". */
  level: z.enum(["watch", "act"]),
  /** Where in the spectrum the evidence is (null for a broad band). */
  hz: z.number().nullable(),
  /** mm/s RMS: the peak, or the band's total. */
  amplitude: z.number(),
});
export type VibrationFinding = z.infer<typeof VibrationFinding>;

/** One measurement: a spectrum taken at time t. Null values when the machine was stopped. */
export const VibrationSlice = z.object({
  t: Timestamp,
  runningHz: z.number().nullable(),
  /** Overall level, mm/s RMS: the same number as the vibration tag. */
  overall: z.number().nullable(),
  /** mm/s RMS per line; line i is at (i + 1) × fMaxHz / lines. */
  amps: z.array(z.number()).nullable(),
  findings: z.array(VibrationFinding),
});
export type VibrationSlice = z.infer<typeof VibrationSlice>;

/** The shaft centre's path over a few revolutions, from two probes at right angles, µm. */
export const Orbit = z.object({
  t: Timestamp,
  points: z.array(z.tuple([z.number(), z.number()])),
  /** A point every this many is the once-per-turn mark (keyphasor). */
  pointsPerRev: z.number().int(),
  pkPkXUm: z.number(),
  pkPkYUm: z.number(),
});
export type Orbit = z.infer<typeof Orbit>;

export const VibrationRequest = z.object({
  assetId: Id,
  /** The vibration tag to analyse, e.g. "BRG2_VIB". Default: the first. */
  point: z.string().optional(),
});
export type VibrationRequest = z.infer<typeof VibrationRequest>;

export const Vibration = z.object({
  assetId: Id,
  point: z.string(),
  points: z.array(z.object({ tag: z.string(), description: z.string() })),
  bearing: z.object({ kind: BearingKind, geometry: BearingGeometry.nullable() }),
  /** Impeller vanes, for pumps: they make a peak at vanes × running speed. */
  vanes: z.number().int().nullable(),
  fMaxHz: z.number(),
  lines: z.number().int(),
  limits: z.object({ alert: z.number(), alarm: z.number(), trip: z.number() }),
  /** Weekly measurements, oldest first; the last is now. */
  slices: z.array(VibrationSlice),
  /** Journal-bearing machines only, at the latest running slice. */
  orbit: Orbit.nullable(),
});
export type Vibration = z.infer<typeof Vibration>;

/**
 * Bearing defect frequencies as multiples of shaft speed, from the geometry. r = ball / pitch
 * diameter × cos(contact angle). A defect on the outer race is struck by every ball (BPFO =
 * n/2 × (1 − r)); one on the inner race is passed a little faster (BPFI = n/2 × (1 + r)); the
 * cage turns at FTF and each ball spins at BSF.
 */
export function bearingOrders(g: BearingGeometry): { ftf: number; bsf: number; bpfo: number; bpfi: number } {
  const r = (g.ballMm / g.pitchMm) * Math.cos((g.contactDeg * Math.PI) / 180);
  return {
    ftf: 0.5 * (1 - r),
    bsf: (g.pitchMm / (2 * g.ballMm)) * (1 - r * r),
    bpfo: (g.balls / 2) * (1 - r),
    bpfi: (g.balls / 2) * (1 + r),
  };
}

/** Oil whirl: the oil wedge in a worn or lightly loaded journal bearing drags the shaft round at just under half speed. */
export const OIL_WHIRL_ORDER = 0.43;

/** The fault frequencies worth marking on this machine's spectrum, as orders of running speed. */
export function vibrationMarkers(v: Pick<Vibration, "bearing" | "vanes">): { key: VibrationMarkerKey; order: number }[] {
  const markers: { key: VibrationMarkerKey; order: number }[] = [
    { key: "1x", order: 1 },
    { key: "2x", order: 2 },
    { key: "3x", order: 3 },
  ];
  if (v.vanes) markers.push({ key: "vane_pass", order: v.vanes });
  if (v.bearing.geometry) {
    const o = bearingOrders(v.bearing.geometry);
    markers.push(
      { key: "ftf", order: o.ftf },
      { key: "bsf", order: o.bsf },
      { key: "bpfo", order: o.bpfo },
      { key: "bpfi", order: o.bpfi },
    );
  }
  if (v.bearing.kind === "journal") markers.push({ key: "oil_whirl", order: OIL_WHIRL_ORDER });
  return markers.sort((a, b) => a.order - b.order);
}

/** The frequency of spectrum line i. */
export function lineHz(v: Pick<Vibration, "fMaxHz" | "lines">, i: number): number {
  return ((i + 1) * v.fMaxHz) / v.lines;
}

/**
 * The largest line within one line of `hz` (lines are `df` Hz apart). Narrow on purpose: a 6309
 * bearing's BPFO is 3.04×, under two lines from the ordinary 3× peak, and only resolution
 * tells them apart.
 */
export function peakAt(amps: readonly number[], hz: number, df: number): { amp: number; hz: number } {
  const c = hz / df - 1;
  let best = { amp: 0, hz };
  for (let k = Math.max(0, Math.ceil(c - 1)); k <= Math.min(amps.length - 1, Math.floor(c + 1)); k++) {
    if (amps[k]! > best.amp) best = { amp: amps[k]!, hz: (k + 1) * df };
  }
  return best;
}
