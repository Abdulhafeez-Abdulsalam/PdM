/**
 * Vibration spectra with real fault signatures (spec §6.3), consistent with the vibration tags.
 *
 * A spectrum is built in two parts and added as energies (RMS² adds, amplitudes don't):
 *   - the machine's healthy pattern: 1×, a little 2× and 3× (more 2× if it's slightly
 *     misaligned), vane pass on pumps, and a low noise floor;
 *   - each active fault's own pattern: a rolling bearing's defect frequency and its harmonics,
 *     a journal bearing's oil whirl, a compressor's low-frequency flow noise near surge.
 * The total is scaled so the spectrum's overall level equals the tag's reading at that moment,
 * and the fault's share of it is exactly the share the fault adds to the tag. So the tag, its
 * alarms and the spectrum always tell the same story; the spectrum just says *why*.
 */
import {
  OIL_WHIRL_ORDER,
  VIBRATION_LINES,
  VIBRATION_MAX_ORDER,
  bearingOrders,
  peakAt,
  vibrationMarkers,
  type AssetClass,
  type BearingGeometry,
  type BearingKind,
  type Orbit,
  type Vibration,
  type VibrationFinding,
  type VibrationSlice,
} from "@pdm/contracts";
import { DAY, HOUR, iso } from "./clock";
import { ApiFailure } from "./errors";
import { faultOffset, progress } from "./faults";
import type { AssetRecord, Fault, TagRecord } from "./model";
import { hashNoise, hashString } from "./random";
import { operating, tagValue, type ChaosWindows } from "./signals";
import type { World } from "./world";

/** Deep-groove ball bearings typical of the machine (real catalogue geometry). */
const BEARINGS: Partial<Record<AssetClass, BearingGeometry>> = {
  pump: { designation: "6309", balls: 8, ballMm: 17.462, pitchMm: 72.5, contactDeg: 0 },
  esp: { designation: "6205", balls: 9, ballMm: 7.938, pitchMm: 39.04, contactDeg: 0 },
};
const VANES: Partial<Record<AssetClass, number>> = { pump: 6, esp: 7 };
/** Pumps have no speed tag: a two-pole motor on 50 Hz. */
const PUMP_RPM = 2975;
/** An ESP motor runs a few percent behind its drive frequency (slip). */
const ESP_SLIP = 0.03;

export const VIBRATION_WEEKS = 12;
const ACT_FRACTION = { peak: 0.06, whirl: 0.1, band: 0.2 } as const;

interface Ctx {
  world: World;
  chaos: ChaosWindows;
  now: number;
}

function tagOf(asset: AssetRecord, name: string): TagRecord | undefined {
  return asset.tags.find((t) => t.template.name === name);
}

/** Shaft speed in Hz from the asset's speed or frequency tag; `nominal` uses the healthy base value. */
function speedHz(ctx: Ctx, asset: AssetRecord, t: number, nominal = false): number {
  const cls = asset.data.assetClass;
  if (cls === "pump") return PUMP_RPM / 60;
  const speed = tagOf(asset, "SPEED");
  const freq = tagOf(asset, "FREQ");
  const read = (tag: TagRecord) => (nominal ? tag.base : (tagValue(ctx.world, ctx.chaos, tag, t)?.value ?? tag.base));
  if (speed) return read(speed) / 60;
  if (freq) return read(freq) * (cls === "esp" ? 1 - ESP_SLIP : 1); // generators: two-pole, so shaft Hz = grid Hz
  return PUMP_RPM / 60;
}

export function bearingKind(cls: AssetClass): BearingKind {
  return BEARINGS[cls] ? "rolling" : "journal";
}

/** Adds a peak, spread over a few lines the way a windowed FFT spreads it. */
function addPeak(shape: Float64Array, hz: number, amp: number, df: number): void {
  const c = hz / df - 1;
  for (let k = Math.floor(c) - 3; k <= Math.ceil(c) + 3; k++) {
    if (k < 0 || k >= shape.length) continue;
    shape[k]! += amp * Math.exp(-0.5 * ((k - c) / 0.7) ** 2);
  }
}

function energy(shape: Float64Array): number {
  let e = 0;
  for (const v of shape) e += v * v;
  return Math.sqrt(e);
}

/** The machine's own healthy pattern. Seeded per asset and point, so it's the same every week. */
function healthyShape(asset: AssetRecord, point: string, runHz: number, df: number, slot: number): Float64Array {
  const seed = asset.seed ^ hashString(point);
  const shape = new Float64Array(VIBRATION_LINES);
  const misaligned = hashNoise(seed, 1) < 0.12;
  addPeak(shape, runHz, 1, df);
  addPeak(shape, 2 * runHz, misaligned ? 0.8 + 0.4 * hashNoise(seed, 2) : 0.15 + 0.25 * hashNoise(seed, 2), df);
  addPeak(shape, 3 * runHz, 0.05 + 0.1 * hashNoise(seed, 3), df);
  const vanes = VANES[asset.data.assetClass];
  if (vanes) addPeak(shape, vanes * runHz, 0.2 + 0.15 * hashNoise(seed, 4), df);
  // Noise floor, a little higher at low frequency, different in every measurement.
  for (let i = 0; i < shape.length; i++) {
    const f = ((i + 1) * df) / runHz;
    shape[i]! += 0.01 * (1 + 2 / (1 + f)) * (0.5 + hashNoise(seed ^ slot, i));
  }
  return shape;
}

/** What one fault adds, at progress p (0–1), or null when it doesn't show on this point. */
function faultShape(fault: Fault, point: string, p: number, runHz: number, df: number, slot: number): Float64Array | null {
  if (!fault.type.effects.some((e) => e.tag === point)) return null;
  const cls = fault.asset.data.assetClass;
  const shape = new Float64Array(VIBRATION_LINES);
  if (fault.type.id === "bearing_wear" && BEARINGS[cls]) {
    const o = bearingOrders(BEARINGS[cls]);
    if (bearingDefect(fault) === "outer") {
      [1, 0.6, 0.35].forEach((a, h) => addPeak(shape, (h + 1) * o.bpfo * runHz, a, df));
    } else {
      // The inner race turns with the shaft, so the defect's impacts are modulated once a turn: sidebands at ±1×.
      [1, 0.5].forEach((a, h) => {
        const hz = (h + 1) * o.bpfi * runHz;
        addPeak(shape, hz, a, df);
        addPeak(shape, hz - runHz, 0.4 * a, df);
        addPeak(shape, hz + runHz, 0.4 * a, df);
      });
    }
    // Late on, the damage spreads and the floor rises into a "haystack".
    if (p > 0.5) {
      for (let i = 0; i < shape.length; i++) {
        const order = ((i + 1) * df) / runHz;
        if (order > 3 && order < 10) shape[i]! += 0.06 * (p - 0.5) * (0.5 + hashNoise(fault.asset.seed ^ slot ^ 0x4a7, i));
      }
    }
  } else if (fault.type.id === "bearing_wear") {
    // A worn journal bearing: more 1×, and the oil wedge whirls the shaft at just under half speed.
    addPeak(shape, runHz, 0.7, df);
    addPeak(shape, OIL_WHIRL_ORDER * runHz, 0.4 + 0.4 * p, df);
    addPeak(shape, 2 * runHz, 0.2, df);
  } else if (fault.type.id === "surge_approach") {
    // Flow breaking down near surge: broadband energy well below running speed.
    for (let i = 0; i < shape.length; i++) {
      const order = ((i + 1) * df) / runHz;
      if (order > 0.03 && order < 0.35) shape[i]! += 0.3 * (0.6 + 0.4 * hashNoise(fault.asset.seed ^ slot, i));
    }
  } else {
    addPeak(shape, runHz, 1, df);
  }
  return shape;
}

/** Which race a rolling-bearing fault damaged: usually the outer, which carries the load in one place. */
export function bearingDefect(fault: Fault): "outer" | "inner" {
  return hashNoise(hashString(fault.id), 1) < 0.7 ? "outer" : "inner";
}

/** RMS of the lines between two frequencies. */
function band(amps: readonly number[], fromHz: number, toHz: number, df: number): number {
  let e = 0;
  amps.forEach((a, k) => {
    const hz = (k + 1) * df;
    if (hz > fromHz && hz < toHz) e += a * a;
  });
  return Math.sqrt(e);
}

/** The rules an analyst applies first, most specific first. */
export function diagnose(
  amps: readonly number[],
  overall: number,
  runHz: number,
  df: number,
  machine: Pick<Vibration, "bearing" | "vanes">,
  alert: number,
): VibrationFinding[] {
  const level = overall >= alert ? "act" : "watch";
  const findings: VibrationFinding[] = [];
  const add = (code: VibrationFinding["code"], hz: number | null, amplitude: number) =>
    findings.push({ code, level, hz: hz === null ? null : Number(hz.toFixed(1)), amplitude: Number(amplitude.toPrecision(3)) });
  const at = (order: number) => peakAt(amps, order * runHz, df);
  const orders = Object.fromEntries(vibrationMarkers(machine).map((m) => [m.key, m.order]));

  if (orders.bpfo !== undefined) {
    const p = at(orders.bpfo);
    if (p.amp >= ACT_FRACTION.peak * overall) add("bearing_outer_race", p.hz, p.amp);
  }
  if (orders.bpfi !== undefined) {
    const p = at(orders.bpfi);
    if (p.amp >= ACT_FRACTION.peak * overall) add("bearing_inner_race", p.hz, p.amp);
  }
  if (machine.bearing.kind === "journal") {
    const p = at(OIL_WHIRL_ORDER);
    if (p.amp >= ACT_FRACTION.whirl * overall) add("oil_whirl", p.hz, p.amp);
  }
  const low = band(amps, 0.03 * runHz, 0.35 * runHz, df);
  if (low >= ACT_FRACTION.band * overall) add("flow_instability", null, low);
  const one = at(1);
  const two = at(2);
  if (two.amp >= 0.75 * one.amp) add("misalignment", two.hz, two.amp);
  if (one.amp >= 0.8 * overall && overall >= alert) add("unbalance", one.hz, one.amp);
  return findings;
}

const r1 = (v: number) => Number(v.toFixed(1));

/** The shaft's path from the 1×, 2× and whirl components, converted from velocity to displacement. */
function orbitOf(asset: AssetRecord, point: string, slice: VibrationSlice, df: number): Orbit {
  const amps = slice.amps!;
  const runHz = slice.runningHz!;
  // Velocity v (mm/s RMS) at f Hz → displacement amplitude (half of peak-to-peak) in µm: √2 · v / (2πf) · 1000.
  const halfUm = (v: number, hz: number) => (Math.SQRT2 * v * 1000) / (2 * Math.PI * hz);
  const a1 = halfUm(peakAt(amps, runHz, df).amp, runHz);
  const a2 = halfUm(peakAt(amps, 2 * runHz, df).amp, 2 * runHz);
  const whirl = peakAt(amps, OIL_WHIRL_ORDER * runHz, df).amp;
  const aw = whirl >= ACT_FRACTION.whirl * slice.overall! ? halfUm(whirl, OIL_WHIRL_ORDER * runHz) : 0;
  const seed = asset.seed ^ hashString(point) ^ 0x0b17;
  const ellipticity = 0.45 + 0.35 * hashNoise(seed, 1);
  const tilt = Math.PI * hashNoise(seed, 2);
  const phase2 = 2 * Math.PI * hashNoise(seed, 3);
  const phaseW = 2 * Math.PI * hashNoise(seed, 4);
  const pointsPerRev = 48;
  // Whirl at 0.43× needs about 7 turns before the pattern repeats.
  const revs = aw > 0 ? 7 : 3;
  const points: [number, number][] = [];
  for (let i = 0; i <= revs * pointsPerRev; i++) {
    const th = (2 * Math.PI * i) / pointsPerRev;
    const u = a1 * Math.cos(th) + a2 * Math.cos(2 * th + phase2) + aw * Math.cos(OIL_WHIRL_ORDER * th + phaseW);
    const v = ellipticity * (a1 * Math.sin(th) + a2 * Math.sin(2 * th + phase2)) + aw * Math.sin(OIL_WHIRL_ORDER * th + phaseW);
    points.push([r1(u * Math.cos(tilt) - v * Math.sin(tilt)), r1(u * Math.sin(tilt) + v * Math.cos(tilt))]);
  }
  const span = (k: 0 | 1) => Math.max(...points.map((p) => p[k])) - Math.min(...points.map((p) => p[k]));
  return { t: slice.t, points, pointsPerRev, pkPkXUm: r1(span(0)), pkPkYUm: r1(span(1)) };
}

export function vibration(ctx: Ctx, asset: AssetRecord, requested?: string): Vibration {
  const points = asset.tags.filter((t) => t.template.quantity === "vibration_velocity");
  if (points.length === 0) throw new ApiFailure("bad_request", `${asset.data.id} has no vibration measurements`);
  // By default, the point that's worst against its alert limit right now: where an analyst looks first.
  const severity = (t: TagRecord) => (tagValue(ctx.world, ctx.chaos, t, ctx.now)?.value ?? 0) / (t.tag.limits.highAlert ?? Infinity);
  const tag =
    requested === undefined
      ? points.reduce((worst, t) => (severity(t) > severity(worst) ? t : worst))
      : points.find((t) => t.template.name === requested);
  if (!tag) throw new ApiFailure("bad_request", `${asset.data.id} has no vibration point ${requested}`);
  const point = tag.template.name;

  const cls = asset.data.assetClass;
  const machine: Pick<Vibration, "bearing" | "vanes"> = {
    bearing: { kind: bearingKind(cls), geometry: BEARINGS[cls] ?? null },
    vanes: VANES[cls] ?? null,
  };
  const fMaxHz = r1(VIBRATION_MAX_ORDER * speedHz(ctx, asset, ctx.now, true));
  const df = fMaxHz / VIBRATION_LINES;
  const limits = {
    alert: tag.tag.limits.highAlert ?? Infinity,
    alarm: tag.tag.limits.highAlarm ?? Infinity,
    trip: tag.tag.limits.highTrip ?? Infinity,
  };
  const faults = ctx.world.faultsOf(asset.data.id);

  const slices: VibrationSlice[] = [];
  for (let week = VIBRATION_WEEKS; week >= 0; week--) {
    const planned = Math.floor((ctx.now - week * 7 * DAY) / HOUR) * HOUR;
    // A route measurement is taken while the machine runs: look back up to a day for a moment it was.
    let t = planned;
    let reading = null;
    for (let back = 0; back < 24 && !reading; back++) {
      t = planned - back * HOUR;
      if (operating(ctx.world, asset, t).r < 0.8) continue;
      reading = tagValue(ctx.world, ctx.chaos, tag, t);
    }
    if (!reading || reading.value <= 0) {
      slices.push({ t: iso(planned), runningHz: null, overall: null, amps: null, findings: [] });
      continue;
    }
    const runHz = speedHz(ctx, asset, t);
    const slot = Math.floor(t / HOUR);
    const overall = reading.value;
    const offset = Math.max(0, faultOffset(tag, faults, t));
    const healthy = Math.max(overall - offset, 0.2 * overall);
    const faulty = Math.sqrt(Math.max(overall * overall - healthy * healthy, 0));

    const H = healthyShape(asset, point, runHz, df, slot);
    const F = new Float64Array(VIBRATION_LINES);
    for (const fault of faults) {
      const p = progress(fault, t);
      if (p === 0) continue;
      const shape = faultShape(fault, point, p, runHz, df, slot);
      if (shape) shape.forEach((v, i) => (F[i]! += v));
    }
    const eH = energy(H);
    const eF = energy(F);
    const amps = Array.from(H, (h, i) => {
      const a = (healthy * h) / eH;
      const b = eF > 0 ? (faulty * F[i]!) / eF : 0;
      return Number(Math.sqrt(a * a + b * b).toPrecision(3));
    });
    slices.push({
      t: iso(t),
      runningHz: Number(runHz.toFixed(2)),
      overall: Number(overall.toPrecision(3)),
      amps,
      findings: diagnose(amps, overall, runHz, df, machine, limits.alert),
    });
  }

  const latest = [...slices].reverse().find((s) => s.amps !== null);
  return {
    assetId: asset.data.id,
    point,
    points: points.map((t) => ({ tag: t.template.name, description: t.template.description })),
    ...machine,
    fMaxHz,
    lines: VIBRATION_LINES,
    limits,
    slices,
    orbit: machine.bearing.kind === "journal" && latest ? orbitOf(asset, point, latest, df) : null,
  };
}
