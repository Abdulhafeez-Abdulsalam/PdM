/**
 * Anomaly score for an asset at any moment. Healthy equipment hovers around 0.08; a developing
 * fault pushes it up in step with the fault's progress. It is tuned so the score crosses the
 * threshold (0.5) when the model raises its prediction (progress 0.3), so the chart and the
 * prediction tell the same story. The small wobble can push it over a few hours early; the
 * fleet view shows that honestly as "anomalous, no prediction yet".
 */
import { ANOMALY_RISE_PER_DAY, ANOMALY_WATCH_LEVEL, type AnomalyState, type AnomalySummary, type Prediction } from "@pdm/contracts";
import type { AnomalyPoint } from "@pdm/contracts";
import { DAY, HOUR, iso } from "./clock";
import { DETECTION_PROGRESS, progress, timeAtProgress } from "./faults";
import type { AssetRecord } from "./model";
import { gaussNoise, smoothNoise } from "./random";
import { faultContributions } from "./snapshot";
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

const r3 = (x: number | null) => (x === null ? null : Math.round(x * 1000) / 1000);

export function anomalyState(score: number | null, dayAgo: number | null): AnomalyState {
  if (score === null) return "no_data";
  if (score >= ANOMALY_THRESHOLD) return "anomalous";
  if (score >= ANOMALY_WATCH_LEVEL || (dayAgo !== null && score - dayAgo >= ANOMALY_RISE_PER_DAY)) return "rising";
  return "normal";
}

/** The fleet view's row for one asset, now. */
export function anomalySummary(world: World, asset: AssetRecord, now: number, predictions: readonly Prediction[]): AnomalySummary {
  const score = anomalyScore(world, asset, now);
  const scoreDayAgo = anomalyScore(world, asset, now - DAY);
  const state = anomalyState(score, scoreDayAgo);

  // The fault pushing the score hardest (if any).
  const fault = world
    .faultsOf(asset.data.id)
    .filter((f) => progress(f, now) > 0)
    .sort((a, b) => progress(b, now) - progress(a, now))[0];

  // When did it go over? Step back an hour at a time until it was below. Long-running
  // faults went over when they reached the detection point, which can be months ago.
  let aboveSince: string | null = null;
  if (state === "anomalous") {
    const limit = now - 7 * DAY;
    let t = now;
    while (t > limit && (anomalyScore(world, asset, t - HOUR) ?? 0) >= ANOMALY_THRESHOLD) t -= HOUR;
    if (t <= limit && fault) t = Math.min(t, timeAtProgress(fault, DETECTION_PROGRESS));
    aboveSince = iso(Math.floor(t / HOUR) * HOUR);
  }

  // Contribution analysis: that fault's sensors, biggest share first.
  const contributions = fault && (state === "anomalous" || state === "rising") ? faultContributions(fault).slice(0, 5) : [];

  return {
    assetId: asset.data.id,
    assetName: asset.data.name,
    assetClass: asset.data.assetClass,
    siteId: asset.data.siteId,
    state,
    score: r3(score),
    scoreDayAgo: r3(scoreDayAgo),
    threshold: ANOMALY_THRESHOLD,
    aboveSince,
    trend: Array.from({ length: 24 }, (_, i) => r3(anomalyScore(world, asset, now - (23 - i) * HOUR))),
    contributions,
    predictionId: predictions.find((p) => p.assetId === asset.data.id && p.status !== "closed" && p.status !== "dismissed")?.id ?? null,
  };
}
