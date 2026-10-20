/**
 * Command Center KPIs for any scope. Counts come straight from the simulation;
 * figures that would need years of history (MTBF, MTTR, OEE, PM compliance) are seeded
 * per scope so they stay stable and plausible.
 */
import type { Kpi, KpiKey, KpiResponse } from "@pdm/contracts";
import type { AlarmEngine } from "./alarms";
import { DAY, iso } from "./clock";
import type { AssetRecord } from "./model";
import { hashNoise, hashString, smoothNoise } from "./random";
import type { Snapshot } from "./snapshot";
import { OPEN_STATUSES, type WorkOrderStore } from "./work-orders";
import { round } from "./world";

/** Downtime cost per hour by business line, USD — for "avoided downtime" value. */
const DOWNTIME_COST_PER_HOUR = { oil_gas: 18_000, gas_to_power: 12_000, solar: 900 } as const;

interface KpiInput {
  scopeId: string;
  assets: readonly AssetRecord[];
  snapshot: Snapshot;
  alarms: AlarmEngine;
  workOrders: WorkOrderStore;
  now: number;
}

export function computeKpis(input: KpiInput, keys?: readonly KpiKey[]): KpiResponse {
  const { scopeId, assets, snapshot, alarms, workOrders, now } = input;
  const seed = hashString(`kpi:${scopeId}`);
  const ids = new Set(assets.map((a) => a.data.id));
  const conditions = assets.map((a) => snapshot.conditions.get(a.data.id)).filter((c) => c !== undefined);
  const lineage = (what: string) => `${what} — ${assets.length.toLocaleString("en-US")} assets in scope`;

  // Health: criticality-weighted average score of assets that report data.
  let weighted = 0;
  let weights = 0;
  assets.forEach((a) => {
    const c = snapshot.conditions.get(a.data.id);
    if (!c || c.health.state === "offline") return;
    weighted += c.health.score * a.data.criticality;
    weights += a.data.criticality;
  });
  const health = weights > 0 ? weighted / weights : null;

  const unavailable = conditions.filter((c) => c.status === "tripped" || c.status === "maintenance").length;
  const availability = assets.length > 0 ? 100 * (1 - unavailable / assets.length) : null;

  const openPredictions = snapshot.predictions.filter((p) => ids.has(p.assetId) && p.status !== "closed" && p.status !== "dismissed");
  const likelyWithin = (days: number) => openPredictions.filter((p) => p.probability >= 0.5 && (p.rul?.p50Days ?? Infinity) <= days).length;

  const summary = alarms.summary(scopeId, now);
  const scopedOrders = workOrders.all().filter((o) => ids.has(o.assetId));
  const backlog = scopedOrders.filter((o) => OPEN_STATUSES.includes(o.status)).length;
  const recent = scopedOrders.filter((o) => now - Date.parse(o.createdAt) < 90 * DAY && o.status !== "cancelled");
  const planned = recent.filter((o) => o.type !== "corrective").length;

  // Value delivered: completed predictive work avoided an estimated 24–120 h of downtime each.
  let avoidedHours = 0;
  let avoidedCost = 0;
  for (const o of scopedOrders) {
    if (o.type !== "predictive" || !["completed", "verified", "closed"].includes(o.status)) continue;
    const asset = assets.find((a) => a.data.id === o.assetId);
    if (!asset) continue;
    const hours = 24 + hashNoise(seed, hashString(o.id)) * 96;
    avoidedHours += hours;
    avoidedCost += hours * DOWNTIME_COST_PER_HOUR[asset.data.businessLine];
  }

  const seeded = (n: number, lo: number, hi: number) => lo + hashNoise(seed, n) * (hi - lo);

  const all: Record<KpiKey, Omit<Kpi, "trend" | "changePct" | "updatedAt" | "key">> = {
    enterprise_health: {
      value: health === null ? null : round(health, 1),
      format: "score",
      currency: null,
      target: 85,
      higherIsBetter: true,
      lineage: lineage("Criticality-weighted average of asset health scores"),
    },
    availability: {
      value: availability === null ? null : round(availability, 2),
      format: "percent",
      currency: null,
      target: 97,
      higherIsBetter: true,
      lineage: lineage("Share of assets not tripped or in maintenance"),
    },
    mtbf: {
      value: round(seeded(1, 4200, 9800), 0),
      format: "hours",
      currency: null,
      target: null,
      higherIsBetter: true,
      lineage: lineage("Mean time between failures, trailing 12 months"),
    },
    mttr: {
      value: round(seeded(2, 7, 21), 1),
      format: "hours",
      currency: null,
      target: 12,
      higherIsBetter: false,
      lineage: lineage("Mean time to repair, trailing 12 months"),
    },
    oee: {
      value: round(seeded(3, 78, 88), 1),
      format: "percent",
      currency: null,
      target: 85,
      higherIsBetter: true,
      lineage: lineage("Availability × performance × quality, trailing 30 days"),
    },
    forecast_failures_7d: {
      value: likelyWithin(7),
      format: "count",
      currency: null,
      target: null,
      higherIsBetter: false,
      lineage: lineage("Open predictions ≥ 50% probability with median RUL ≤ 7 days"),
    },
    forecast_failures_30d: {
      value: likelyWithin(30),
      format: "count",
      currency: null,
      target: null,
      higherIsBetter: false,
      lineage: lineage("Open predictions ≥ 50% probability with median RUL ≤ 30 days"),
    },
    forecast_failures_90d: {
      value: likelyWithin(90),
      format: "count",
      currency: null,
      target: null,
      higherIsBetter: false,
      lineage: lineage("Open predictions ≥ 50% probability with median RUL ≤ 90 days"),
    },
    open_critical_alarms: {
      value: summary.active.p1 + summary.active.p2,
      format: "count",
      currency: null,
      target: 0,
      higherIsBetter: false,
      lineage: lineage("Active P1 + P2 alarms"),
    },
    maintenance_backlog: {
      value: backlog,
      format: "count",
      currency: null,
      target: null,
      higherIsBetter: false,
      lineage: lineage("Open work orders (requested → in progress)"),
    },
    pm_compliance: {
      value: round(seeded(4, 86, 97), 1),
      format: "percent",
      currency: null,
      target: 95,
      higherIsBetter: true,
      lineage: lineage("Preventive work completed within its window, trailing 90 days"),
    },
    avoided_downtime_hours: {
      value: round(avoidedHours, 0),
      format: "hours",
      currency: null,
      target: null,
      higherIsBetter: true,
      lineage: lineage("Estimated downtime avoided by completed predictive work"),
    },
    avoided_downtime_cost: {
      value: round(avoidedCost, 0),
      format: "currency",
      currency: "USD",
      target: null,
      higherIsBetter: true,
      lineage: lineage("Avoided downtime × cost of downtime per business line"),
    },
    planned_maintenance_ratio: {
      value: recent.length > 0 ? round((100 * planned) / recent.length, 1) : null,
      format: "percent",
      currency: null,
      target: 80,
      higherIsBetter: true,
      lineage: lineage("Planned share of work orders, trailing 90 days"),
    },
  };

  const wanted = keys ?? (Object.keys(all) as KpiKey[]);
  return {
    scopeId,
    kpis: wanted.map((key, index) => {
      const base = all[key];
      const trend = base.value === null ? [] : trendFor(seed + index, base.value, base.format === "count", now);
      const first = trend[0];
      return {
        key,
        ...base,
        trend,
        changePct: base.value !== null && first ? round((100 * (base.value - first)) / first, 1) : null,
        updatedAt: iso(now),
      };
    }),
  };
}

/** 30 daily points that wander and end at today's value, for the sparkline. */
function trendFor(seed: number, value: number, whole: boolean, now: number): number[] {
  const today = Math.floor(now / DAY);
  const points: number[] = [];
  for (let d = 29; d >= 0; d--) {
    const wobble = d === 0 ? 0 : 0.06 * smoothNoise(seed, today - d, 5) * (d / 29);
    const v = value * (1 + wobble);
    points.push(whole ? Math.round(v) : round(v, 2));
  }
  return points;
}
