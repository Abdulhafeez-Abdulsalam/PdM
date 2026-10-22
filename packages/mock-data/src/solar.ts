/**
 * Solar operations: power against the PV model, performance ratio, the loss waterfall from
 * sunlight to grid, inverter and string comparisons, batteries, and when to clean the panels.
 */
import {
  CLEAN_SOON_DAYS,
  INVERTER_FLAG_PCT,
  SOLAR_KPI_DAYS,
  STRING_FLAG_PCT,
  type BessPerformance,
  type BessRow,
  type InverterPerformance,
  type InverterTile,
  type SoilingAdvice,
  type SolarLossStep,
  type SolarOperations,
  type SolarPlant,
  type SolarPowerPoint,
  type SolarWaterfall,
  type StringPerformance,
  type StringRow,
} from "@pdm/contracts";
import { DAY, HOUR, iso } from "./clock";
import { ApiFailure } from "./errors";
import { faultOffset } from "./faults";
import type { AssetRecord, TagRecord } from "./model";
import { childrenOf, expectedValue, operating, poa, pvBreakdown, soilingState, stringLoss, tagValue, type ChaosWindows } from "./signals";
import type { Snapshot } from "./snapshot";
import type { World } from "./world";

interface Context {
  world: World;
  chaos: ChaosWindows;
  now: number;
}

/** What a kWh sells for at each site, and what washing a MWp of panels costs (USD). */
const ECONOMICS: Record<string, { pricePerMwh: number; cleaningPerMwp: number }> = {
  PCS: { pricePerMwh: 40, cleaningPerMwp: 1200 },
  SPV: { pricePerMwh: 30, cleaningPerMwp: 300 },
  WSS: { pricePerMwh: 30, cleaningPerMwp: 500 },
};
const ECONOMICS_DEFAULT = { pricePerMwh: 35, cleaningPerMwp: 600 };

const r1 = (x: number) => Math.round(x * 10) / 10;
const tagOf = (asset: AssetRecord, name: string): TagRecord | undefined => asset.tags.find((t) => t.template.name === name);
const median = (xs: readonly number[]): number | null => {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Hourly sample times (the middle of each hour) covering the `hours` before the last whole hour. */
function hourlyTimes(now: number, hours: number): number[] {
  const end = Math.floor(now / HOUR) * HOUR;
  return Array.from({ length: hours }, (_, i) => end - (hours - i) * HOUR + HOUR / 2);
}

// ─── One inverter at one moment ──────────────────────────────────────────────

interface InverterMoment {
  /** The PV model with the inverter running as planned (kW): what the sunlight should give. */
  planned: number;
  /** Loss steps (kW) from sunlight down to the delivered power. */
  steps: Record<SolarLossStep, number>;
  sun: number;
  actual: number;
}

function inverterMoment(ctx: Context, inv: AssetRecord, t: number): InverterMoment | null {
  const ac = tagOf(inv, "AC_POWER");
  if (!ac || inv.staticStatus === "offline") return null; // no data: leave it out of everything
  const reading = tagValue(ctx.world, ctx.chaos, ac, t);
  // A gap or a doubtful reading (e.g. a stuck sensor repeating one value) can't be trusted
  // for energy accounting: leave that inverter out of that hour.
  if (!reading || reading.quality !== "good") return null;
  const rp = operating(ctx.world, inv, t, true).r;
  const b = pvBreakdown(ctx.world, inv, t);
  const planned = rp * b.ac;
  const asRunning = expectedValue(ctx.world, ac, t); // 0 when tripped or in maintenance
  const derate = Math.min(asRunning, Math.max(0, -faultOffset(ac, ctx.world.faultsOf(inv.data.id), t)));
  const strings = (asRunning - derate) * stringLoss(ctx.world, inv, t);
  const actual = Math.max(0, reading.value);
  const steps: Record<SolarLossStep, number> = {
    temperature: rp * (b.sun - b.afterTemp),
    soiling: rp * (b.afterTemp - b.dc),
    inverter: rp * (b.dc - b.beforeClip),
    clipping: rp * (b.beforeClip - b.ac),
    downtime: planned - asRunning + derate,
    strings,
    other: 0,
  };
  steps.other = asRunning - derate - strings - actual;
  return { planned, steps, sun: rp * b.sun, actual };
}

// ─── Per-site summaries (cached: they sample days of data) ──────────────────

interface SiteSummary {
  waterfall: SolarWaterfall;
  energyKwh: number;
  tiles: InverterTile[];
  strings: StringRow[];
  /** Per string: share of sisters (%), null when there was no sun. */
  stringPct: Map<string, number | null>;
  expectedKwhPerDay: number;
}

const CACHE_STEP = 3 * HOUR;
const cache = new WeakMap<World, Map<string, SiteSummary>>();

function siteSummary(ctx: Context, snapshot: Snapshot, siteId: string, assets: readonly AssetRecord[]): SiteSummary {
  const bucket = Math.floor(ctx.now / CACHE_STEP);
  const byWorld = cache.get(ctx.world) ?? new Map<string, SiteSummary>();
  cache.set(ctx.world, byWorld);
  const key = `${siteId}:${assets.length}:${bucket}`;
  const hit = byWorld.get(key);
  if (hit) return hit;

  const inverters = assets.filter((a) => a.data.assetClass === "inverter");
  // Waterfall and performance ratio over the last week, hourly.
  const losses = Object.fromEntries(
    ["temperature", "soiling", "inverter", "clipping", "downtime", "strings", "other"].map((s) => [s, 0]),
  ) as Record<SolarLossStep, number>;
  let sun = 0;
  let actual = 0;
  let planned = 0;
  // Every 2 hours is plenty for a week's totals (each sample stands for 2 hours of energy).
  const WEEK_STEP_H = 2;
  for (const t of hourlyTimes(ctx.now, SOLAR_KPI_DAYS * 24).filter((_, i) => i % WEEK_STEP_H === 0)) {
    for (const inv of inverters) {
      const m = inverterMoment(ctx, inv, t);
      if (!m) continue;
      sun += m.sun * WEEK_STEP_H;
      actual += m.actual * WEEK_STEP_H;
      planned += m.planned * WEEK_STEP_H;
      for (const s of Object.keys(losses) as SolarLossStep[]) losses[s] += m.steps[s] * WEEK_STEP_H;
    }
  }
  const waterfall: SolarWaterfall = {
    sunKwh: Math.round(sun),
    losses: (Object.keys(losses) as SolarLossStep[]).map((step) => ({ step, kwh: Math.round(losses[step]) })),
    actualKwh: Math.round(actual),
  };
  // Keep the sum exact after rounding: "other" absorbs the rounding.
  const rounded = waterfall.sunKwh - waterfall.losses.reduce((s, l) => s + l.kwh, 0);
  waterfall.losses.find((l) => l.step === "other")!.kwh += rounded - waterfall.actualKwh;

  // Inverters and strings over the last 24 hours.
  const day = hourlyTimes(ctx.now, 24);
  const tiles: InverterTile[] = inverters.map((inv) => {
    let made = 0;
    let exp = 0;
    let any = false;
    for (const t of day) {
      const m = inverterMoment(ctx, inv, t);
      if (!m) continue;
      any = true;
      made += m.actual;
      exp += m.planned;
    }
    const area = ctx.world.nodes.get(inv.data.areaId)?.node.name ?? inv.data.areaId;
    return {
      assetId: inv.data.id,
      areaName: area,
      operatingStatus: snapshot.conditions.get(inv.data.id)?.status ?? "stopped",
      performancePct: any && exp > 1 ? r1((100 * made) / exp) : null,
      energyKwh: any ? Math.round(made) : null,
      lossKwh: any ? Math.round(exp - made) : null,
    };
  });

  const stringPct = new Map<string, number | null>();
  const strings: StringRow[] = [];
  for (const inv of inverters) {
    const kids = childrenOf(ctx.world, inv.data.id).filter((s) => s.data.assetClass === "pv_string");
    const energy = kids.map((s) => {
      const p = tagOf(s, "POWER");
      // Strings switched off on purpose aren't underperforming; ones without trustworthy data can't be judged.
      if (!p || s.staticStatus !== "normal") return null;
      let e = 0;
      for (const t of day) {
        const v = tagValue(ctx.world, ctx.chaos, p, t);
        if (!v || v.quality !== "good") return null;
        e += Math.max(0, v.value);
      }
      return e;
    });
    kids.forEach((s, i) => {
      const own = energy[i];
      const sisters = energy.filter((e, j): e is number => j !== i && e !== null);
      const m = median(sisters);
      const pct = own === null || own === undefined || m === null || m < 1 ? null : r1((100 * own) / m);
      stringPct.set(s.data.id, pct);
      if (pct !== null && pct < STRING_FLAG_PCT) {
        const pi = tagOf(s, "PERF_INDEX");
        const v = pi ? tagValue(ctx.world, ctx.chaos, pi, ctx.now) : null;
        strings.push({ assetId: s.data.id, inverterId: inv.data.id, pctOfSisters: pct, perfIndex: v ? r1(v.value) : null });
      }
    });
  }
  strings.sort((a, b) => a.pctOfSisters - b.pctOfSisters || a.assetId.localeCompare(b.assetId));

  const summary: SiteSummary = {
    waterfall,
    energyKwh: Math.round(actual),
    tiles,
    strings,
    stringPct,
    expectedKwhPerDay: planned / SOLAR_KPI_DAYS,
  };
  byWorld.set(key, summary);
  return summary;
}

// ─── Batteries ───────────────────────────────────────────────────────────────

function bessRow(ctx: Context, snapshot: Snapshot, b: AssetRecord, times: readonly number[]): BessRow {
  const read = (name: string, t = ctx.now) => {
    const tag = tagOf(b, name);
    const v = tag ? tagValue(ctx.world, ctx.chaos, tag, t) : null;
    return v ? v.value : null;
  };
  const soc = read("SOC");
  const hourAgo = read("SOC", ctx.now - HOUR);
  const change = soc !== null && hourAgo !== null ? soc - hourAgo : 0;
  const spread = read("CELL_DV");
  return {
    assetId: b.data.id,
    assetName: b.data.name,
    operatingStatus: snapshot.conditions.get(b.data.id)?.status ?? "stopped",
    socPct: soc === null ? null : r1(soc),
    sohPct: (() => {
      const v = read("SOH");
      return v === null ? null : r1(v);
    })(),
    cellSpreadMv: spread === null ? null : Math.round(spread * 1000),
    cellTempMaxC: (() => {
      const v = read("CELL_T_MAX");
      return v === null ? null : r1(v);
    })(),
    state: change > 1 ? "charging" : change < -1 ? "discharging" : "idle",
    soc: times.map((t) => {
      const v = read("SOC", t);
      return v === null ? null : r1(v);
    }),
  };
}

// ─── Cleaning advice ─────────────────────────────────────────────────────────

function soilingAdvice(ctx: Context, siteId: string, dcKw: number, expectedKwhPerDay: number): SoilingAdvice {
  const s = soilingState(ctx.world, siteId, ctx.now);
  const { pricePerMwh, cleaningPerMwp } = ECONOMICS[siteId] ?? ECONOMICS_DEFAULT;
  // What a clean array would make per day, and the revenue that is.
  const cleanKwhPerDay = expectedKwhPerDay / Math.max(0.5, 1 - s.pct / 100);
  const revenuePerDay = (cleanKwhPerDay / 1000) * pricePerMwh;
  const cleaningCost = (dcKw / 1000) * cleaningPerMwp;
  const rate = s.ratePctPerDay / 100;
  const optimal = Math.sqrt((2 * cleaningCost) / Math.max(1e-9, revenuePerDay * rate));
  const sinceDays = (ctx.now - s.lastCleaned) / DAY;
  const cleanIn = Math.max(0, optimal - sinceDays);
  return {
    soilingPct: r1(s.pct),
    ratePctPerDay: s.ratePctPerDay,
    lastCleanedAt: iso(s.lastCleaned),
    lossKwhPerDay: Math.round((cleanKwhPerDay * s.pct) / 100),
    lossValuePerDay: Math.round((revenuePerDay * s.pct) / 100),
    lossValueSinceCleaning: Math.round((revenuePerDay * rate * sinceDays * sinceDays) / 2),
    cleaningCost: Math.round(cleaningCost),
    currency: "USD",
    pricePerMwh,
    optimalIntervalDays: Math.round(optimal),
    recommendation: cleanIn === 0 ? "clean_now" : cleanIn <= CLEAN_SOON_DAYS ? "clean_soon" : "wait",
    cleanInDays: Math.round(cleanIn),
  };
}

// ─── The page ────────────────────────────────────────────────────────────────

function powerSeries(ctx: Context, inverters: readonly AssetRecord[]): SolarPowerPoint[] {
  const end = Math.floor(ctx.now / HOUR) * HOUR;
  const points: SolarPowerPoint[] = [];
  for (let t = end - 47 * HOUR; t <= end; t += HOUR) {
    let actual = 0;
    let expected = 0;
    for (const inv of inverters) {
      const m = inverterMoment(ctx, inv, t);
      if (!m) continue;
      actual += m.actual;
      expected += m.planned;
    }
    points.push({ t: iso(t), actualKw: Math.round(actual), expectedKw: Math.round(expected) });
  }
  return points;
}

export function solarOperations(input: {
  world: World;
  chaos: ChaosWindows;
  snapshot: Snapshot;
  now: number;
  siteId?: string;
  inScope: (assetId: string) => boolean;
}): SolarOperations {
  const { world, snapshot, now } = input;
  const ctx: Context = { world, chaos: input.chaos, now };
  const bySite = new Map<string, AssetRecord[]>();
  for (const a of world.assets.values()) {
    if (a.site.def.businessLine !== "solar" || !input.inScope(a.data.id)) continue;
    const list = bySite.get(a.data.siteId) ?? [];
    list.push(a);
    bySite.set(a.data.siteId, list);
  }

  const plants: SolarPlant[] = [];
  for (const site of world.sites.values()) {
    const assets = bySite.get(site.def.code);
    if (!assets) continue;
    const inverters = assets.filter((a) => a.data.assetClass === "inverter");
    const acCapacityKw = inverters.reduce((s, i) => s + (tagOf(i, "AC_POWER")?.base ?? 0), 0);
    const sum = siteSummary(ctx, snapshot, site.def.code, assets);
    let outputKw = 0;
    let expectedKw = 0;
    for (const inv of inverters) {
      const m = inverterMoment(ctx, inv, now);
      if (!m) continue;
      outputKw += m.actual;
      expectedKw += m.planned;
    }
    plants.push({
      siteId: site.def.code,
      siteName: site.def.name,
      dcCapacityKw: Math.round(acCapacityKw * 1.3),
      acCapacityKw: Math.round(acCapacityKw),
      outputKw: Math.round(outputKw),
      expectedKw: Math.round(expectedKw),
      irradiance: Math.round(poa(world, site.def.code, now)),
      performanceRatioPct: sum.waterfall.sunKwh > 0 ? r1((100 * sum.waterfall.actualKwh) / sum.waterfall.sunKwh) : null,
      energyKwh: sum.energyKwh,
      soilingPct: r1(soilingState(world, site.def.code, now).pct),
      invertersFlagged: sum.tiles.filter((t) => t.performancePct !== null && t.performancePct < INVERTER_FLAG_PCT).length,
      stringsFlagged: sum.strings.length,
    });
  }

  const siteId = plants.some((p) => p.siteId === input.siteId) ? input.siteId! : (plants[0]?.siteId ?? null);
  if (input.siteId && siteId !== input.siteId) throw new ApiFailure("not_found", `No solar plant ${input.siteId} in scope`);
  if (!siteId) return { plants, siteId, power: [], waterfall: null, inverters: [], strings: [], bess: [], soiling: null };

  const assets = bySite.get(siteId)!;
  const inverters = assets.filter((a) => a.data.assetClass === "inverter");
  const sum = siteSummary(ctx, snapshot, siteId, assets);
  const power = powerSeries(ctx, inverters);
  const times = power.map((p) => Date.parse(p.t));
  const plant = plants.find((p) => p.siteId === siteId)!;
  return {
    plants,
    siteId,
    power,
    waterfall: sum.waterfall,
    inverters: sum.tiles,
    strings: sum.strings,
    bess: assets.filter((a) => a.data.assetClass === "bess").map((b) => bessRow(ctx, snapshot, b, times)),
    soiling: soilingAdvice(ctx, siteId, plant.dcCapacityKw, sum.expectedKwhPerDay),
  };
}

// ─── Asset 360 ───────────────────────────────────────────────────────────────

function siteAssetsOf(world: World, siteId: string): AssetRecord[] {
  return [...world.assets.values()].filter((a) => a.data.siteId === siteId);
}

export function inverterPerformance(ctx: Context, snapshot: Snapshot, inv: AssetRecord): InverterPerformance {
  const sum = siteSummary(ctx, snapshot, inv.data.siteId, siteAssetsOf(ctx.world, inv.data.siteId));
  const tile = sum.tiles.find((t) => t.assetId === inv.data.id)!;
  let clipped = 0;
  for (const t of hourlyTimes(ctx.now, 24)) clipped += inverterMoment(ctx, inv, t)?.steps.clipping ?? 0;
  return {
    tile,
    power: powerSeries(ctx, [inv]),
    clippedKwh: Math.round(clipped),
    strings: childrenOf(ctx.world, inv.data.id).map((s) => ({ assetId: s.data.id, pctOfSisters: sum.stringPct.get(s.data.id) ?? null })),
  };
}

export function stringPerformance(ctx: Context, snapshot: Snapshot, str: AssetRecord): StringPerformance {
  const inverterId = str.data.parentAssetId;
  if (!inverterId) throw new ApiFailure("bad_request", `${str.data.id} isn't connected to an inverter`);
  const sum = siteSummary(ctx, snapshot, str.data.siteId, siteAssetsOf(ctx.world, str.data.siteId));
  const sisters = childrenOf(ctx.world, inverterId).filter((s) => s.data.id !== str.data.id);
  const read = (a: AssetRecord, name: string, t: number) => {
    const tag = tagOf(a, name);
    const v = tag && a.staticStatus !== "offline" ? tagValue(ctx.world, ctx.chaos, tag, t) : null;
    return v ? v.value : null;
  };
  const end = Math.floor(ctx.now / HOUR) * HOUR;
  const power = [];
  for (let t = end - 47 * HOUR; t <= end; t += HOUR) {
    const kw = read(str, "POWER", t);
    const m = median(
      sisters.flatMap((s) => {
        const v = read(s, "POWER", t);
        return v === null ? [] : [v];
      }),
    );
    power.push({
      t: iso(t),
      kw: kw === null ? null : Math.round(kw * 100) / 100,
      sistersMedianKw: m === null ? null : Math.round(m * 100) / 100,
    });
  }
  const pi = read(str, "PERF_INDEX", ctx.now);
  return {
    assetId: str.data.id,
    inverterId,
    pctOfSisters: sum.stringPct.get(str.data.id) ?? null,
    perfIndex: pi === null ? null : r1(pi),
    power,
  };
}

export function bessPerformance(ctx: Context, snapshot: Snapshot, b: AssetRecord): BessPerformance {
  const end = Math.floor(ctx.now / HOUR) * HOUR;
  const times = Array.from({ length: 48 }, (_, i) => end - (47 - i) * HOUR);
  return { row: bessRow(ctx, snapshot, b, times), times: times.map(iso) };
}
