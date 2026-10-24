/**
 * The 2D digital twin (spec §6.8): one area at one moment in the last 72 hours. Everything is
 * worked out for that moment from the same models as the live screens (health from the faults,
 * values from the signals), so replaying an hour shows exactly what the operators saw then.
 */
import {
  TWIN_REPLAY_HOURS,
  type AssetClass,
  type LimitLevel,
  type TwinArea,
  type TwinAssetState,
  type TwinHour,
  type TwinValue,
} from "@pdm/contracts";
import { HOUR, iso } from "./clock";
import { ApiFailure } from "./errors";
import { progress } from "./faults";
import type { AssetRecord, TagRecord } from "./model";
import { hashNoise, hashString } from "./random";
import { tagValue, type ChaosWindows } from "./signals";
import { condition } from "./snapshot";
import type { World } from "./world";

interface Ctx {
  world: World;
  chaos: ChaosWindows;
  now: number;
}

/** What to show on the drawing, besides the class's first (headline) sensor. */
const TWIN_TAGS: Partial<Record<AssetClass, readonly string[]>> = {
  pipeline_segment: ["WALL_THK", "CORR_RATE", "INLET_P"],
  pv_string: ["PERF_INDEX", "CURRENT"],
  inverter: ["AC_POWER"],
};

const LEVELS: readonly LimitLevel[] = ["normal", "alert", "alarm", "trip"];

/** How far past its limits a reading is: 0 normal, 1 alert, 2 alarm, 3 trip. */
function levelOf(tag: TagRecord, value: number): number {
  const l = tag.tag.limits;
  if ((l.highTrip !== undefined && value >= l.highTrip) || (l.lowTrip !== undefined && value <= l.lowTrip)) return 3;
  if ((l.highAlarm !== undefined && value >= l.highAlarm) || (l.lowAlarm !== undefined && value <= l.lowAlarm)) return 2;
  if ((l.highAlert !== undefined && value >= l.highAlert) || (l.lowAlert !== undefined && value <= l.lowAlert)) return 1;
  return 0;
}

const valueOf = (ctx: Ctx, tag: TagRecord, t: number): TwinValue => ({
  tag: tag.template.name,
  description: tag.template.description,
  quantity: tag.template.quantity,
  value: tagValue(ctx.world, ctx.chaos, tag, t)?.value ?? null,
});

/**
 * The worst level any of the asset's sensors is at, and which sensor. As in the alarm system,
 * limits count only while the machine runs: a stopped engine's oil pressure is low because it's
 * stopped. A machine its fault has tripped is at "trip", on the sensor that fault drove there.
 */
function worstTag(ctx: Ctx, asset: AssetRecord, t: number): { level: number; tag: TagRecord | null; value: number | null } {
  const status = condition(ctx.world, asset, t, []).status;
  if (status === "tripped") {
    const failed = ctx.world.faultsOf(asset.data.id).find((f) => progress(f, t) >= 1);
    const name = failed?.type.effects[0]?.tag;
    const tag = asset.tags.find((x) => x.template.name === name) ?? asset.tags[0]!;
    return { level: 3, tag, value: tagValue(ctx.world, ctx.chaos, tag, t)?.value ?? null };
  }
  let worst = { level: 0, tag: null as TagRecord | null, value: null as number | null };
  if (status !== "running") return worst;
  for (const tag of asset.tags) {
    const reading = tagValue(ctx.world, ctx.chaos, tag, t);
    if (!reading || reading.quality === "bad") continue;
    const level = levelOf(tag, reading.value);
    if (level > worst.level) worst = { level, tag, value: reading.value };
  }
  return worst;
}

/** Pipeline segments run in id order, each 4–9 km long (a fixed length per segment). */
function routeKm(assets: readonly AssetRecord[]): Map<string, [number, number]> {
  const km = new Map<string, [number, number]>();
  let at = 0;
  for (const a of [...assets].filter((x) => x.data.assetClass === "pipeline_segment").sort((x, y) => x.data.id.localeCompare(y.data.id))) {
    const length = Math.round(4 + 5 * hashNoise(hashString(a.data.id), 7));
    km.set(a.data.id, [at, at + length]);
    at += length;
  }
  return km;
}

export function twinArea(ctx: Ctx, areaId: string, hoursAgo = 0): TwinArea {
  const record = ctx.world.nodes.get(areaId);
  if (!record || record.node.level !== "area") throw new ApiFailure("not_found", `Area ${areaId} not found`);
  const siteId = record.node.parentId!;
  const site = ctx.world.sites.get(siteId);
  const assets = ctx.world.scopeAssets(areaId).filter((a) => a.data.areaId === areaId);

  const from = ctx.now - TWIN_REPLAY_HOURS * HOUR;
  const t = Math.max(from, ctx.now - hoursAgo * HOUR);

  const classes = new Set(assets.map((a) => a.data.assetClass));
  const kind = classes.has("pv_string") ? "solar" : classes.has("pipeline_segment") ? "pipeline" : "process";
  const km = routeKm(assets);

  const states: TwinAssetState[] = assets.map((asset) => {
    const c = condition(ctx.world, asset, t, []);
    const worst = worstTag(ctx, asset, t);
    const extra = TWIN_TAGS[asset.data.assetClass] ?? [];
    const shown = [asset.tags[0], ...extra.map((name) => asset.tags.find((tag) => tag.template.name === name))].filter(
      (tag, i, all): tag is TagRecord => tag !== undefined && all.indexOf(tag) === i,
    );
    const range = km.get(asset.data.id);
    return {
      assetId: asset.data.id,
      name: asset.data.name,
      assetClass: asset.data.assetClass,
      parentAssetId: asset.data.parentAssetId,
      health: c.health.state,
      score: c.health.score,
      status: c.status,
      limit: LEVELS[worst.level]!,
      limitTag: worst.tag ? { ...valueOf(ctx, worst.tag, t), value: worst.value } : null,
      values: shown.map((tag) => valueOf(ctx, tag, t)),
      fromKm: range?.[0] ?? null,
      toKm: range?.[1] ?? null,
    };
  });

  // The activity strip under the slider: each hour, the worst level in the area and how many assets were past a limit.
  const hours: TwinHour[] = [];
  for (let h = Math.ceil(from / HOUR) * HOUR; h <= ctx.now; h += HOUR) {
    const sample = Math.min(ctx.now, h + HOUR / 2);
    let worst = 0;
    let count = 0;
    for (const asset of assets) {
      const level = worstTag(ctx, asset, sample).level;
      if (level > 0) count++;
      worst = Math.max(worst, level);
    }
    hours.push({ t: iso(h), worst: LEVELS[worst]!, assets: count });
  }

  return {
    areaId,
    areaName: record.node.name,
    siteId,
    siteName: site?.site.name ?? siteId,
    kind,
    t: iso(t),
    from: iso(from),
    now: iso(ctx.now),
    assets: states,
    hours,
  };
}
