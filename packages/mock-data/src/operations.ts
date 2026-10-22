/**
 * Gas-to-power operations: plant output against dispatch, gas turbine efficiency against its
 * ambient-corrected baseline, equivalent operating hours, and transformer oil analysis.
 */
import {
  DGA_CONDITION_LIMITS,
  DGA_GASES,
  EOH_PER_START,
  HGP_INTERVAL_EOH,
  PLANT_KPI_DAYS,
  WASH_COMP_EFF_PTS,
  WASH_HEAT_RATE_PCT,
  dgaCondition,
  duvalZone,
  type AssetPerformance,
  type DgaGas,
  type DgaSample,
  type GasTurbineRow,
  type OutputPoint,
  type PowerOperations,
  type PowerPlant,
  type TransformerDga,
  type TurbineEvent,
  type TurbineTrend,
} from "@pdm/contracts";
import { DAY, HOUR, iso } from "./clock";
import { ApiFailure } from "./errors";
import { atFailure, progress } from "./faults";
import type { AssetRecord, TagRecord } from "./model";
import { gaussNoise, hashNoise } from "./random";
import { expectedValue, operating, tagValue, type ChaosWindows } from "./signals";
import type { Snapshot } from "./snapshot";
import { bessPerformance, inverterPerformance, stringPerformance } from "./solar";
import type { World } from "./world";

const UNIT_CLASSES = new Set(["gas_turbine", "steam_turbine", "recip_engine"]);

const r1 = (x: number) => Math.round(x * 10) / 10;
const r2 = (x: number) => Math.round(x * 100) / 100;
const mean = (xs: readonly number[]) => (xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length);

function tagOf(asset: AssetRecord, name: string): TagRecord | undefined {
  return asset.tags.find((t) => t.template.name === name);
}

interface Context {
  world: World;
  chaos: ChaosWindows;
  now: number;
}

// ─── Gas turbines ────────────────────────────────────────────────────────────

/**
 * Average actual and expected value of a tag over [from, to), from a few samples while the
 * machine ran. One reading is noisy; engineers judge efficiency on averages.
 */
function averaged(ctx: Context, tag: TagRecord, from: number, to: number, samples: number) {
  const actual: number[] = [];
  const expected: number[] = [];
  for (let i = 0; i < samples; i++) {
    const t = from + ((i + 0.5) / samples) * (to - from);
    if (operating(ctx.world, tag.asset, t).r < 0.95) continue; // starting, stopping or stopped
    const v = tagValue(ctx.world, ctx.chaos, tag, t);
    if (!v || v.quality === "bad") continue;
    actual.push(v.value);
    expected.push(expectedValue(ctx.world, tag, t));
  }
  const a = mean(actual);
  const e = mean(expected);
  return a === null || e === null ? null : { actual: a, expected: e };
}

/** Heat-rate deviation (%) and compressor-efficiency deviation (points) over a time window. */
function deviations(ctx: Context, asset: AssetRecord, from: number, to: number, samples: number) {
  const hrTag = tagOf(asset, "HEAT_RATE");
  const ceTag = tagOf(asset, "COMP_EFF");
  const hr = hrTag ? averaged(ctx, hrTag, from, to, samples) : null;
  const ce = ceTag ? averaged(ctx, ceTag, from, to, samples) : null;
  return {
    hr,
    ce,
    hrPct: hr ? r2((100 * (hr.actual - hr.expected)) / hr.expected) : null,
    cePts: ce ? r2(ce.actual - ce.expected) : null,
  };
}

/** Fired hours and starts per day for the unit's duty. */
function duty(asset: AssetRecord): { hours: number; starts: number } {
  if (asset.staticStatus === "maintenance") return { hours: 0, starts: 0 };
  if (asset.schedule === "day") return { hours: 16.5, starts: 1 };
  if (asset.schedule === "evening") return { hours: 6.5, starts: 1 };
  return { hours: 24, starts: 0.1 }; // base load: a start every ten days or so
}

function eohCounters(world: World, asset: AssetRecord, now: number): GasTurbineRow["eoh"] {
  const { hours, starts } = duty(asset);
  const perDay = hours + EOH_PER_START * starts;
  // A typical unit runs 90% of the days since it was commissioned.
  const ageDays = (now - Date.parse(asset.data.commissionedAt)) / DAY;
  const typical = { hours: 21, starts: 0.3 };
  const startsTotal = Math.round(ageDays * 0.9 * (starts || typical.starts));
  const total = Math.round(ageDays * 0.9 * (hours || typical.hours) + EOH_PER_START * startsTotal);
  // Where in its inspection interval the unit was when the simulation began: seeded, then it
  // keeps counting at its duty rate.
  const atStart = (0.03 + 0.96 * hashNoise(asset.seed ^ 0xe0e, 0)) * HGP_INTERVAL_EOH;
  const sinceInspection = Math.min(total, Math.round(atStart + ((now - world.createdAt) / DAY) * perDay));
  const startsSinceInspection = Math.min(startsTotal, Math.round((sinceInspection / Math.max(1, perDay)) * starts));
  const inspectionsDone = Math.round((total - sinceInspection) / HGP_INTERVAL_EOH);
  const remaining = HGP_INTERVAL_EOH - sinceInspection;
  return {
    total,
    sinceInspection,
    starts: startsTotal,
    startsSinceInspection,
    perDay: r1(perDay),
    // Hot gas path, then a major overhaul (the whole turbine opened), then hot gas path again…
    nextType: (inspectionsDone + 1) % 2 === 0 ? "major" : "hot_gas_path",
    remaining,
    nextDueAt: perDay > 0 ? iso(now + (remaining / perDay) * DAY) : null,
  };
}

export function turbineRow(ctx: Context, snapshot: Snapshot, asset: AssetRecord): GasTurbineRow {
  const { world, now } = ctx;
  const status = snapshot.conditions.get(asset.data.id)?.status ?? "stopped";
  const hourAgo = now - HOUR;
  const dev = deviations(ctx, asset, hourAgo, now, 6);
  const power = tagOf(asset, "POWER");
  const spread = tagOf(asset, "EXH_SPREAD");
  const out = power ? averaged(ctx, power, hourAgo, now, 6) : null;
  const sp = spread ? averaged(ctx, spread, hourAgo, now, 6) : null;
  return {
    assetId: asset.data.id,
    assetName: asset.data.name,
    siteId: asset.data.siteId,
    operatingStatus: status,
    capacityKw: Math.round(power?.base ?? 0),
    outputKw: out ? Math.round(out.actual) : null,
    heatRate: dev.hr ? Math.round(dev.hr.actual) : null,
    heatRateExpected: dev.hr ? Math.round(dev.hr.expected) : null,
    heatRateDeviationPct: dev.hrPct,
    compressorEff: dev.ce ? r2(dev.ce.actual) : null,
    compressorEffExpected: dev.ce ? r2(dev.ce.expected) : null,
    compressorEffDeviationPts: dev.cePts,
    exhaustSpread: sp ? r1(sp.actual) : null,
    washRecommended: (dev.hrPct ?? 0) >= WASH_HEAT_RATE_PCT || (dev.cePts ?? 0) <= WASH_COMP_EFF_PTS,
    eoh: eohCounters(world, asset, now),
  };
}

export function turbineTrend(ctx: Context, asset: AssetRecord, days: number): TurbineTrend {
  if (asset.data.assetClass !== "gas_turbine") throw new ApiFailure("bad_request", `${asset.data.id} isn't a gas turbine`);
  const { world, now } = ctx;
  const end = Math.floor(now / HOUR) * HOUR;
  const start = end - days * DAY;
  const points = [];
  for (let t = start; t < end; t += HOUR) {
    const d = deviations(ctx, asset, t, t + HOUR, 3);
    points.push({ t: iso(t), heatRateDeviationPct: d.hrPct, compressorEffDeviationPts: d.cePts });
  }
  const events: TurbineEvent[] = [];
  for (const f of world.faultsOf(asset.data.id)) {
    const tripped = f.failAt <= now && (f.resolvedAt === null || f.resolvedAt > f.failAt);
    if (tripped && f.failAt >= start) events.push({ t: iso(f.failAt), kind: "trip" });
    if (f.resolvedAt !== null && f.resolvedAt >= start && f.resolvedAt <= now) {
      events.push({ t: iso(f.resolvedAt), kind: f.type.id === "compressor_fouling" ? "water_wash" : "repair" });
    }
  }
  events.sort((a, b) => a.t.localeCompare(b.t));
  return { assetId: asset.data.id, intervalSeconds: 3600, points, events };
}

// ─── Transformer oil analysis ────────────────────────────────────────────────

/** Days between routine oil samples. */
const SAMPLE_EVERY_DAYS = 30;
const SAMPLES_KEPT = 6;

/**
 * Gases measured only in the lab (the online monitor covers H2, C2H2 and CO, which are tags).
 * `effects`: how far each fault type pushes the gas at failure, as a multiple of its base.
 * A hot spot makes methane, then more and more ethylene as it gets hotter, so a developing
 * thermal fault walks across the Duval triangle from T1 through T2 into T3.
 */
const LAB_GASES: Partial<Record<DgaGas, { base: number; effects: Record<string, number> }>> = {
  CH4: { base: 25, effects: { transformer_gassing: 3.7 } },
  C2H6: { base: 20, effects: { transformer_gassing: 0.8 } },
  C2H4: { base: 6, effects: { transformer_gassing: 21 } },
};

function gasPpm(world: World, asset: AssetRecord, gas: DgaGas, t: number, sample: number): number {
  const faults = world.faultsOf(asset.data.id);
  const lab = LAB_GASES[gas];
  let ppm: number;
  if (lab) {
    // Every transformer's oil is a bit different.
    const base = lab.base * (0.7 + 0.6 * hashNoise(asset.seed ^ 0x6a5, DGA_GASES.indexOf(gas)));
    ppm = base;
    for (const f of faults) {
      const p = progress(f, t);
      ppm += base * (lab.effects[f.type.id] ?? 0) * p * p;
    }
  } else {
    const tag = tagOf(asset, gas);
    if (!tag) return 0;
    // The tag's healthy level plus whatever faults add (no sensor noise: this is the lab result).
    ppm = tag.base;
    for (const f of faults) {
      const p = progress(f, t);
      for (const e of f.type.effects) {
        if (e.tag === gas) ppm += e.direction * tag.base * atFailure(e, tag.template) * p * p;
      }
    }
  }
  // Lab measurements are good to a few percent.
  return Math.max(0, ppm * (1 + 0.04 * gaussNoise(asset.seed ^ 0x1ab, sample * 8 + DGA_GASES.indexOf(gas))));
}

function dgaSample(world: World, asset: AssetRecord, t: number, sample: number): DgaSample {
  const gases = Object.fromEntries(DGA_GASES.map((g) => [g, r1(gasPpm(world, asset, g, t, sample))])) as Record<DgaGas, number>;
  const tdcg = r1(DGA_GASES.reduce((s, g) => s + gases[g], 0));
  let worst: DgaSample["worst"] = "TDCG";
  let condition = dgaCondition(tdcg, DGA_CONDITION_LIMITS.TDCG);
  for (const g of DGA_GASES) {
    const c = dgaCondition(gases[g], DGA_CONDITION_LIMITS[g]);
    if (c > condition) [condition, worst] = [c, g];
  }
  const sum = gases.CH4 + gases.C2H4 + gases.C2H2;
  const pct = (x: number) => r1((100 * x) / sum);
  return {
    sampledAt: iso(t),
    gases,
    tdcg,
    condition,
    worst,
    duval:
      sum > 0
        ? {
            ch4Pct: pct(gases.CH4),
            c2h4Pct: pct(gases.C2H4),
            c2h2Pct: pct(gases.C2H2),
            zone: duvalZone((100 * gases.CH4) / sum, (100 * gases.C2H4) / sum, (100 * gases.C2H2) / sum),
          }
        : null,
  };
}

export function transformerDga(world: World, asset: AssetRecord, now: number): TransformerDga {
  if (asset.data.assetClass !== "transformer") throw new ApiFailure("bad_request", `${asset.data.id} isn't a transformer`);
  // Each transformer is sampled on its own day of the month.
  const every = SAMPLE_EVERY_DAYS * DAY;
  const phase = Math.floor(hashNoise(asset.seed ^ 0xd6a, 0) * SAMPLE_EVERY_DAYS) * DAY + 9 * HOUR;
  const latest = Math.floor((now - phase) / every) * every + phase;
  const samples = Array.from({ length: SAMPLES_KEPT }, (_, i) => {
    const t = latest - i * every;
    return dgaSample(world, asset, t, Math.round(t / every));
  });
  const [a, b] = samples;
  return {
    assetId: asset.data.id,
    assetName: asset.data.name,
    siteId: asset.data.siteId,
    samples,
    tdcgPerDay: a && b ? r2((a.tdcg - b.tdcg) / SAMPLE_EVERY_DAYS) : null,
  };
}

// ─── Plants ──────────────────────────────────────────────────────────────────

/** Output (actual) and dispatch (what was asked for) of a set of units at time t, kW. */
function outputAt(ctx: Context, units: readonly AssetRecord[], t: number): { output: number; dispatch: number } {
  let output = 0;
  let dispatch = 0;
  for (const u of units) {
    const power = tagOf(u, "POWER");
    if (!power || u.staticStatus === "offline") continue; // no data from it: leave it out of both
    output += tagValue(ctx.world, ctx.chaos, power, t)?.value ?? 0;
    // The grid operator dispatches what the unit declared it could make (its ambient-corrected
    // capability), on the plan: a trip doesn't change what was asked for.
    dispatch += Math.max(0, expectedValue(ctx.world, power, t, true));
  }
  return { output, dispatch };
}

const KPI_STEP = 3 * HOUR;
/** 30 days of samples is the slow part, and it only changes every step: keep the answer. */
const kpiCache = new WeakMap<World, Map<string, { availabilityPct: number; capacityFactorPct: number }>>();

function plantKpis(ctx: Context, siteId: string, units: readonly AssetRecord[], capacityKw: number) {
  const end = Math.floor(ctx.now / KPI_STEP) * KPI_STEP;
  const cache = kpiCache.get(ctx.world) ?? new Map();
  kpiCache.set(ctx.world, cache);
  const key = `${siteId}:${units.length}:${end}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const step = KPI_STEP;
  let availableKwh = 0;
  let madeKwh = 0;
  let samples = 0;
  for (let t = end - PLANT_KPI_DAYS * DAY; t < end; t += step) {
    samples++;
    for (const u of units) {
      const power = tagOf(u, "POWER");
      if (!power) continue;
      const tripped = ctx.world.faultsOf(u.data.id).some((f) => progress(f, t) >= 1);
      if (u.staticStatus !== "maintenance" && !tripped) availableKwh += power.base;
      madeKwh += tagValue(ctx.world, ctx.chaos, power, t)?.value ?? Math.max(0, expectedValue(ctx.world, power, t));
    }
  }
  const possible = capacityKw * samples;
  const kpis = {
    availabilityPct: possible ? r1((100 * availableKwh) / possible) : 0,
    capacityFactorPct: possible ? r1((100 * madeKwh) / possible) : 0,
  };
  cache.set(key, kpis);
  return kpis;
}

/**
 * Whole-plant heat rate: all the fuel the gas turbines burn, over everything the gas and steam
 * turbines make. The steam turbine burns nothing (it runs on the gas turbines' exhaust heat),
 * which is why a combined-cycle plant beats a gas turbine on its own. Engines are left out:
 * their fuel isn't metered here.
 */
function plantHeatRate(ctx: Context, units: readonly AssetRecord[]): number | null {
  let fuel = 0;
  let output = 0;
  for (const u of units) {
    if (u.data.assetClass === "recip_engine") continue;
    const p = tagOf(u, "POWER");
    const kw = p ? (tagValue(ctx.world, ctx.chaos, p, ctx.now)?.value ?? 0) : 0;
    output += kw;
    if (u.data.assetClass === "gas_turbine") {
      const hr = tagOf(u, "HEAT_RATE");
      fuel += kw * (hr ? (tagValue(ctx.world, ctx.chaos, hr, ctx.now)?.value ?? 0) : 0);
    }
  }
  return output > 1000 ? Math.round(fuel / output) : null;
}

export function powerOperations(input: {
  world: World;
  chaos: ChaosWindows;
  snapshot: Snapshot;
  now: number;
  siteId?: string;
  inScope: (assetId: string) => boolean;
}): PowerOperations {
  const { world, snapshot, now } = input;
  const ctx: Context = { world, chaos: input.chaos, now };
  const sites = [...world.sites.values()].filter((s) => s.def.businessLine === "gas_to_power");
  const assetsBySite = new Map<string, AssetRecord[]>();
  for (const a of world.assets.values()) {
    if (a.site.def.businessLine !== "gas_to_power" || !input.inScope(a.data.id)) continue;
    const list = assetsBySite.get(a.data.siteId) ?? [];
    list.push(a);
    assetsBySite.set(a.data.siteId, list);
  }

  const turbinesOf = (assets: readonly AssetRecord[]) =>
    assets.filter((a) => a.data.assetClass === "gas_turbine").map((a) => turbineRow(ctx, snapshot, a));
  const transformersOf = (assets: readonly AssetRecord[]) =>
    assets.filter((a) => a.data.assetClass === "transformer").map((a) => transformerDga(world, a, now));

  const details = new Map<string, { turbines: GasTurbineRow[]; transformers: TransformerDga[] }>();
  const plants: PowerPlant[] = [];
  for (const site of sites) {
    const assets = assetsBySite.get(site.def.code);
    if (!assets) continue;
    const units = assets.filter((a) => UNIT_CLASSES.has(a.data.assetClass));
    const capacityKw = units.reduce((s, u) => s + (tagOf(u, "POWER")?.base ?? 0), 0);
    const turbines = turbinesOf(assets);
    const transformers = transformersOf(assets);
    details.set(site.def.code, { turbines, transformers });
    const { output, dispatch } = outputAt(ctx, units, now);
    plants.push({
      siteId: site.def.code,
      siteName: site.def.name,
      kind: units.some((u) => u.data.assetClass === "steam_turbine") ? "combined_cycle" : "peaker",
      capacityKw: Math.round(capacityKw),
      outputKw: Math.round(output),
      dispatchKw: Math.round(dispatch),
      unitsRunning: units.filter((u) => snapshot.conditions.get(u.data.id)?.status === "running").length,
      unitsTotal: units.length,
      ...plantKpis(ctx, site.def.code, units, capacityKw),
      heatRate: plantHeatRate(ctx, units),
      washesRecommended: turbines.filter((t) => t.washRecommended).length,
      transformersOfConcern: transformers.filter((t) => t.samples[0]!.condition >= 2).length,
    });
  }

  const siteId = plants.some((p) => p.siteId === input.siteId) ? input.siteId! : (plants[0]?.siteId ?? null);
  if (input.siteId && siteId !== input.siteId) throw new ApiFailure("not_found", `No gas-to-power plant ${input.siteId} in scope`);
  const output: OutputPoint[] = [];
  if (siteId) {
    const units = (assetsBySite.get(siteId) ?? []).filter((a) => UNIT_CLASSES.has(a.data.assetClass));
    const end = Math.floor(now / HOUR) * HOUR;
    for (let t = end - 47 * HOUR; t <= end; t += HOUR) {
      const at = outputAt(ctx, units, t);
      output.push({ t: iso(t), outputKw: Math.round(at.output), dispatchKw: Math.round(at.dispatch) });
    }
  }
  const detail = siteId ? details.get(siteId) : undefined;
  return { plants, siteId, output, turbines: detail?.turbines ?? [], transformers: detail?.transformers ?? [] };
}

export function assetPerformance(ctx: Context, snapshot: Snapshot, asset: AssetRecord): AssetPerformance {
  if (asset.data.assetClass === "gas_turbine") return { kind: "gas_turbine", turbine: turbineRow(ctx, snapshot, asset) };
  if (asset.data.assetClass === "transformer") return { kind: "transformer", dga: transformerDga(ctx.world, asset, ctx.now) };
  if (asset.site.def.businessLine === "solar") {
    if (asset.data.assetClass === "inverter") return { kind: "inverter", inverter: inverterPerformance(ctx, snapshot, asset) };
    if (asset.data.assetClass === "pv_string") return { kind: "pv_string", string: stringPerformance(ctx, snapshot, asset) };
    if (asset.data.assetClass === "bess") return { kind: "bess", bess: bessPerformance(ctx, snapshot, asset) };
  }
  return { kind: "none" };
}
