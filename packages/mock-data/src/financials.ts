/**
 * Financials (Phase 4, chunk 5): the money side of everything else, over the last 12 calendar months.
 *
 *   value realised  finished predictive jobs: the failure each prevented (failureCostOf, the same
 *                   figure the prediction showed) − labour × LABOUR_RATE − parts. A job whose
 *                   technician found nothing (verdict "false positive") prevented nothing.
 *   money at risk   open predictions × probability × failure cost.
 *   downtime        the failure history's downtime hours × the business's cost per hour.
 *   spend           corrective repairs (the failure history), preventive work (PM jobs done),
 *                   predictive jobs; labour × LABOUR_RATE + parts at inventory prices.
 *   budget          a seeded figure per kind of work, set at the start of the year.
 */
import { LABOUR_RATE, type FinancialsOverview, type SpendCategory, type SpendMonth, type ValueItem } from "@pdm/contracts";
import { HOUR, iso } from "./clock";
import { DOWNTIME_COST_PER_HOUR } from "./kpis";
import { partsFor, pmDone, type Ctx2 } from "./pm";
import { hashNoise, hashString } from "./random";
import { failureCostOf, type Snapshot } from "./snapshot";
import type { World } from "./world";

const DONE: ReadonlySet<string> = new Set(["completed", "verified", "closed"]);
const CATEGORIES: readonly SpendCategory[] = ["corrective", "preventive", "predictive"];

interface Ctx extends Ctx2 {
  snapshot: () => Snapshot;
  /** A part's unit cost from the inventory catalogue. */
  priceOf: (partNumber: string) => number;
}

const caches = new WeakMap<World, Map<string, FinancialsOverview>>();

export function financialsOverview(ctx: Ctx): FinancialsOverview {
  let cache = caches.get(ctx.world);
  if (!cache) caches.set(ctx.world, (cache = new Map()));
  const closed = ctx.workOrders.all().filter((o) => o.closeOut).length;
  const key = `${ctx.scopeKey}|${Math.floor(ctx.now / HOUR)}|${ctx.workOrders.all().length}|${closed}`;
  const hit = cache.get(key);
  if (hit) return hit;
  if (cache.size > 30) cache.clear();
  const result = compute(ctx);
  cache.set(key, result);
  return result;
}

const r0 = (v: number) => Math.round(v);

function compute(ctx: Ctx): FinancialsOverview {
  // The last 12 calendar months, this one included.
  const d = new Date(ctx.now);
  const from = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 11, 1);
  const months = new Map<string, SpendMonth>();
  for (let i = 11; i >= 0; i--) {
    const k = iso(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).slice(0, 7);
    months.set(k, { month: k, corrective: 0, preventive: 0, predictive: 0, budget: 0 });
  }
  const jobs: Record<SpendCategory, { n: number; total: number }> = {
    corrective: { n: 0, total: 0 },
    preventive: { n: 0, total: 0 },
    predictive: { n: 0, total: 0 },
  };
  const spend = (category: SpendCategory, at: number, amount: number) => {
    const m = months.get(iso(at).slice(0, 7));
    if (m) m[category] += amount;
    jobs[category].n++;
    jobs[category].total += amount;
  };
  const priced = (parts: readonly { partNumber: string; quantity: number }[]) =>
    parts.reduce((s, p) => s + p.quantity * ctx.priceOf(p.partNumber), 0);

  // Value realised, and predictive spend: finished predictive jobs.
  const items: ValueItem[] = [];
  for (const wo of ctx.workOrders.all()) {
    if (wo.type !== "predictive" || !wo.closeOut || !DONE.has(wo.status) || !ctx.inScope(wo.assetId)) continue;
    const completedAt = Date.parse(wo.closeOut.completedAt);
    if (completedAt < from || completedAt > ctx.now) continue;
    const asset = ctx.world.assets.get(wo.assetId);
    if (!asset) continue;
    const falseAlarm = wo.closeOut.predictionVerdict === "false_positive";
    const partsCost = falseAlarm ? 0 : priced(partsFor(asset.data.assetClass, wo.closeOut.failureMode));
    const cost = wo.closeOut.laborHours * LABOUR_RATE + partsCost;
    const avoided = falseAlarm ? 0 : failureCostOf(asset);
    items.push({
      workOrderId: wo.id,
      workOrderNumber: wo.number,
      assetId: wo.assetId,
      completedAt: wo.closeOut.completedAt,
      avoided,
      labourHours: wo.closeOut.laborHours,
      partsCost: r0(partsCost),
      cost: r0(cost),
      net: r0(avoided - cost),
      falseAlarm,
    });
    spend("predictive", completedAt, cost);
  }

  // Money at risk: open predictions.
  let atRisk = 0;
  let open = 0;
  for (const p of ctx.snapshot().predictions) {
    if (p.status === "closed" || p.status === "dismissed" || !ctx.inScope(p.assetId)) continue;
    const asset = ctx.world.assets.get(p.assetId);
    if (!asset) continue;
    atRisk += p.probability * failureCostOf(asset);
    open++;
  }

  // Downtime and corrective spend: the failure history.
  const bySite = new Map<string, { hours: number; cost: number; perHour: number }>();
  for (const f of ctx.failures()) {
    const t = Date.parse(f.failedAt);
    if (t < from || t > ctx.now || !ctx.inScope(f.assetId)) continue;
    const asset = ctx.world.assets.get(f.assetId);
    if (!asset) continue;
    const perHour = DOWNTIME_COST_PER_HOUR[asset.data.businessLine];
    const site = bySite.get(asset.data.siteId) ?? { hours: 0, cost: 0, perHour };
    site.hours += f.downtimeHours;
    site.cost += f.downtimeHours * perHour;
    bySite.set(asset.data.siteId, site);
    spend("corrective", t, f.repairHours * LABOUR_RATE + priced(partsFor(asset.data.assetClass, f.mode)));
  }

  // Preventive spend: PM jobs done.
  for (const job of pmDone(ctx, from)) spend("preventive", job.doneAt, job.hours * LABOUR_RATE + priced(job.parts));

  // The budget, set at the start of the year: a seeded share of each kind of work's spend, spread evenly.
  let budget = 0;
  for (const c of CATEGORIES) {
    const annual = jobs[c].total * (0.9 + 0.25 * hashNoise(hashString(`budget:${ctx.scopeKey}:${c}`), 1));
    budget += annual;
    for (const m of months.values()) m.budget += annual / 12;
  }

  const total = CATEGORIES.reduce((s, c) => s + jobs[c].total, 0);
  const avoided = items.reduce((s, i) => s + i.avoided, 0);
  const cost = items.reduce((s, i) => s + i.cost, 0);
  return {
    currency: "USD",
    value: {
      avoided: r0(avoided),
      cost: r0(cost),
      net: r0(avoided - cost),
      jobs: items.length,
      falseAlarms: items.filter((i) => i.falseAlarm).length,
      items: [...items].sort((a, b) => b.net - a.net).slice(0, 15),
    },
    atRisk: { amount: r0(atRisk), predictions: open },
    downtime: {
      hours: r0([...bySite.values()].reduce((s, x) => s + x.hours, 0)),
      cost: r0([...bySite.values()].reduce((s, x) => s + x.cost, 0)),
      sites: [...bySite]
        .map(([siteId, x]) => ({
          siteId,
          siteName: ctx.world.sites.get(siteId)?.site.name ?? siteId,
          hours: r0(x.hours),
          cost: r0(x.cost),
          costPerHour: x.perHour,
        }))
        .sort((a, b) => b.cost - a.cost),
    },
    spend: {
      months: [...months.values()].map((m) => ({
        month: m.month,
        corrective: r0(m.corrective),
        preventive: r0(m.preventive),
        predictive: r0(m.predictive),
        budget: r0(m.budget),
      })),
      total: r0(total),
      budget: r0(budget),
      plannedPct: total > 0 ? Math.round((1000 * (jobs.preventive.total + jobs.predictive.total)) / total) / 10 : 0,
      byCategory: CATEGORIES.map((c) => ({
        category: c,
        jobs: jobs[c].n,
        total: r0(jobs[c].total),
        average: jobs[c].n > 0 ? r0(jobs[c].total / jobs[c].n) : 0,
      })),
    },
  };
}
