/**
 * Data and integrations (Phase 4, chunk 7). Data quality is judged per 5-minute window over the
 * last 24 hours, from the same rules that make the readings (signals.ts): an offline asset's
 * tags send nothing; a few tags are stuck (flatline); chaos mode drops some windows and flags
 * others bad. Only the chaos periods need walking window by window, so a scan of every tag in
 * the enterprise stays quick. The sources are simulated: their figures come from the same data.
 */
import {
  DATA_QUALITY_HOURS,
  ISSUE_THRESHOLD_PCT,
  SCAN_MINUTES,
  type DataQualityOverview,
  type DataSource,
  type TagIssue,
  type TagListParams,
  type TagQualityRow,
  type TagRow,
} from "@pdm/contracts";
import { HOUR, iso } from "./clock";
import { chaosBad, chaosGap, tagValue, type ChaosWindows } from "./signals";
import type { WorkOrderStore } from "./work-orders";
import type { AssetRecord, TagRecord } from "./model";
import type { World } from "./world";

const WINDOW = SCAN_MINUTES * 60_000;
const ISSUE_RANK: Record<TagIssue, number> = { no_data: 4, flatline: 3, bad_quality: 2, gaps: 1 };

interface Ctx {
  world: World;
  chaos: ChaosWindows;
  now: number;
  assets: readonly AssetRecord[];
  scopeKey: string;
}

interface TagScan {
  tag: TagRecord;
  windows: number;
  missing: number;
  bad: number;
  issue: TagIssue | null;
}

function scanTag(ctx: Ctx, tag: TagRecord, from: number, to: number): TagScan {
  const windows = Math.round((to - from) / WINDOW);
  if (tag.asset.staticStatus === "offline") return { tag, windows, missing: windows, bad: 0, issue: "no_data" };
  let missing = 0;
  let bad = 0;
  for (const period of ctx.chaos.between(from, to)) {
    // The first window that starts inside the period, to the last.
    for (let t = Math.ceil(period.from / WINDOW) * WINDOW; t < period.to; t += WINDOW) {
      if (chaosGap(ctx.chaos, tag, t)) missing++;
      else if (!tag.flatline && chaosBad(ctx.chaos, tag, t)) bad++;
    }
  }
  const over = (n: number) => (100 * n) / windows >= ISSUE_THRESHOLD_PCT;
  const issue: TagIssue | null = tag.flatline ? "flatline" : over(bad) ? "bad_quality" : over(missing) ? "gaps" : null;
  return { tag, windows, missing, bad, issue };
}

const scans = new WeakMap<World, Map<string, TagScan[]>>();

/** Every tag in scope, scanned over the last 24 h (cached per 5-minute window and chaos switch). */
function scanAll(ctx: Ctx): { from: number; to: number; results: TagScan[] } {
  const to = Math.floor(ctx.now / WINDOW) * WINDOW;
  const from = to - DATA_QUALITY_HOURS * HOUR;
  let cache = scans.get(ctx.world);
  if (!cache) scans.set(ctx.world, (cache = new Map()));
  const key = `${ctx.scopeKey}|${to}|${ctx.chaos.version}`;
  let results = cache.get(key);
  if (!results) {
    if (cache.size > 20) cache.clear();
    results = ctx.assets.flatMap((a) => a.tags.map((tag) => scanTag(ctx, tag, from, to)));
    cache.set(key, results);
  }
  return { from, to, results };
}

const pct1 = (part: number, whole: number) => (whole > 0 ? Math.round((1000 * part) / whole) / 10 : 100);

export function dataQuality(ctx: Ctx): DataQualityOverview {
  const { from, to, results } = scanAll(ctx);
  const byIssue = { no_data: 0, flatline: 0, bad_quality: 0, gaps: 0 };
  const sites = new Map<string, { tags: number; windows: number; missing: number; issues: number }>();
  let windows = 0;
  let missing = 0;
  for (const r of results) {
    if (r.issue) byIssue[r.issue]++;
    windows += r.windows;
    missing += r.missing;
    const siteId = r.tag.asset.data.siteId;
    const s = sites.get(siteId) ?? { tags: 0, windows: 0, missing: 0, issues: 0 };
    s.tags++;
    s.windows += r.windows;
    s.missing += r.missing;
    if (r.issue) s.issues++;
    sites.set(siteId, s);
  }
  const worst: TagQualityRow[] = results
    .filter((r) => r.issue)
    .sort(
      (a, b) =>
        ISSUE_RANK[b.issue!] - ISSUE_RANK[a.issue!] || b.missing + b.bad - (a.missing + a.bad) || a.tag.tag.id.localeCompare(b.tag.tag.id),
    )
    .slice(0, 50)
    .map((r) => ({
      tagId: r.tag.tag.id,
      assetId: r.tag.asset.data.id,
      siteId: r.tag.asset.data.siteId,
      issue: r.issue!,
      missingPct: pct1(r.missing, r.windows),
      badPct: pct1(r.bad, r.windows),
    }));
  return {
    from: iso(from),
    to: iso(to),
    totals: {
      tags: results.length,
      good: results.filter((r) => !r.issue).length,
      completenessPct: pct1(windows - missing, windows),
      byIssue,
    },
    sites: [...sites]
      .map(([siteId, s]) => ({
        siteId,
        siteName: ctx.world.sites.get(siteId)?.site.name ?? siteId,
        tags: s.tags,
        completenessPct: pct1(s.windows - s.missing, s.windows),
        issues: s.issues,
      }))
      .sort((a, b) => a.completenessPct - b.completenessPct || b.issues - a.issues || a.siteName.localeCompare(b.siteName)),
    worst,
  };
}

/** The tag browser: search, filter by issue, page; latest value is the newest reading in 24 h. */
export function listTags(ctx: Ctx, params: TagListParams): { items: TagRow[]; total: number; offset: number; limit: number } {
  const { from, results } = scanAll(ctx);
  const q = params.search?.toLowerCase();
  const matching = results.filter(
    (r) =>
      (!params.issue || r.issue === params.issue) &&
      (!q || r.tag.tag.id.toLowerCase().includes(q) || r.tag.tag.description.toLowerCase().includes(q)),
  );
  const items = matching.slice(params.offset, params.offset + params.limit).map((r): TagRow => {
    let latest: TagRow["latest"] = null;
    for (let t = ctx.now; t >= from && r.issue !== "no_data"; t -= WINDOW) {
      const reading = tagValue(ctx.world, ctx.chaos, r.tag, t);
      if (reading) {
        latest = { t: iso(t), value: reading.value, quality: reading.quality };
        break;
      }
    }
    return { ...r.tag.tag, assetName: r.tag.asset.data.name, siteId: r.tag.asset.data.siteId, latest, issue: r.issue };
  });
  return { items, total: matching.length, offset: params.offset, limit: params.limit };
}

/** The systems feeding the platform. Simulated, but their figures come from the plant's own data. */
export function dataSources(ctx: Ctx, workOrders: WorkOrderStore): DataSource[] {
  const { from, results } = scanAll(ctx);
  const hourStart = Math.floor(ctx.now / HOUR) * HOUR;
  const day = new Date(ctx.now);
  const at = (h: number) => {
    const t = Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), h);
    return t <= ctx.now ? t : t - 24 * HOUR;
  };
  const readings = results.reduce((s, r) => s + r.windows - r.missing, 0);
  const assets = [...ctx.world.assets.values()];
  const recent = (t: string | undefined) => !!t && Date.parse(t) >= from && Date.parse(t) <= ctx.now;
  const chaos = ctx.chaos.enabled;
  return [
    {
      id: "SRC-HIST",
      kind: "historian",
      name: "Plant historian",
      protocol: "OPC UA, streaming",
      status: chaos ? "degraded" : "connected",
      lastSync: iso(ctx.now),
      records: readings,
      recordKind: "readings",
      problem: chaos ? "Field data arriving with gaps and bad-quality values" : null,
    },
    {
      id: "SRC-CMMS",
      kind: "cmms",
      name: "Maintenance system (CMMS)",
      protocol: "REST API, on every change",
      status: "connected",
      lastSync: iso(ctx.now),
      records: workOrders.all().filter((o) => recent(o.createdAt) || recent(o.closeOut?.completedAt)).length,
      recordKind: "work orders",
      problem: null,
    },
    {
      id: "SRC-LIMS",
      kind: "lab",
      name: "Laboratory (LIMS)",
      protocol: "Daily file at 07:00 UTC",
      status: "connected",
      lastSync: iso(at(7)),
      records: assets.filter((a) => a.data.assetClass === "transformer" && a.staticStatus !== "offline").length,
      recordKind: "oil samples",
      problem: null,
    },
    {
      id: "SRC-ERP",
      kind: "erp",
      name: "ERP (parts and purchasing)",
      protocol: "REST API, hourly",
      status: "connected",
      lastSync: iso(hourStart),
      records: 24,
      recordKind: "stock updates",
      problem: null,
    },
    {
      id: "SRC-WX",
      kind: "weather",
      name: "Weather service",
      protocol: "REST API, hourly",
      status: "connected",
      lastSync: iso(hourStart),
      records: ctx.world.sites.size * 24,
      recordKind: "forecasts",
      problem: null,
    },
  ];
}
