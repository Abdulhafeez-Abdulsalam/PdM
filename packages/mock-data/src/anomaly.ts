/**
 * Anomaly score for an asset at any moment. Healthy equipment hovers around 0.08; a developing
 * fault pushes it up in step with the fault's progress. It is tuned so the score crosses the
 * threshold (0.5) exactly when the model raises its prediction (progress 0.3) — the chart and
 * the prediction tell the same story.
 */
import type { AnomalyPoint } from "@pdm/contracts";
import { iso } from "./clock";
import { DETECTION_PROGRESS, progress } from "./faults";
import type { AssetRecord } from "./model";
import { gaussNoise, smoothNoise } from "./random";
import type { World } from "./world";

export const ANOMALY_THRESHOLD = 0.5;
const BASELINE = 0.08;
/** Slope chosen so BASELINE + SLOPE × DETECTION_PROGRESS = threshold. */
const SLOPE = (ANOMALY_THRESHOLD - BASELINE) / DETECTION_PROGRESS;

export function anomalyScore(world: World, asset: AssetRecord, t: number): number | null {
  if (asset.staticStatus === "offline") return null;
  const p = world.faultsOf(asset.data.id).reduce((m, f) => Math.max(m, progress(f, t)), 0);
  const tSec = Math.floor(t / 1000);
  const wobble = 0.035 * smoothNoise(asset.seed + 9, tSec, 2 * 3600) + 0.012 * gaussNoise(asset.seed + 9, Math.floor(tSec / 60));
  return Math.min(1, Math.max(0, BASELINE + SLOPE * p + wobble));
}

export function anomalyHistory(
  world: World,
  asset: AssetRecord,
  from: number,
  to: number,
  intervalSeconds: number,
  now: number,
): AnomalyPoint[] {
  const step = intervalSeconds * 1000;
  const points: AnomalyPoint[] = [];
  for (let t = Math.ceil(from / step) * step; t < Math.min(to, now); t += step) {
    const score = anomalyScore(world, asset, t + step / 2);
    if (score !== null) points.push({ t: iso(t), score: Math.round(score * 1000) / 1000 });
  }
  return points;
}
