/**
 * A snapshot = everything derived for one moment: each asset's health, status and RUL,
 * the active predictions, risk scores, and the worst health under every hierarchy node.
 * Recomputed at most once per simulated second.
 */
import {
  ENTERPRISE_SCOPE,
  type Asset,
  type AssetHealth,
  type HealthState,
  type OperatingStatus,
  type Prediction,
  type PredictionFeedback,
  type PredictionStatus,
  type RulEstimate,
} from "@pdm/contracts";
import { DAY, HOUR, iso } from "./clock";
import { DETECTION_PROGRESS, progress, rawProgress, timeAtProgress } from "./faults";
import type { AssetRecord, Fault } from "./model";
import { operating } from "./signals";
import { round, type World } from "./world";

/** Changes people make to predictions (feedback, linking a work order). */
export interface PredictionOverlay {
  status?: PredictionStatus;
  feedback?: PredictionFeedback;
  workOrderId?: string;
}

export interface Condition {
  health: AssetHealth;
  status: OperatingStatus;
  rul: RulEstimate | null;
  /** Probability used for the risk ranking. */
  probability: number;
  riskScore: number;
  topPrediction: Prediction | null;
}

export interface Snapshot {
  t: number;
  conditions: Map<string, Condition>;
  /** Open and recently closed predictions, newest first. */
  predictions: Prediction[];
  predictionById: Map<string, Prediction>;
  nodeHealth: Map<string, HealthState>;
}

const SEVERITY: Record<HealthState, number> = {
  healthy: 0, watch: 1, degraded: 2, warning: 3, critical: 4, offline: -1, maintenance: -1,
};

export function healthState(score: number): HealthState {
  if (score >= 85) return "healthy";
  if (score >= 70) return "watch";
  if (score >= 50) return "degraded";
  if (score >= 30) return "warning";
  return "critical";
}

export function predictionId(fault: Fault): string {
  return `PRED-${fault.id.slice(2)}`;
}

/** Keep closed predictions visible this long after the repair. */
const CLOSED_PREDICTION_RETENTION = 30 * DAY;

export function buildPrediction(fault: Fault, t: number, overlay: PredictionOverlay | undefined): Prediction | null {
  const resolved = fault.resolvedAt !== null && fault.resolvedAt <= t;
  const effectiveT = resolved ? (fault.resolvedAt as number) : t;
  const p = rawProgress(fault, effectiveT);
  if (p < DETECTION_PROGRESS) return null;
  if (resolved && t - effectiveT > CLOSED_PREDICTION_RETENTION) return null;

  const asset = fault.asset;
  const remainingDays = Math.max(0, (fault.failAt - effectiveT) / DAY);
  const horizonDays = remainingDays <= 7 ? 7 : remainingDays <= 30 ? 30 : 90;
  const flags = fault.dataQuality ? [fault.dataQuality] : [];
  const p50 = Math.max(0.5, remainingDays * (1 + fault.rulBias));
  const updatedAt = Math.floor(effectiveT / HOUR) * HOUR;

  const effects = fault.type.effects.filter((e) => asset.tags.some((tag) => tag.template.name === e.tag));
  const rawWeights = effects.map((_, i) => 1 / (i + 1));
  const totalWeight = rawWeights.reduce((a, b) => a + b, 0);
  const failureCost = Math.round(asset.info.failureCost * (0.5 + 0.5 * asset.scale));

  return {
    id: predictionId(fault),
    assetId: asset.data.id,
    failureMode: fault.type.failureMode,
    probability: round(Math.min(0.97, Math.max(0.05, 0.25 + 0.7 * p ** 1.3)), 2),
    horizonDays,
    confidence: round(Math.min(0.95, Math.max(0.3, 0.55 + 0.4 * p - 0.12 * flags.length)), 2),
    detectedAt: iso(timeAtProgress(fault, DETECTION_PROGRESS)),
    updatedAt: iso(updatedAt),
    status: overlay?.status ?? (resolved ? "closed" : "open"),
    modelId: `${asset.data.assetClass}-health`,
    modelVersion: "2.4.1",
    rul: {
      p10Days: round(p50 * 0.65, 1),
      p50Days: round(p50, 1),
      p90Days: round(p50 * 1.45, 1),
      estimatedAt: iso(updatedAt),
    },
    contributions: effects.map((e, i) => {
      const tag = asset.tags.find((tg) => tg.template.name === e.tag);
      return {
        tagId: `${asset.data.id}.${e.tag}`,
        label: tag?.template.description ?? e.tag,
        weight: round((rawWeights[i] ?? 0) / totalWeight, 2),
      };
    }),
    dataQuality: flags,
    evidenceTagIds: effects.slice(0, 5).map((e) => `${asset.data.id}.${e.tag}`),
    recommendedAction: {
      summary: fault.type.action,
      actBy: iso(effectiveT + Math.max(1, remainingDays * 0.5) * DAY),
      interventionCost: { amount: Math.round(failureCost * fault.type.interventionFraction), currency: "USD" },
      failureCost: { amount: failureCost, currency: "USD" },
    },
    feedback: overlay?.feedback ?? null,
    workOrderId: overlay?.workOrderId ?? null,
  };
}

function condition(world: World, asset: AssetRecord, t: number, predictions: Prediction[]): Condition {
  const faults = world.faultsOf(asset.data.id);
  const maxP = faults.reduce((m, f) => Math.max(m, progress(f, t)), 0);
  const score = round(Math.min(100, Math.max(0, 100 - asset.baseWear - 90 * maxP ** 1.5)), 1);

  let state = healthState(score);
  if (asset.staticStatus === "offline") state = "offline";
  else if (asset.staticStatus === "maintenance") state = "maintenance";

  let status: OperatingStatus;
  if (asset.staticStatus === "maintenance") status = "maintenance";
  else if (asset.staticStatus === "standby") status = "standby";
  else if (maxP >= 1) status = "tripped";
  else status = operating(world, asset, t).r < 0.05 ? "stopped" : "running";

  const open = predictions.filter((p) => p.status !== "closed" && p.status !== "dismissed");
  const top = open.sort((a, b) => b.probability - a.probability)[0] ?? null;

  let rul: RulEstimate | null = top?.rul ?? null;
  if (!rul && asset.rulBaseDays !== null) {
    const p50 = asset.rulBaseDays;
    rul = { p10Days: round(p50 * 0.6, 0), p50Days: p50, p90Days: round(p50 * 1.6, 0), estimatedAt: iso(Math.floor(t / DAY) * DAY) };
  }

  const probability = top?.probability ?? round(((100 - score) / 100) * 0.08, 3);
  return {
    health: { score, state, updatedAt: iso(t) },
    status,
    rul,
    probability,
    riskScore: round(probability * asset.data.criticality, 3),
    topPrediction: top,
  };
}

export function buildSnapshot(world: World, t: number, overlays: ReadonlyMap<string, PredictionOverlay>): Snapshot {
  const byAsset = new Map<string, Prediction[]>();
  const predictions: Prediction[] = [];
  for (const fault of world.faults) {
    const prediction = buildPrediction(fault, t, overlays.get(predictionId(fault)));
    if (!prediction) continue;
    predictions.push(prediction);
    const list = byAsset.get(prediction.assetId) ?? [];
    list.push(prediction);
    byAsset.set(prediction.assetId, list);
  }
  predictions.sort((a, b) => b.detectedAt.localeCompare(a.detectedAt));

  const conditions = new Map<string, Condition>();
  const worst = new Map<string, number>();
  const anyOffline = new Set<string>();
  for (const asset of world.assets.values()) {
    const c = condition(world, asset, t, byAsset.get(asset.data.id) ?? []);
    conditions.set(asset.data.id, c);
    const severity = SEVERITY[c.health.state];
    for (const scopeId of asset.scopeIds) {
      if (severity < 0) anyOffline.add(scopeId);
      else worst.set(scopeId, Math.max(worst.get(scopeId) ?? 0, severity));
    }
  }

  const order: HealthState[] = ["healthy", "watch", "degraded", "warning", "critical"];
  const nodeHealth = new Map<string, HealthState>();
  for (const id of world.nodes.keys()) {
    const sev = worst.get(id);
    if (sev !== undefined) nodeHealth.set(id, order[sev] ?? "healthy");
    else {
      const asset = world.assets.get(id);
      nodeHealth.set(id, asset ? (conditions.get(id)?.health.state ?? "offline") : anyOffline.has(id) ? "offline" : "healthy");
    }
  }
  nodeHealth.set(ENTERPRISE_SCOPE, nodeHealth.get(ENTERPRISE_SCOPE) ?? "healthy");

  return {
    t,
    conditions,
    predictions,
    predictionById: new Map(predictions.map((p) => [p.id, p])),
    nodeHealth,
  };
}

export function toAsset(asset: AssetRecord, c: Condition): Asset {
  return { ...asset.data, health: c.health, rul: c.rul, operatingStatus: c.status };
}
