/**
 * Fleet comparison: one class of assets ranked on one measure, with outliers flagged by the
 * modified z-score (see OUTLIER_SCORE in the contracts).
 */
import {
  OUTLIER_SCORE,
  type AssetClass,
  type CompareMeasure,
  type CompareMeasureId,
  type FleetCompareResponse,
  type FleetCompareRow,
} from "@pdm/contracts";
import { anomalyScore } from "./anomaly";
import { ApiFailure } from "./errors";
import type { AssetRecord } from "./model";
import { tagValue, type ChaosWindows } from "./signals";
import type { Snapshot } from "./snapshot";
import type { World } from "./world";

const median = (sorted: readonly number[]): number | null => {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
};

/** Median and MAD of a set of numbers, and a function giving each value's modified z-score. */
export function robustSpread(values: readonly number[]): {
  median: number | null;
  mad: number | null;
  score: (x: number) => number | null;
} {
  const sorted = [...values].sort((a, b) => a - b);
  const m = median(sorted);
  if (m === null) return { median: null, mad: null, score: () => null };
  const mad = median(sorted.map((x) => Math.abs(x - m)).sort((a, b) => a - b))!;
  // When most of the fleet reads exactly the same, MAD is 0 and the score is undefined.
  return { median: m, mad, score: (x) => (mad === 0 ? null : (0.6745 * (x - m)) / mad) };
}

const round = (x: number) => Number(x.toPrecision(4));

export function fleetCompare(input: {
  world: World;
  chaos: ChaosWindows;
  snapshot: Snapshot;
  now: number;
  assetClass: AssetClass;
  measure: CompareMeasureId;
  inScope: (assetId: string) => boolean;
}): FleetCompareResponse {
  const { world, now } = input;
  const all = [...world.assets.values()].filter((a) => input.inScope(a.data.id));

  const counts = new Map<AssetClass, number>();
  for (const a of all) counts.set(a.data.assetClass, (counts.get(a.data.assetClass) ?? 0) + 1);
  const classes = [...counts]
    .filter(([, count]) => count >= 2)
    .map(([assetClass, count]) => ({ assetClass, count }))
    .sort((a, b) => a.assetClass.localeCompare(b.assetClass));

  const fleet = all.filter((a) => a.data.assetClass === input.assetClass);

  // Built-in measures, plus every sensor all assets of the class have.
  const shared =
    fleet.length === 0 ? [] : fleet[0]!.tags.filter((t) => fleet.every((a) => a.tags.some((x) => x.template.name === t.template.name)));
  const measures: CompareMeasure[] = [
    { id: "health", label: "health", quantity: null, worse: "low" },
    { id: "anomaly", label: "anomaly", quantity: null, worse: "high" },
    { id: "rul", label: "rul", quantity: null, worse: "low" },
    ...shared.map((t) => ({
      id: `tag:${t.template.name}`,
      label: t.tag.description,
      quantity: t.tag.quantity,
      worse: t.template.bad ?? null,
    })),
  ];
  const measure = measures.find((m) => m.id === input.measure);
  if (!measure) throw new ApiFailure("bad_request", `${input.assetClass} assets can't be compared on ${input.measure}`);

  const valueOf = (asset: AssetRecord): number | null => {
    const c = input.snapshot.conditions.get(asset.data.id);
    if (measure.id === "health") return c?.health.state === "offline" ? null : (c?.health.score ?? null);
    if (measure.id === "anomaly") return anomalyScore(world, asset, now);
    if (measure.id === "rul") return c?.rul?.p50Days ?? null;
    // Only running equipment is compared on its sensors: a pump on standby reads ~0 vibration,
    // which isn't "better than the fleet", just switched off.
    if (c?.status !== "running") return null;
    const tag = asset.tags.find((t) => `tag:${t.template.name}` === measure.id);
    return tag ? (tagValue(world, input.chaos, tag, now)?.value ?? null) : null;
  };

  const raw = fleet.map((a) => ({ a, value: valueOf(a) }));
  const spread = robustSpread(raw.flatMap((r) => (r.value === null ? [] : [r.value])));
  const items: FleetCompareRow[] = raw.map(({ a, value }) => {
    const deviation = value === null ? null : spread.score(value);
    return {
      assetId: a.data.id,
      assetName: a.data.name,
      siteId: a.data.siteId,
      operatingStatus: input.snapshot.conditions.get(a.data.id)?.status ?? "stopped",
      value: value === null ? null : round(value),
      deviation: deviation === null ? null : Math.round(deviation * 100) / 100,
      outlier: deviation === null || Math.abs(deviation) <= OUTLIER_SCORE ? null : deviation > 0 ? "high" : "low",
    };
  });

  // Worst first; assets with no value last.
  const sign = measure.worse === "low" ? 1 : -1;
  items.sort((x, y) => {
    if (x.value === null || y.value === null) return x.value === null ? (y.value === null ? 0 : 1) : -1;
    return sign * (x.value - y.value) || x.assetId.localeCompare(y.assetId);
  });

  return {
    assetClass: input.assetClass,
    measure,
    measures,
    classes,
    items,
    median: spread.median === null ? null : round(spread.median),
    mad: spread.mad === null ? null : round(spread.mad),
  };
}
