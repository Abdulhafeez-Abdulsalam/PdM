/**
 * Produces the value of any tag at any moment — past, present or (not used) future —
 * without storing history. Every value is a pure function of (seed, tag, time), so a
 * chart of last month and a live reading now always agree.
 */
import type { DataQuality, HistoryPoint } from "@pdm/contracts";
import type { TagTemplate } from "./catalog/tag-templates";
import { DAY, iso } from "./clock";
import { faultOffset, progress } from "./faults";
import type { AssetRecord, TagRecord } from "./model";
import { gaussNoise, hashNoise, smoothNoise } from "./random";
import type { World } from "./world";

const HOUR_S = 3600;

export interface Reading {
  value: number;
  quality: DataQuality;
}

/** Time windows where "chaos mode" was on (data gaps, bad quality, alarm bursts). */
export class ChaosWindows {
  private windows: { from: number; to: number | null }[] = [];

  get enabled(): boolean {
    const last = this.windows[this.windows.length - 1];
    return last !== undefined && last.to === null;
  }

  set(enabled: boolean, now: number): void {
    if (enabled === this.enabled) return;
    if (enabled) this.windows.push({ from: now, to: null });
    else {
      const last = this.windows[this.windows.length - 1];
      if (last) last.to = now;
    }
  }

  activeAt(t: number): boolean {
    return this.windows.some((w) => t >= w.from && (w.to === null || t < w.to));
  }
}

// ─── Environment ──────────────────────────────────────────────────────────────

function localHour(t: number, utcOffsetHours: number): number {
  const h = (t / 3_600_000 + utcOffsetHours) % 24;
  return h < 0 ? h + 24 : h;
}

function dayOfYear(t: number): number {
  return (t / 86_400_000) % 365.25;
}

/** Air temperature, °C. Daily cycle (coolest ~03:00, hottest ~15:00) + seasons + weather. */
export function ambientC(world: World, siteId: string, t: number): number {
  const site = world.sites.get(siteId);
  if (!site) return 25;
  const { def, seed } = site;
  const h = localHour(t, def.utcOffsetHours);
  const hemisphere = def.lat >= 0 ? 1 : -1;
  return (
    def.meanTempC +
    6 * Math.sin((2 * Math.PI * (h - 9)) / 24) +
    8 * hemisphere * Math.sin((2 * Math.PI * (dayOfYear(t) - 110)) / 365.25) +
    1.5 * smoothNoise(seed + 3, t / 1000, 3 * HOUR_S)
  );
}

/** Ambient as roughly −1 (cold) … +1 (hot) relative to the site's mean. */
function ambientNorm(world: World, siteId: string, t: number): number {
  const site = world.sites.get(siteId);
  if (!site) return 0;
  return (ambientC(world, siteId, t) - site.def.meanTempC) / 15.5;
}

/** Solar irradiance as a fraction of clear-sky noon (0 at night). */
export function irradiance(world: World, siteId: string, t: number): number {
  const site = world.sites.get(siteId);
  if (!site) return 0;
  const { def, seed } = site;
  const h = localHour(t, def.utcOffsetHours);
  const sun = Math.max(0, Math.sin((Math.PI * (h - 6)) / 12));
  if (sun === 0) return 0;
  const hemisphere = def.lat >= 0 ? 1 : -1;
  const season = 0.9 + 0.1 * hemisphere * Math.cos((2 * Math.PI * (dayOfYear(t) - 172)) / 365.25);
  const tSec = t / 1000;
  const clouds =
    1 -
    def.cloudiness * 0.6 * Math.max(0, smoothNoise(seed, tSec, 1800)) -
    def.cloudiness * 0.2 * Math.max(0, smoothNoise(seed + 7, tSec, 6 * HOUR_S));
  return sun ** 1.2 * season * clouds;
}

// ─── Operating state ─────────────────────────────────────────────────────────

/** r = how much the asset is running (0 stopped … 1 running); L = load (0–1). */
export interface Operating {
  r: number;
  L: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Linear ramp up at `start`, down at `end`, each taking `rampH` hours. */
function scheduleRamp(h: number, start: number, end: number, rampH: number): number {
  if (h < start || h >= end + rampH) return 0;
  if (h < start + rampH) return (h - start) / rampH;
  if (h < end) return 1;
  return 1 - (h - end) / rampH;
}

/** Battery state of charge over the day: charge 09–15 from solar, discharge 17–22 into the evening peak. */
function batterySoc(h: number): number {
  if (h < 9) return 0.2;
  if (h < 15) return 0.2 + (0.7 * (h - 9)) / 6;
  if (h < 17) return 0.9;
  if (h < 22) return 0.9 - (0.7 * (h - 17)) / 5;
  return 0.2;
}

/**
 * How much the asset is running, and at what load. `planned` ignores trips: what the asset
 * was meant to be doing (used for the dispatch target).
 */
export function operating(world: World, asset: AssetRecord, t: number, planned = false): Operating {
  if (asset.staticStatus === "maintenance" || asset.staticStatus === "standby") return { r: 0, L: 0 };
  if (!planned && world.faultsOf(asset.data.id).some((f) => progress(f, t) >= 1)) return { r: 0, L: 0 }; // tripped

  const { def, seed } = asset.site;
  const tSec = t / 1000;
  const h = localHour(t, def.utcOffsetHours);
  const cls = asset.data.assetClass;

  switch (def.profile) {
    case "solar": {
      const irr = irradiance(world, def.code, t);
      if (cls === "transformer" || cls === "switchgear") return { r: 1, L: Math.max(0.05, irr) };
      if (cls === "bess") return { r: 1, L: batterySoc(h) };
      return { r: clamp(irr * 20, 0, 1), L: irr };
    }
    case "dispatch": {
      const day = Math.max(0, Math.sin((Math.PI * (h - 7)) / 14));
      return { r: 1, L: clamp(0.72 + 0.18 * day + 0.06 * smoothNoise(seed, tSec, 4 * HOUR_S), 0.55, 1) };
    }
    case "peaker": {
      const L = clamp(0.88 + 0.08 * smoothNoise(asset.seed, tSec, 2 * HOUR_S), 0.7, 1);
      if (asset.schedule === "day") return { r: scheduleRamp(h, 6, 22, 0.5), L };
      if (asset.schedule === "evening") return { r: scheduleRamp(h, 16, 22, 0.5), L };
      return { r: 1, L: clamp(0.6 + 0.1 * smoothNoise(seed, tSec, 4 * HOUR_S), 0.4, 1) };
    }
    case "baseload":
      return {
        r: 1,
        L: clamp(0.88 + 0.07 * smoothNoise(seed, tSec, 6 * HOUR_S) + 0.03 * smoothNoise(asset.seed, tSec, HOUR_S), 0.75, 1),
      };
  }
}

// ─── Solar ───────────────────────────────────────────────────────────────────
//
// A simple PV model, the same idea real plants use for "expected power":
//
//   DC power = DC rating × (sunlight on the panels ÷ 1000 W/m²) × temperature factor × (1 − soiling)
//   AC power = min(AC rating, DC power × inverter efficiency)          ← the min is "clipping"
//
// Panels lose about 0.4% of their output for every °C above 25 °C, and in full sun they run
// about 30 °C hotter than the air. Arrays have more DC capacity than the inverter can pass
// (here 1.3×), so around clear noons the inverter tops out and the extra is "clipped".

export const DC_AC_RATIO = 1.3;
export const TEMP_COEFF_PER_C = -0.004;
export const INVERTER_EFFICIENCY = 0.982;
/** Sunlight on the tilted panels at clear-sky noon, W/m² (they catch more than flat ground). */
const POA_PEAK = 1080;

/** Plane-of-array irradiance: sunlight on the tilted panels, W/m². */
export function poa(world: World, siteId: string, t: number): number {
  return POA_PEAK * irradiance(world, siteId, t);
}

/** Back-of-module temperature, °C. */
export function moduleTempC(world: World, siteId: string, t: number): number {
  return ambientC(world, siteId, t) + 0.028 * poa(world, siteId, t);
}

/**
 * Dust on the panels, as a loss in %. It builds up at a steady rate per site (deserts fastest)
 * and is washed off on a regular cycle (cleaning crews, or rain), so it's a saw-tooth.
 */
const SOILING: Record<string, { ratePctPerDay: number; cycleDays: number }> = {
  PCS: { ratePctPerDay: 0.1, cycleDays: 50 },
  SPV: { ratePctPerDay: 0.3, cycleDays: 36 },
  WSS: { ratePctPerDay: 0.25, cycleDays: 40 },
};
const SOILING_DEFAULT = { ratePctPerDay: 0.15, cycleDays: 45 };

export interface SoilingState {
  pct: number;
  ratePctPerDay: number;
  /** When the panels were last cleaned (ms). */
  lastCleaned: number;
}

export function soilingState(world: World, siteId: string, t: number): SoilingState {
  const { ratePctPerDay, cycleDays } = SOILING[siteId] ?? SOILING_DEFAULT;
  const seed = world.sites.get(siteId)?.seed ?? 0;
  const phase = hashNoise(seed ^ 0x5011, 0) * cycleDays;
  const days = t / DAY - phase;
  const since = ((days % cycleDays) + cycleDays) % cycleDays;
  return { pct: 0.3 + ratePctPerDay * since, ratePctPerDay, lastCleaned: t - since * DAY };
}

/** The steps from sunlight to one inverter's AC output at time t, kW (no faults, no noise). */
export function pvBreakdown(world: World, asset: AssetRecord, t: number) {
  const acRated = asset.tags.find((x) => x.template.name === "AC_POWER")?.base ?? 0;
  const dcRated = acRated * DC_AC_RATIO;
  const site = asset.data.siteId;
  const sun = dcRated * (poa(world, site, t) / 1000);
  const afterTemp = sun * (1 + TEMP_COEFF_PER_C * (moduleTempC(world, site, t) - 25));
  const dc = afterTemp * (1 - soilingState(world, site, t).pct / 100);
  const beforeClip = dc * INVERTER_EFFICIENCY;
  const ac = Math.min(acRated, beforeClip);
  return { acRated, dcRated, sun, afterTemp, dc, beforeClip, ac };
}

function solarSource(world: World, tag: TagRecord, t: number, source: NonNullable<TagTemplate["source"]>): number {
  const site = tag.asset.data.siteId;
  switch (source) {
    case "pv_ac":
      return pvBreakdown(world, tag.asset, t).ac;
    case "pv_dc": {
      // When clipping, the inverter moves off its best operating point and takes less DC.
      const b = pvBreakdown(world, tag.asset, t);
      return Math.min(b.dc, b.acRated / INVERTER_EFFICIENCY);
    }
    case "module_t":
      return moduleTempC(world, site, t);
    case "soiling":
      return soilingState(world, site, t).pct;
    default:
      return 0;
  }
}

const childrenCache = new WeakMap<World, Map<string, AssetRecord[]>>();

/** Assets whose parent is this asset (an inverter's strings). */
export function childrenOf(world: World, assetId: string): readonly AssetRecord[] {
  let map = childrenCache.get(world);
  if (!map) {
    map = new Map();
    for (const a of world.assets.values()) {
      if (!a.data.parentAssetId) continue;
      const list = map.get(a.data.parentAssetId) ?? [];
      list.push(a);
      map.set(a.data.parentAssetId, list);
    }
    childrenCache.set(world, map);
  }
  return map.get(assetId) ?? [];
}

/** Share of an inverter's output lost to faults on the strings feeding it (0–1). */
export function stringLoss(world: World, inverter: AssetRecord, t: number): number {
  const strings = childrenOf(world, inverter.data.id);
  if (strings.length === 0) return 0;
  let lost = 0;
  for (const s of strings) {
    for (const f of world.faultsOf(s.data.id)) {
      const p = progress(f, t);
      if (p === 0) continue;
      for (const e of f.type.effects) if (e.tag === "POWER") lost += (e.atFailure ?? 0.2) * p * p;
    }
  }
  return Math.min(1, lost / strings.length);
}

// ─── Tag values ──────────────────────────────────────────────────────────────

/**
 * What a healthy asset's tag should read at time t, given its load and the air temperature:
 * the model without noise or faults. It's the "ambient-corrected baseline" that real plants
 * build by fitting clean history; here we know the true model, so we use it directly.
 * `planned` ignores trips (what the asset was meant to be doing).
 */
export function expectedValue(world: World, tag: TagRecord, t: number, planned = false): number {
  return modelValue(world, tag, t, operating(world, tag.asset, t, planned));
}

function modelValue(world: World, tag: TagRecord, t: number, { r, L }: Operating): number {
  const asset = tag.asset;
  const tpl = tag.template;
  // Power from the PV model stops when the inverter does; temperatures and soiling don't.
  if (tpl.source === "pv_ac" || tpl.source === "pv_dc") return r * solarSource(world, tag, t, tpl.source);
  if (tpl.source === "module_t" || tpl.source === "soiling") return solarSource(world, tag, t, tpl.source);
  const loadShare = tpl.load ?? 0;
  const running = tag.base * (1 - loadShare + loadShare * L);
  const idle = tpl.idle === "ambient" ? ambientC(world, asset.data.siteId, t) : tpl.idle === "hold" ? running : (tpl.idle ?? 0);
  // Air temperature shifts a running machine's value (a hot day cuts a gas turbine's output);
  // a stopped one with a fixed idle value (power = 0) stays at it.
  const fixedIdle = tpl.idle === undefined || typeof tpl.idle === "number";
  return idle + (running - idle) * r + (fixedIdle ? r : 1) * tag.base * (tpl.ambient ?? 0) * ambientNorm(world, asset.data.siteId, t);
}

/** The value of a tag at time t, or null when there is no data (offline asset, chaos gap). */
export function tagValue(world: World, chaos: ChaosWindows, tag: TagRecord, t: number): Reading | null {
  const asset = tag.asset;
  if (asset.staticStatus === "offline") return null;

  const tSec = Math.floor(t / 1000);
  const chaotic = chaos.activeAt(t);
  if (chaotic && hashNoise(tag.seed ^ 0xc4a05, Math.floor(tSec / 300)) < 0.03) return null;

  const tpl = tag.template;
  const scaleAbs = Math.abs(tag.base);
  let value: number;

  if (tpl.source === "ambient") {
    value = ambientC(world, asset.data.siteId, t) + 0.1 * gaussNoise(tag.seed, tSec);
  } else if (tag.flatline) {
    return { value: tag.base, quality: "uncertain" };
  } else {
    const op = operating(world, asset, t);
    const { r } = op;
    value = modelValue(world, tag, t, op);
    // A stopped machine with a fixed idle value (power = 0) reads flat; only running signals are noisy.
    const flatWhenIdle = tpl.idle === undefined || typeof tpl.idle === "number";
    const noiseScale = scaleAbs * (flatWhenIdle ? r : 1);
    const noise = tpl.noise ?? 0.01;
    value += noiseScale * noise * gaussNoise(tag.seed, tSec);
    value += noiseScale * (tpl.wander ?? 0.3 * noise) * smoothNoise(tag.seed + 1, tSec, 6 * HOUR_S);
    value += faultOffset(tag, world.faultsOf(asset.data.id), t);
    // An inverter makes less when strings feeding it are underperforming.
    if (tpl.source === "pv_ac" || tpl.source === "pv_dc") value -= modelValue(world, tag, t, op) * stringLoss(world, asset, t);
  }

  let quality: DataQuality = "good";
  if (chaotic && hashNoise(tag.seed ^ 0xbad, Math.floor(tSec / 300)) < 0.04) {
    quality = "bad";
    value += scaleAbs * 0.3 * gaussNoise(tag.seed ^ 0xbad, tSec);
  }

  value = Math.max(0, value);
  if (tpl.quantity === "percent") value = Math.min(100, value);
  return { value: Number(value.toPrecision(6)), quality };
}

const QUALITY_RANK: Record<DataQuality, number> = { good: 0, uncertain: 1, bad: 2 };

/**
 * Aggregated history: for each interval, average / min / max of a few samples inside it.
 * Intervals start on multiples of the interval and end before `to` (or `now`), so there
 * are never more points than ceil(range / interval).
 */
export function tagHistory(
  world: World,
  chaos: ChaosWindows,
  tag: TagRecord,
  from: number,
  to: number,
  intervalSeconds: number,
  now: number,
): HistoryPoint[] {
  const step = intervalSeconds * 1000;
  const end = Math.min(to, now);
  const samples = Math.min(6, Math.max(1, intervalSeconds));
  const points: HistoryPoint[] = [];

  for (let start = Math.ceil(from / step) * step; start < end; start += step) {
    let sum = 0;
    let count = 0;
    let min = Infinity;
    let max = -Infinity;
    let worst: DataQuality = "good";
    for (let j = 0; j < samples; j++) {
      const ts = start + ((j + 0.5) * step) / samples;
      if (ts > now) break;
      const reading = tagValue(world, chaos, tag, ts);
      if (!reading) continue;
      sum += reading.value;
      count++;
      min = Math.min(min, reading.value);
      max = Math.max(max, reading.value);
      if (QUALITY_RANK[reading.quality] > QUALITY_RANK[worst]) worst = reading.quality;
    }
    if (count === 0) continue;
    points.push({
      t: iso(start),
      avg: Number((sum / count).toPrecision(6)),
      min,
      max,
      quality: worst,
    });
  }
  return points;
}
