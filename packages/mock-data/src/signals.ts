/**
 * Produces the value of any tag at any moment — past, present or (not used) future —
 * without storing history. Every value is a pure function of (seed, tag, time), so a
 * chart of last month and a live reading now always agree.
 */
import type { DataQuality, HistoryPoint } from "@pdm/contracts";
import { iso } from "./clock";
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

export function operating(world: World, asset: AssetRecord, t: number): Operating {
  if (asset.staticStatus === "maintenance" || asset.staticStatus === "standby") return { r: 0, L: 0 };
  if (world.faultsOf(asset.data.id).some((f) => progress(f, t) >= 1)) return { r: 0, L: 0 }; // tripped

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

// ─── Tag values ──────────────────────────────────────────────────────────────

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
    const { r, L } = operating(world, asset, t);
    const loadShare = tpl.load ?? 0;
    const running = tag.base * (1 - loadShare + loadShare * L);
    const idle = tpl.idle === "ambient" ? ambientC(world, asset.data.siteId, t) : tpl.idle === "hold" ? running : (tpl.idle ?? 0);
    value = idle + (running - idle) * r;

    value += tag.base * (tpl.ambient ?? 0) * ambientNorm(world, asset.data.siteId, t);
    // A stopped machine with a fixed idle value (power = 0) reads flat; only running signals are noisy.
    const flatWhenIdle = tpl.idle === undefined || typeof tpl.idle === "number";
    const noiseScale = scaleAbs * (flatWhenIdle ? r : 1);
    const noise = tpl.noise ?? 0.01;
    value += noiseScale * noise * gaussNoise(tag.seed, tSec);
    value += noiseScale * (tpl.wander ?? 0.3 * noise) * smoothNoise(tag.seed + 1, tSec, 6 * HOUR_S);
    value += faultOffset(tag, world.faultsOf(asset.data.id), t);
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
