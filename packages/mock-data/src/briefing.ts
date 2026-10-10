/**
 * The "scripted" AI provider (ADR-0010): builds the daily briefing from the simulation's
 * own data with templates. Every sentence cites the records it was built from.
 */
import type { Briefing, BriefingItem, Prediction } from "@pdm/contracts";
import type { AlarmEngine } from "./alarms";
import { iso } from "./clock";
import type { AssetRecord } from "./model";
import { buildSnapshot, type PredictionOverlay, type Snapshot } from "./snapshot";
import type { World } from "./world";

const PERIOD_HOURS = 24;
const usd = (n: number) => `$${Math.round(n / 1000).toLocaleString("en-US")}k`;

interface BriefingInput {
  world: World;
  scopeId: string;
  assets: readonly AssetRecord[];
  snapshot: Snapshot;
  overlays: ReadonlyMap<string, PredictionOverlay>;
  alarms: AlarmEngine;
  now: number;
}

export function scriptedBriefing(input: BriefingInput): Briefing {
  const { world, scopeId, assets, snapshot, overlays, alarms, now } = input;
  const ids = new Set(assets.map((a) => a.data.id));
  const since = now - PERIOD_HOURS * 3_600_000;
  const name = (assetId: string) => world.assets.get(assetId)?.data.name ?? assetId;
  const open = snapshot.predictions.filter((p) => ids.has(p.assetId) && p.status !== "closed" && p.status !== "dismissed");

  // What changed
  const changed: BriefingItem[] = [];
  for (const p of open.filter((p) => Date.parse(p.detectedAt) >= since).slice(0, 3)) {
    changed.push({
      text: `New prediction: ${p.failureMode.label.toLowerCase()} on ${name(p.assetId)} (${Math.round(p.probability * 100)}% within ${p.horizonDays} days).`,
      severity: p.probability >= 0.7 ? "warning" : "degraded",
      citations: [{ kind: "prediction", id: p.id, label: p.id }, { kind: "asset", id: p.assetId, label: p.assetId }],
    });
  }
  const before = buildSnapshot(world, since, overlays);
  const worsened = assets
    .map((a) => ({ a, then: before.conditions.get(a.data.id), nowC: snapshot.conditions.get(a.data.id) }))
    .filter(({ then, nowC }) => then && nowC && nowC.health.score < then.health.score - 3)
    .sort((x, y) => (x.nowC?.health.score ?? 0) - (y.nowC?.health.score ?? 0))
    .slice(0, 2);
  for (const { a, then, nowC } of worsened) {
    changed.push({
      text: `${a.data.name} health fell from ${then?.health.score.toFixed(0)} to ${nowC?.health.score.toFixed(0)}.`,
      severity: nowC?.health.state ?? null,
      citations: [{ kind: "asset", id: a.data.id, label: a.data.id }],
    });
  }
  const newCritical = alarms
    .all()
    .filter((al) => ids.has(al.assetId) && (al.priority === "p1" || al.priority === "p2") && Date.parse(al.raisedAt) >= since);
  if (newCritical.length > 0) {
    changed.push({
      text: `${newCritical.length} high-priority alarm${newCritical.length === 1 ? "" : "s"} (P1/P2) raised in the last ${PERIOD_HOURS} hours.`,
      severity: newCritical.some((al) => al.priority === "p1") ? "critical" : "warning",
      citations: newCritical.slice(0, 3).map((al) => ({ kind: "alarm" as const, id: al.id, label: al.id })),
    });
  }

  // Needs attention: top risks
  const ranked = [...assets]
    .map((a) => ({ a, c: snapshot.conditions.get(a.data.id) }))
    .filter((x) => x.c !== undefined)
    .sort((x, y) => (y.c?.riskScore ?? 0) - (x.c?.riskScore ?? 0))
    .slice(0, 3);
  const attention: BriefingItem[] = ranked.map(({ a, c }) => ({
    text: c?.topPrediction
      ? `${a.data.name}: ${c.topPrediction.failureMode.label.toLowerCase()}, median ${c.topPrediction.rul?.p50Days.toFixed(0)} days remaining, criticality ${a.data.criticality}/5.`
      : `${a.data.name}: health ${c?.health.score.toFixed(0)}, criticality ${a.data.criticality}/5.`,
    severity: c?.health.state ?? null,
    citations: [
      { kind: "asset", id: a.data.id, label: a.data.id },
      ...(c?.topPrediction ? [{ kind: "prediction" as const, id: c.topPrediction.id, label: c.topPrediction.id }] : []),
    ],
  }));

  // Recommended actions: biggest cost-of-failure exposure without a work order yet
  const actions: BriefingItem[] = open
    .filter((p) => !p.workOrderId)
    .sort((x, y) => exposure(y) - exposure(x))
    .slice(0, 3)
    .map((p) => ({
      text: `${p.recommendedAction.summary} on ${name(p.assetId)} by ${p.recommendedAction.actBy.slice(0, 10)} — ${usd(p.recommendedAction.interventionCost.amount)} now vs ${usd(p.recommendedAction.failureCost.amount)} if it fails.`,
      severity: p.probability >= 0.7 ? "warning" : "degraded",
      citations: [{ kind: "prediction", id: p.id, label: p.id }],
    }));

  const fallback = (text: string): BriefingItem[] => [
    { text, severity: "healthy", citations: [{ kind: "kpi", id: "enterprise_health", label: "Health score" }] },
  ];

  return {
    scopeId,
    generatedAt: iso(now),
    periodHours: PERIOD_HOURS,
    generatedBy: "scripted",
    sections: [
      { key: "what_changed", items: changed.length > 0 ? changed : fallback("No significant changes in the last 24 hours.") },
      { key: "needs_attention", items: attention.length > 0 ? attention : fallback("Nothing in this scope needs attention.") },
      { key: "recommended_actions", items: actions.length > 0 ? actions : fallback("All open predictions already have work orders.") },
    ],
  };
}

function exposure(p: Prediction): number {
  return p.probability * p.recommendedAction.failureCost.amount;
}
