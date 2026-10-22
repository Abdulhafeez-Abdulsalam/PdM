/**
 * Oil & gas operations: wells against their decline curve and the pumps lifting them;
 * pipeline wall thickness, corrosion and compressors; exchanger fouling and inspection dates.
 */
import {
  CP_CRITERION_V,
  DECLINE_FORECAST_DAYS,
  DECLINE_HISTORY_DAYS,
  EXCHANGER_CLEAN_PCT,
  INSPECTION_DUE_SOON_DAYS,
  REMAINING_LIFE_ACT_YEARS,
  REMAINING_LIFE_WATCH_YEARS,
  barlowThicknessMm,
  type AssetPerformance,
  type CompressorRow,
  type DeclineFit,
  type DownstreamView,
  type EspDiagnosis,
  type EspRow,
  type ExchangerRow,
  type InspectionItem,
  type Integrity,
  type MidstreamView,
  type OilGasOperations,
  type OilGasSegment,
  type OilGasSummary,
  type PipelineSegmentRow,
  type ProductionPoint,
  type UpstreamView,
  type WellRow,
} from "@pdm/contracts";
import { DAY, HOUR, iso } from "./clock";
import { faultOffset } from "./faults";
import type { AssetRecord, TagRecord } from "./model";
import { hashNoise } from "./random";
import { declinePerYear, expectedValue, liftOf, tagValue, wellPotential, type ChaosWindows } from "./signals";
import type { Snapshot } from "./snapshot";
import type { World } from "./world";

interface Context {
  world: World;
  chaos: ChaosWindows;
  snapshot: Snapshot;
  now: number;
}

const YEAR = 365.25 * DAY;
const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const r3 = (x: number) => Math.round(x * 1000) / 1000;
const tagOf = (asset: AssetRecord, name: string): TagRecord | undefined => asset.tags.find((t) => t.template.name === name);

/** A trustworthy live reading, or null. */
function read(ctx: Context, asset: AssetRecord, name: string, t = ctx.now): number | null {
  const tag = tagOf(asset, name);
  const v = tag ? tagValue(ctx.world, ctx.chaos, tag, t) : null;
  return v && v.quality === "good" ? v.value : null;
}

/**
 * A surveyed value: the model plus fault effects, without sensor noise. Wall thickness comes
 * from inspections and effectiveness from a heat balance, so they don't jitter like a live sensor.
 */
function survey(ctx: Context, asset: AssetRecord, name: string, t = ctx.now): number | null {
  const tag = tagOf(asset, name);
  if (!tag || asset.staticStatus === "offline") return null;
  return expectedValue(ctx.world, tag, t) + faultOffset(tag, ctx.world.faultsOf(asset.data.id), t);
}

/** Past the tag's alert limit in its bad direction? */
function pastAlert(asset: AssetRecord, name: string, value: number | null): boolean {
  const tag = tagOf(asset, name);
  if (!tag || value === null) return false;
  const l = tag.tag.limits;
  if (l.highAlert !== undefined && value >= l.highAlert) return true;
  return l.lowAlert !== undefined && value <= l.lowAlert;
}

const status = (ctx: Context, a: AssetRecord) => ctx.snapshot.conditions.get(a.data.id)?.status ?? "stopped";
const areaName = (ctx: Context, a: AssetRecord) => ctx.world.nodes.get(a.data.areaId)?.node.name ?? a.data.areaId;

// ─── Upstream ────────────────────────────────────────────────────────────────

/** Effective yearly decline, %: how much less a well makes a year from now (1 − e^(−D)). */
const effectivePct = (nominalPerYear: number) => r1(100 * (1 - Math.exp(-nominalPerYear)));

function wellRow(ctx: Context, well: AssetRecord): WellRow {
  const lift = liftOf(ctx.world, well);
  const oil = tagOf(well, "OIL_RATE");
  const potential = oil && well.staticStatus !== "offline" ? wellPotential(ctx.world, oil, ctx.now) : 0;
  const expected = oil && well.staticStatus !== "offline" ? expectedValue(ctx.world, oil, ctx.now) : 0;
  return {
    assetId: well.data.id,
    siteId: well.data.siteId,
    areaName: areaName(ctx, well),
    liftType: lift ? (lift.data.assetClass === "esp" ? "esp" : "rod_pump") : "natural",
    liftAssetId: lift?.data.id ?? null,
    operatingStatus: expected <= 0 && potential > 0 ? "stopped" : status(ctx, well),
    oilRate: (() => {
      const v = read(ctx, well, "OIL_RATE");
      return v === null ? null : r2(v);
    })(),
    gasRate: (() => {
      const v = read(ctx, well, "GAS_RATE");
      return v === null ? null : Math.round(v);
    })(),
    waterCutPct: (() => {
      const v = read(ctx, well, "WATER_CUT");
      return v === null ? null : r1(v);
    })(),
    lostOilRate: r2(Math.max(0, potential - expected)),
    declinePctPerYear: effectivePct(declinePerYear(well)),
  };
}

/** Least-squares fit of ln q = a + b·t (t in days). */
export function fitExponential(points: readonly { day: number; q: number }[]): { a: number; b: number; r2: number } | null {
  const xs = points.filter((p) => p.q > 0);
  if (xs.length < 3) return null;
  const n = xs.length;
  const mx = xs.reduce((s, p) => s + p.day, 0) / n;
  const my = xs.reduce((s, p) => s + Math.log(p.q), 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const p of xs) {
    const dx = p.day - mx;
    const dy = Math.log(p.q) - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  return { a: my - b * mx, b, r2: syy === 0 ? 1 : (sxy * sxy) / (sxx * syy) };
}

/** Daily oil rate of a set of wells (two readings a day), the fitted decline, and the forecast. */
function production(ctx: Context, wells: readonly AssetRecord[]): { production: ProductionPoint[]; fit: DeclineFit | null } {
  const today = Math.floor(ctx.now / DAY) * DAY;
  const start = today - DECLINE_HISTORY_DAYS * DAY;
  const history: { day: number; q: number | null }[] = [];
  for (let d = 0; d < DECLINE_HISTORY_DAYS; d++) {
    let sum = 0;
    let any = false;
    for (const hour of [6, 18]) {
      for (const w of wells) {
        const v = read(ctx, w, "OIL_RATE", start + d * DAY + hour * HOUR);
        if (v === null) continue;
        sum += v / 2;
        any = true;
      }
    }
    history.push({ day: d, q: any ? sum : null });
  }
  const f = fitExponential(history.flatMap((h) => (h.q === null ? [] : [{ day: h.day, q: h.q }])));
  const fitAt = (day: number) => (f ? Math.exp(f.a + f.b * day) : 0);
  const points: ProductionPoint[] = [];
  for (let d = 0; d < DECLINE_HISTORY_DAYS + DECLINE_FORECAST_DAYS; d++) {
    const h = history[d];
    points.push({ t: iso(start + d * DAY), actual: h && h.q !== null ? r2(h.q) : null, fit: r2(fitAt(d)) });
  }
  return {
    production: points,
    fit: f ? { qi: r2(fitAt(0)), declinePctPerYear: effectivePct(-f.b * 365.25), r2: r3(f.r2), from: iso(start) } : null,
  };
}

function espDiagnosis(esp: AssetRecord, s: string, amps: number | null, temp: number | null, intake: number | null): EspDiagnosis {
  if (s !== "running") return "stopped";
  if (amps === null && temp === null && intake === null) return "no_data";
  if (pastAlert(esp, "MOTOR_TEMP", temp)) return "motor_hot";
  if (pastAlert(esp, "INTAKE_P", intake)) return "low_intake";
  if (pastAlert(esp, "MOTOR_AMPS", amps)) return "high_amps";
  return "normal";
}

function espRow(ctx: Context, esp: AssetRecord, wellOf: Map<string, string>): EspRow {
  const amps = read(ctx, esp, "MOTOR_AMPS");
  const temp = read(ctx, esp, "MOTOR_TEMP");
  const intake = read(ctx, esp, "INTAKE_P");
  const freq = read(ctx, esp, "FREQ");
  const s = status(ctx, esp);
  return {
    assetId: esp.data.id,
    wellId: wellOf.get(esp.data.id) ?? null,
    operatingStatus: s,
    motorAmps: amps === null ? null : r1(amps),
    motorTemp: temp === null ? null : r1(temp),
    intakePressure: intake === null ? null : r1(intake),
    frequency: freq === null ? null : r1(freq),
    diagnosis: espDiagnosis(esp, s, amps, temp, intake),
  };
}

const productionCache = new WeakMap<World, Map<string, { production: ProductionPoint[]; fit: DeclineFit | null }>>();

function cachedProduction(ctx: Context, key: string, wells: readonly AssetRecord[]) {
  const byWorld = productionCache.get(ctx.world) ?? new Map();
  productionCache.set(ctx.world, byWorld);
  const k = `${key}:${wells.length}:${Math.floor(ctx.now / (3 * HOUR))}`;
  const hit = byWorld.get(k);
  if (hit) return hit;
  const p = production(ctx, wells);
  byWorld.set(k, p);
  return p;
}

function upstream(ctx: Context, assets: readonly AssetRecord[]): UpstreamView {
  const wells = assets.filter((a) => a.data.assetClass === "wellhead");
  const rows = wells.map((w) => wellRow(ctx, w));
  const wellOf = new Map<string, string>();
  for (const w of wells) {
    const lift = liftOf(ctx.world, w);
    if (lift) wellOf.set(lift.data.id, w.data.id);
  }
  const esps = assets.filter((a) => a.data.assetClass === "esp").map((e) => espRow(ctx, e, wellOf));
  const { production: points, fit } = cachedProduction(ctx, "field", wells);
  const oil = rows.reduce((s, r) => s + (r.oilRate ?? 0), 0);
  const water = rows.reduce((s, r) => s + ((r.oilRate ?? 0) * (r.waterCutPct ?? 0)) / Math.max(1, 100 - (r.waterCutPct ?? 0)), 0);
  return {
    segment: "upstream",
    production: points,
    fit,
    oilRate: r2(oil),
    gasRate: Math.round(rows.reduce((s, r) => s + (r.gasRate ?? 0), 0)),
    waterCutPct: oil + water > 0 ? r1((100 * water) / (oil + water)) : null,
    wellsProducing: rows.filter((r) => (r.oilRate ?? 0) > 0.05).length,
    wellsTotal: rows.length,
    lostOilRate: r2(rows.reduce((s, r) => s + r.lostOilRate, 0)),
    wells: rows.sort((a, b) => b.lostOilRate - a.lostOilRate || a.assetId.localeCompare(b.assetId)),
    esps: esps.sort((a, b) => Number(a.diagnosis === "normal") - Number(b.diagnosis === "normal") || a.assetId.localeCompare(b.assetId)),
  };
}

// ─── Integrity (pipelines, vessels, tanks) ───────────────────────────────────

/** Minimum thickness the design needs, mm. Pipelines from Barlow's formula; vessels and tanks from their (simplified) design. */
function requiredMm(asset: AssetRecord): number {
  if (asset.data.assetClass === "pipeline_segment") return r2(barlowThicknessMm());
  if (asset.data.assetClass === "pressure_vessel") return 16;
  return 6; // storage tank shell, course 1
}

export function integrityOf(ctx: Context, asset: AssetRecord): Integrity | null {
  const wall = survey(ctx, asset, "WALL_THK");
  if (wall === null) return null;
  const healthy = tagOf(asset, "WALL_THK")!.base;
  // Each piece of steel has corroded at its own steady rate since it was built (0.02–0.12 mm a year).
  const ageYears = Math.max(0.5, (ctx.now - Date.parse(asset.data.commissionedAt)) / YEAR);
  const historic = 0.02 + 0.1 * hashNoise(asset.seed ^ 0x7a11, 0);
  const nominal = healthy + historic * ageYears;
  const longTerm = (nominal - wall) / ageYears;
  const shortTerm = survey(ctx, asset, "CORR_RATE");
  const rate = Math.max(longTerm, shortTerm ?? 0);
  const required = requiredMm(asset);
  const life = rate > 1e-4 ? (wall - required) / rate : null;
  return {
    wallMm: r2(wall),
    nominalMm: r2(nominal),
    requiredMm: required,
    longTermRate: r3(longTerm),
    shortTermRate: shortTerm === null ? null : r3(shortTerm),
    rate: r3(rate),
    remainingLifeYears: life === null ? null : r1(Math.max(0, life)),
    status: life !== null && life < REMAINING_LIFE_ACT_YEARS ? "act" : life !== null && life < REMAINING_LIFE_WATCH_YEARS ? "watch" : "ok",
  };
}

const SEGMENT_KM = 5;

function midstream(ctx: Context, assets: readonly AssetRecord[]): MidstreamView {
  const segs = assets
    .filter((a) => a.data.assetClass === "pipeline_segment")
    .sort((a, b) => a.data.areaId.localeCompare(b.data.areaId) || a.data.id.localeCompare(b.data.id));
  const pipelines: PipelineSegmentRow[] = segs.map((s, i) => {
    const cp = read(ctx, s, "CP_POTENTIAL");
    const leak = read(ctx, s, "LEAK_INDEX");
    return {
      assetId: s.data.id,
      sectionName: areaName(ctx, s),
      kmFrom: i * SEGMENT_KM,
      kmTo: (i + 1) * SEGMENT_KM,
      integrity: integrityOf(ctx, s),
      cpPotentialV: cp === null ? null : r3(cp),
      cpOk: cp === null ? null : cp >= CP_CRITERION_V,
      leakIndex: leak === null ? null : r2(leak),
    };
  });
  const compressors = assets.filter((a) => a.data.assetClass === "compressor" && a.data.siteId === "GCM").map((c) => compressorRow(ctx, c));
  const first = segs[0];
  return {
    segment: "midstream",
    pipelines,
    requiredWallMm: r2(barlowThicknessMm()),
    compressors,
    throughput: first ? read(ctx, first, "FLOW") : null,
  };
}

export function compressorRow(ctx: Context, c: AssetRecord): CompressorRow {
  const s = status(ctx, c);
  const eff = read(ctx, c, "POLY_EFF");
  const surge = read(ctx, c, "SURGE_MARGIN");
  const flow = read(ctx, c, "FLOW");
  return {
    assetId: c.data.id,
    siteId: c.data.siteId,
    areaName: areaName(ctx, c),
    operatingStatus: s,
    flow: flow === null ? null : Math.round(flow),
    polytropicEffPct: eff === null ? null : r1(eff),
    designEffPct: tagOf(c, "POLY_EFF")?.base ?? 82,
    surgeMarginPct: surge === null ? null : r1(surge),
    flag:
      s !== "running"
        ? "stopped"
        : pastAlert(c, "SURGE_MARGIN", surge)
          ? "surge_close"
          : pastAlert(c, "POLY_EFF", eff)
            ? "efficiency_low"
            : "ok",
  };
}

// ─── Downstream ──────────────────────────────────────────────────────────────

export function exchangerRow(ctx: Context, hx: AssetRecord): ExchangerRow {
  const today = Math.floor(ctx.now / DAY) * DAY;
  const history = Array.from({ length: 30 }, (_, i) => {
    const v = survey(ctx, hx, "THERMAL_EFF", today - (29 - i) * DAY + 12 * HOUR);
    return v === null ? null : r1(v);
  });
  const pts = history.flatMap((v, i) => (v === null ? [] : [{ x: i, y: v }]));
  let slope: number | null = null;
  if (pts.length >= 5) {
    const mx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const my = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const sxx = pts.reduce((s, p) => s + (p.x - mx) ** 2, 0);
    slope = pts.reduce((s, p) => s + (p.x - mx) * (p.y - my), 0) / sxx;
  }
  const eff = survey(ctx, hx, "THERMAL_EFF");
  const dp = read(ctx, hx, "TS_DP");
  const daysToClean =
    eff === null
      ? null
      : eff < EXCHANGER_CLEAN_PCT
        ? 0
        : slope !== null && slope < -0.005
          ? Math.round((eff - EXCHANGER_CLEAN_PCT) / -slope)
          : null;
  return {
    assetId: hx.data.id,
    siteId: hx.data.siteId,
    areaName: areaName(ctx, hx),
    operatingStatus: status(ctx, hx),
    effectivenessPct: eff === null ? null : r1(eff),
    designPct: tagOf(hx, "THERMAL_EFF")?.base ?? 92,
    tubeDpBar: dp === null ? null : r2(dp),
    trendPtsPer30d: slope === null ? null : r1(slope * 30),
    daysToClean,
    history,
  };
}

const MAX_INTERVAL_YEARS: Record<string, number> = { pressure_vessel: 10, storage_tank: 20, pipeline_segment: 7 };
const CODE: Record<string, InspectionItem["code"]> = {
  pressure_vessel: "api_510",
  storage_tank: "api_653",
  psv: "api_576",
  pipeline_segment: "ili",
};

export function inspectionOf(ctx: Context, a: AssetRecord): InspectionItem | null {
  const code = CODE[a.data.assetClass];
  if (!code) return null;
  let interval: number;
  let basis: InspectionItem["basis"] = "max_interval";
  let life: number | null = null;
  if (a.data.assetClass === "psv") {
    interval = hashNoise(a.seed ^ 0x9e7, 0) < 0.4 ? 3 : 5; // dirty or corrosive service: every 3 years
  } else {
    const max = MAX_INTERVAL_YEARS[a.data.assetClass]!;
    life = integrityOf(ctx, a)?.remainingLifeYears ?? null;
    interval = max;
    if (life !== null && life / 2 < max) {
      interval = Math.max(0.5, life / 2);
      basis = "half_life";
    }
  }
  // The last inspection: somewhere in the past interval (a few run a little late), seeded.
  const last = ctx.world.createdAt - hashNoise(a.seed ^ 0x1a57, 0) * interval * 1.08 * YEAR;
  let next = last + interval * YEAR;
  if (a.data.assetClass === "psv" && pastAlert(a, "SEAT_LEAK", read(ctx, a, "SEAT_LEAK"))) {
    next = Math.min(next, ctx.now);
    basis = "leaking";
  }
  return {
    assetId: a.data.id,
    assetClass: a.data.assetClass,
    siteId: a.data.siteId,
    code,
    lastAt: iso(last),
    intervalYears: r1(interval),
    basis,
    nextDueAt: iso(next),
    remainingLifeYears: life,
    status: next < ctx.now ? "overdue" : next - ctx.now <= INSPECTION_DUE_SOON_DAYS * DAY ? "due_soon" : "ok",
  };
}

function downstream(ctx: Context, assets: readonly AssetRecord[]): DownstreamView {
  const exchangers = assets
    .filter((a) => a.data.assetClass === "heat_exchanger")
    .map((h) => exchangerRow(ctx, h))
    .sort((a, b) => (a.effectivenessPct ?? 999) - (b.effectivenessPct ?? 999));
  const inspections = assets
    .flatMap((a) => {
      const i = inspectionOf(ctx, a);
      return i ? [i] : [];
    })
    .sort((a, b) => a.nextDueAt.localeCompare(b.nextDueAt));
  return { segment: "downstream", exchangers, inspections };
}

// ─── The page ────────────────────────────────────────────────────────────────

export function oilGasOperations(input: {
  world: World;
  chaos: ChaosWindows;
  snapshot: Snapshot;
  now: number;
  segment: OilGasSegment;
  inScope: (assetId: string) => boolean;
}): OilGasOperations {
  const ctx: Context = { world: input.world, chaos: input.chaos, snapshot: input.snapshot, now: input.now };
  const assets = [...input.world.assets.values()].filter((a) => a.site.def.businessLine === "oil_gas" && input.inScope(a.data.id));
  const up = upstream(ctx, assets);
  const mid = midstream(ctx, assets);
  const down = downstream(ctx, assets);
  const summary: OilGasSummary = {
    upstream: {
      oilRate: up.oilRate,
      wellsProducing: up.wellsProducing,
      wellsTotal: up.wellsTotal,
      espsFlagged: up.esps.filter((e) => e.diagnosis !== "normal").length,
    },
    midstream: {
      segments: mid.pipelines.length,
      segmentsFlagged: mid.pipelines.filter((p) => (p.integrity && p.integrity.status !== "ok") || p.cpOk === false).length,
      compressorsFlagged: mid.compressors.filter((c) => c.flag === "surge_close" || c.flag === "efficiency_low").length,
    },
    downstream: {
      exchangersToClean: down.exchangers.filter((e) => e.daysToClean !== null && e.daysToClean <= 30).length,
      inspectionsDue: down.inspections.filter((i) => i.status !== "ok").length,
    },
  };
  return { summary, view: input.segment === "upstream" ? up : input.segment === "midstream" ? mid : down };
}

// ─── Asset 360 ───────────────────────────────────────────────────────────────

export function oilGasPerformance(ctx: Context, asset: AssetRecord): AssetPerformance | null {
  if (asset.site.def.businessLine !== "oil_gas") return null;
  switch (asset.data.assetClass) {
    case "wellhead": {
      const { production: points, fit } = cachedProduction(ctx, asset.data.id, [asset]);
      return { kind: "well", well: { well: wellRow(ctx, asset), production: points, fit } };
    }
    case "esp": {
      const wellOf = new Map<string, string>();
      for (const w of ctx.world.assets.values()) {
        if (w.data.assetClass !== "wellhead" || w.data.areaId !== asset.data.areaId) continue;
        const lift = liftOf(ctx.world, w);
        if (lift) wellOf.set(lift.data.id, w.data.id);
      }
      return { kind: "esp", esp: espRow(ctx, asset, wellOf) };
    }
    case "compressor":
      return { kind: "compressor", compressor: compressorRow(ctx, asset) };
    case "heat_exchanger":
      return { kind: "exchanger", exchanger: exchangerRow(ctx, asset) };
    case "pipeline_segment":
    case "pressure_vessel":
    case "storage_tank":
    case "psv":
      return {
        kind: "integrity",
        integrity: {
          assetId: asset.data.id,
          integrity: asset.data.assetClass === "psv" ? null : integrityOf(ctx, asset),
          inspection: inspectionOf(ctx, asset),
        },
      };
    default:
      return null;
  }
}
