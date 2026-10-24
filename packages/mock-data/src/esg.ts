/**
 * Emissions (Phase 4, chunk 4), worked out from the simulation's own measurements, day by day.
 *
 *   combustion  fuel gas (Sm³) × 1.98 kg CO₂/Sm³. Turbines and heaters have a fuel meter;
 *               engines don't, so their fuel comes from their output at 42 % efficiency.
 *   flaring     a pilot and purge of 0.5 % of the gas a site separates, plus the gas that
 *               compressors that are down would have moved (8 % of it, shared between them).
 *               98 % burns to CO₂; 2 % escapes as methane.
 *   methane     compressor seals 2 kg/h each while running, pipelines 0.4 kg/h × leak index,
 *               gas-driven valves 0.25 kg/h and wellheads 0.1 kg/h at oil & gas sites; × GWP_CH4.
 *
 * "Avoidable" is what poor health adds: a turbine's heat rate above its clean, ambient-corrected
 * value (fouling) burns more fuel per MWh; a corroding pipeline leaks more; gas flared while a
 * compressor was down. Days that are over never change, so each asset-day is worked out once.
 */
import { ESG_DAYS, GWP_CH4, type EsgDay, type EsgEmitter, type EsgOverview, type EsgSite } from "@pdm/contracts";
import { DAY, iso } from "./clock";
import { progress } from "./faults";
import type { AssetRecord, TagRecord } from "./model";
import { hashNoise, hashString } from "./random";
import { expectedValue, tagValue, type ChaosWindows } from "./signals";
import { condition, type Snapshot } from "./snapshot";
import type { World } from "./world";

const CO2_PER_SM3 = 1.98; // kg CO₂ per standard m³ of natural gas burned
const GAS_KJ_PER_SM3 = 35_300;
const ENGINE_KJ_PER_KWH = 3600 / 0.42;
const BBL_PER_M3 = 6.29;
const SM3_PER_BOE = 170;
const CH4_KG_PER_SM3 = 0.68;
/** Grid emission factor by region, t CO₂ per MWh: what solar output displaces. */
const GRID_T_PER_MWH: Record<string, number> = { "R-NA": 0.37, "R-ME": 0.55, "R-WA": 0.43 };
/** Samples per day: every 4 hours. */
const SAMPLES = 6;

type Source = "combustion" | "flaring" | "methane";
interface AssetDay {
  source: Source | null;
  co2e: number;
  avoidable: number;
  reason: EsgEmitter["reason"];
  mwh: number;
  boe: number;
  avoided: number;
  /** Separators only: gas separated that day, Sm³ (for flaring). */
  gasSm3: number;
}

const EMPTY: AssetDay = { source: null, co2e: 0, avoidable: 0, reason: null, mwh: 0, boe: 0, avoided: 0, gasSm3: 0 };
const cache = new WeakMap<World, Map<string, AssetDay>>();

interface Ctx {
  world: World;
  chaos: ChaosWindows;
  now: number;
  snapshot: () => Snapshot;
  inScope: (assetId: string) => boolean;
  /** Names the scope, for the cache. */
  scopeKey: string;
}

/** Whole overviews, per scope and day: past days never change, so only health needs to be fresh. */
const overviewCache = new WeakMap<World, Map<string, EsgOverview>>();

const tag = (a: AssetRecord, name: string): TagRecord | undefined => a.tags.find((t) => t.template.name === name);

/** The mean of a tag over a day (missing readings left out), from SAMPLES spread through it. */
function dayMean(ctx: Ctx, t: TagRecord | undefined, day: number): number {
  if (!t) return 0;
  let sum = 0;
  let n = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const r = tagValue(ctx.world, ctx.chaos, t, day + ((i + 0.5) * DAY) / SAMPLES);
    if (r) {
      sum += r.value;
      n++;
    }
  }
  return n > 0 ? sum / n : 0;
}

/** The share of a day a machine was running. */
function runningShare(ctx: Ctx, a: AssetRecord, day: number): number {
  let running = 0;
  for (let i = 0; i < SAMPLES; i++) if (condition(ctx.world, a, day + ((i + 0.5) * DAY) / SAMPLES, []).status === "running") running++;
  return running / SAMPLES;
}

/** How far a fault of this kind has got on the asset at time t (0 when there's none). */
function faultProgress(world: World, a: AssetRecord, typeId: string, t: number): number {
  return world.faultsOf(a.data.id).reduce((m, f) => (f.type.id === typeId ? Math.max(m, progress(f, t)) : m), 0);
}

function computeDay(ctx: Ctx, a: AssetRecord, day: number): AssetDay {
  const mid = day + DAY / 2;
  const ch4 = (kg: number) => (kg / 1000) * GWP_CH4;
  switch (a.data.assetClass) {
    case "gas_turbine": {
      // Sample by sample, and only while burning fuel: a peaker that's off at noon has no "clean" heat rate then.
      const fuelTag = tag(a, "FUEL_FLOW");
      const hr = tag(a, "HEAT_RATE");
      let fuel = 0;
      let excessFuel = 0;
      for (let i = 0; i < SAMPLES; i++) {
        const t = day + ((i + 0.5) * DAY) / SAMPLES;
        const f = fuelTag ? (tagValue(ctx.world, ctx.chaos, fuelTag, t)?.value ?? 0) : 0;
        fuel += f / SAMPLES;
        const actual = hr && f > 0 ? tagValue(ctx.world, ctx.chaos, hr, t)?.value : undefined;
        if (!hr || !actual) continue;
        const clean = expectedValue(ctx.world, hr, t);
        const excess = clean > 0 ? (actual - clean) / actual : 0;
        // Under 1 % is sensor noise and normal drift, not lost efficiency.
        if (excess > 0.01) excessFuel += (f * excess) / SAMPLES;
      }
      const co2 = (fuel * CO2_PER_SM3) / 1000;
      const avoidable = (excessFuel * CO2_PER_SM3) / 1000;
      return { ...EMPTY, source: "combustion", co2e: co2, avoidable, reason: avoidable > 0 ? "efficiency" : null };
    }
    case "recip_engine": {
      const kwh = dayMean(ctx, tag(a, "POWER"), day) * 24;
      return { ...EMPTY, source: "combustion", co2e: (((kwh * ENGINE_KJ_PER_KWH) / GAS_KJ_PER_SM3) * CO2_PER_SM3) / 1000 };
    }
    case "fired_heater":
      return { ...EMPTY, source: "combustion", co2e: (dayMean(ctx, tag(a, "FUEL"), day) * CO2_PER_SM3) / 1000 };
    case "generator":
      return { ...EMPTY, mwh: (dayMean(ctx, tag(a, "POWER"), day) * 24) / 1000 };
    case "inverter": {
      const mwh = (dayMean(ctx, tag(a, "AC_POWER"), day) * 24) / 1000;
      return { ...EMPTY, avoided: mwh * (GRID_T_PER_MWH[a.site.def.regionId] ?? 0.45) };
    }
    case "wellhead": {
      const boe = dayMean(ctx, tag(a, "OIL_RATE"), day) * 24 * BBL_PER_M3 + dayMean(ctx, tag(a, "GAS_RATE"), day) / SM3_PER_BOE;
      return { ...EMPTY, source: "methane", co2e: ch4(0.1 * 24), boe };
    }
    case "compressor":
      return { ...EMPTY, source: "methane", co2e: ch4(2 * 24 * runningShare(ctx, a, day)) };
    case "pipeline_segment": {
      const base = 0.4 * 24 * (dayMean(ctx, tag(a, "LEAK_INDEX"), day) / 2);
      const corrosion = faultProgress(ctx.world, a, "wall_loss", mid);
      const kg = base * (1 + 3 * corrosion);
      return { ...EMPTY, source: "methane", co2e: ch4(kg), avoidable: ch4(kg - base), reason: corrosion > 0.05 ? "leak" : null };
    }
    case "control_valve":
      return a.data.businessLine === "oil_gas" ? { ...EMPTY, source: "methane", co2e: ch4(0.25 * 24) } : EMPTY;
    case "separator":
      return { ...EMPTY, gasSm3: dayMean(ctx, tag(a, "GAS_OUT"), day) };
    default:
      return EMPTY;
  }
}

function assetDay(ctx: Ctx, a: AssetRecord, day: number): AssetDay {
  let map = cache.get(ctx.world);
  if (!map) cache.set(ctx.world, (map = new Map()));
  const key = `${a.data.id}|${day}`;
  let hit = map.get(key);
  if (!hit) map.set(key, (hit = computeDay(ctx, a, day)));
  return hit;
}

/** Flaring at a site that day: the first separator stands for the flare it feeds. */
function flareDay(ctx: Ctx, separators: readonly AssetRecord[], compressors: readonly AssetRecord[], day: number): AssetDay {
  const gas = separators.reduce((s, sep) => s + assetDay(ctx, sep, day).gasSm3, 0);
  if (gas === 0) return EMPTY;
  const down = compressors.length > 0 ? compressors.reduce((s, c) => s + (1 - runningShare(ctx, c, day)), 0) / compressors.length : 0;
  const pilot = 0.005 * gas;
  const extra = 0.08 * gas * down;
  const co2e = (sm3: number) => (sm3 * 0.98 * CO2_PER_SM3) / 1000 + ((sm3 * 0.02 * CH4_KG_PER_SM3) / 1000) * GWP_CH4;
  return { ...EMPTY, source: "flaring", co2e: co2e(pilot + extra), avoidable: co2e(extra), reason: extra > 0 ? "downtime" : null };
}

const r1 = (v: number) => Math.round(v * 10) / 10;

export function esgOverview(ctx: Ctx): EsgOverview {
  const today = Math.floor(ctx.now / DAY) * DAY;
  let cached = overviewCache.get(ctx.world);
  if (!cached) overviewCache.set(ctx.world, (cached = new Map()));
  const key = `${ctx.scopeKey}|${today}`;
  let result = cached.get(key);
  if (!result) {
    if (cached.size > 30) cached.clear();
    cached.set(key, (result = computeOverview(ctx, today)));
  }
  const snapshot = ctx.snapshot();
  return {
    ...result,
    emitters: result.emitters.map((e) => ({ ...e, health: snapshot.conditions.get(e.assetId)?.health.state ?? "offline" })),
  };
}

function computeOverview(ctx: Ctx, today: number): EsgOverview {
  const days = Array.from({ length: ESG_DAYS }, (_, i) => today - (ESG_DAYS - i) * DAY);
  const assets = [...ctx.world.assets.values()].filter((a) => ctx.inScope(a.data.id) && a.staticStatus !== "offline");
  const bySite = new Map<string, AssetRecord[]>();
  for (const a of assets) bySite.set(a.data.siteId, [...(bySite.get(a.data.siteId) ?? []), a]);

  const dayTotals = days.map((d) => ({ date: iso(d).slice(0, 10), combustion: 0, flaring: 0, methane: 0, mwh: 0, boe: 0, avoided: 0 }));
  const perAsset = new Map<string, { a: AssetRecord; source: Source; co2e: number; avoidable: number; reason: EsgEmitter["reason"] }>();
  const sites: EsgSite[] = [];

  for (const [siteId, list] of [...bySite].sort()) {
    const site = ctx.world.sites.get(siteId)!;
    const separators = list.filter((a) => a.data.assetClass === "separator");
    const compressors = list.filter((a) => a.data.assetClass === "compressor");
    let co2e = 0;
    let methane = 0;
    let mwh = 0;
    let boe = 0;
    let avoided = 0;
    days.forEach((d, i) => {
      const parts: [AssetRecord, AssetDay][] = list.map((a) => [a, assetDay(ctx, a, d)]);
      if (separators[0]) parts.push([separators[0], flareDay(ctx, separators, compressors, d)]);
      const total = dayTotals[i]!;
      for (const [a, x] of parts) {
        if (x.source) total[x.source] += x.co2e;
        total.mwh += x.mwh;
        total.boe += x.boe;
        total.avoided += x.avoided;
        co2e += x.co2e;
        if (x.source === "methane") methane += x.co2e;
        mwh += x.mwh;
        boe += x.boe;
        avoided += x.avoided;
        if (!x.source || x.co2e === 0) continue;
        const key = `${a.data.id}|${x.source}`;
        const e = perAsset.get(key) ?? { a, source: x.source, co2e: 0, avoidable: 0, reason: null };
        e.co2e += x.co2e;
        e.avoidable += x.avoidable;
        e.reason = e.reason ?? x.reason;
        perAsset.set(key, e);
      }
    });
    const projectedAnnual = (co2e * 365) / ESG_DAYS;
    // This year's target was set at the start of the year; some sites are beating it, some not.
    const annualTarget = projectedAnnual * (0.88 + 0.22 * hashNoise(hashString(`esg-target:${siteId}`), 1));
    const intensity =
      site.site.businessLine === "oil_gas"
        ? boe > 0
          ? { value: r1((co2e * 1000) / boe), unit: "kg_per_boe" as const }
          : null
        : mwh > 0
          ? { value: Math.round((co2e / mwh) * 1000) / 1000, unit: "t_per_mwh" as const }
          : null;
    sites.push({
      siteId,
      siteName: site.site.name,
      businessLine: site.site.businessLine,
      co2e: r1(co2e),
      methaneShare: co2e > 0 ? Math.round((1000 * methane) / co2e) / 10 : 0,
      intensity,
      avoided: r1(avoided),
      annualTarget: r1(annualTarget),
      projectedAnnual: r1(projectedAnnual),
    });
  }
  sites.sort((a, b) => b.co2e - a.co2e);

  const emitters: EsgEmitter[] = [...perAsset.values()]
    .sort((a, b) => b.co2e - a.co2e)
    .slice(0, 20)
    .map((e) => ({
      assetId: e.a.data.id,
      assetClass: e.a.data.assetClass,
      siteId: e.a.data.siteId,
      health: "offline", // filled in fresh by esgOverview
      source: e.source,
      co2e: r1(e.co2e),
      avoidable: r1(e.avoidable),
      reason: e.avoidable > 0.05 ? e.reason : null,
    }));

  const sum = (k: keyof Omit<EsgDay, "date">) => dayTotals.reduce((s, d) => s + d[k], 0);
  return {
    days: dayTotals.map((d) => ({
      date: d.date,
      combustion: r1(d.combustion),
      flaring: r1(d.flaring),
      methane: r1(d.methane),
      mwh: r1(d.mwh),
      boe: r1(d.boe),
      avoided: r1(d.avoided),
    })),
    totals: {
      combustion: r1(sum("combustion")),
      flaring: r1(sum("flaring")),
      methane: r1(sum("methane")),
      co2e: r1(sum("combustion") + sum("flaring") + sum("methane")),
      avoided: r1(sum("avoided")),
      avoidable: r1([...perAsset.values()].reduce((s, e) => s + e.avoidable, 0)),
      annualTarget: r1(sites.reduce((s, x) => s + x.annualTarget, 0)),
      projectedAnnual: r1(sites.reduce((s, x) => s + x.projectedAnnual, 0)),
    },
    sites,
    emitters,
  };
}
