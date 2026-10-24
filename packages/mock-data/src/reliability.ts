/**
 * Failure history and reliability KPIs.
 *
 * Five years of corrective work for every asset, as a maintenance system would hold it, coded
 * with ISO 14224 (mode, cause, remedy). Each failure mode of a class has its own Weibull
 * life (β shape, η scale): after a repair the clock for that mode starts again, so the times
 * between failures of one mode are Weibull-distributed. That's what the Weibull analysis in the
 * next chunk will fit. A few "bad actors" fail far more often than their sisters.
 *
 * Corrective work orders closed out in this session are added as failures too.
 */
import {
  BAD_ACTOR_MIN_FAILURES,
  BAD_ACTOR_RATIO,
  FAILURE_HISTORY_YEARS,
  REPEAT_WINDOW_DAYS,
  type AssetClass,
  type AssetFailures,
  type BadActor,
  type ClassReliability,
  type FailureCauseCode,
  type FailureModeCode,
  type FailureRecord,
  type MonthCount,
  type ParetoBar,
  type ReliabilityKpis,
  type ReliabilityRequest,
  type ReliabilitySummary,
  type RemedyCode,
} from "@pdm/contracts";
import { DAY, HOUR, iso } from "./clock";
import type { AssetRecord } from "./model";
import { Rng, hashNoise } from "./random";
import type { WorkOrderStore } from "./work-orders";
import type { World } from "./world";

const YEAR = 365.25 * DAY;

/** One way a class fails: its ISO 14224 coding, Weibull life (β, η days) and median repair hours. */
export interface ModeLife {
  mode: FailureModeCode;
  cause: FailureCauseCode;
  remedy: RemedyCode;
  beta: number;
  etaDays: number;
  repairH: number;
}

const m = (
  mode: FailureModeCode,
  cause: FailureCauseCode,
  remedy: RemedyCode,
  beta: number,
  etaDays: number,
  repairH: number,
): ModeLife => ({
  mode,
  cause,
  remedy,
  beta,
  etaDays,
  repairH,
});

/**
 * β below 1: "infant mortality" (failures early after a repair, e.g. electronics, bad fitting).
 * β about 1: failures at random, no ageing (control and instrument faults).
 * β above 1: wear-out (bearings, seals, fouling): the longer it runs, the likelier it fails.
 */
export const LIVES: Record<AssetClass, readonly ModeLife[]> = {
  pump: [
    m("VIB", "2.4", "replace", 2.2, 1100, 8),
    m("ELP", "1.1", "replace", 1.5, 900, 6),
    m("LOO", "2.3", "overhaul", 2.5, 2200, 16),
    m("BRD", "4.1", "repair", 1.0, 4000, 10),
  ],
  compressor: [
    m("VIB", "2.4", "overhaul", 2.4, 1600, 30),
    m("ELP", "1.1", "replace", 1.4, 1400, 12),
    m("PDE", "5.2", "service", 1.8, 900, 8),
    m("UST", "3.1", "adjust", 0.9, 700, 4),
  ],
  gas_turbine: [
    m("UST", "3.3", "check", 0.8, 500, 4),
    m("FTS", "3.1", "repair", 1.0, 700, 6),
    m("VIB", "2.4", "overhaul", 2.6, 3000, 72),
    m("OHE", "2.7", "repair", 2.0, 2500, 24),
  ],
  steam_turbine: [
    m("VIB", "1.3", "adjust", 2.0, 2800, 20),
    m("UST", "3.1", "check", 0.9, 900, 4),
    m("ELU", "1.1", "repair", 1.5, 2400, 12),
  ],
  generator: [
    m("OHE", "2.7", "service", 2.2, 3500, 16),
    m("BRD", "4.5", "repair", 1.2, 6000, 48),
    m("VIB", "2.4", "replace", 2.4, 4000, 24),
  ],
  hrsg: [m("ELU", "2.2", "repair", 2.0, 2600, 36), m("PLU", "5.1", "service", 1.6, 2000, 16)],
  transformer: [
    m("OHE", "2.7", "service", 2.5, 7000, 24),
    m("ELP", "1.1", "repair", 1.4, 6000, 12),
    m("BRD", "4.1", "replace", 1.1, 12000, 120),
  ],
  switchgear: [m("FTS", "3.1", "repair", 1.0, 5000, 6), m("OHE", "1.5", "adjust", 1.8, 6000, 6)],
  recip_engine: [
    m("VIB", "2.4", "overhaul", 2.3, 1400, 24),
    m("OHE", "2.7", "service", 1.9, 1100, 8),
    m("FTS", "3.1", "repair", 0.9, 600, 4),
    m("ELU", "1.1", "replace", 1.5, 1200, 6),
  ],
  wellhead: [m("ELP", "1.1", "repair", 1.4, 2500, 8), m("INL", "2.3", "replace", 2.0, 3000, 12)],
  esp: [m("BRD", "4.5", "replace", 1.6, 700, 60), m("LOO", "2.4", "replace", 2.2, 900, 60), m("OHE", "2.7", "replace", 1.8, 1100, 60)],
  rod_pump: [m("BRD", "2.6", "repair", 1.9, 800, 20), m("LOO", "2.4", "replace", 2.1, 1000, 16)],
  separator: [m("PLU", "5.1", "service", 1.7, 1800, 10), m("AIR", "3.3", "adjust", 1.0, 1500, 3)],
  pipeline_segment: [m("ELP", "2.2", "repair", 3.0, 15000, 72), m("STD", "2.2", "repair", 3.5, 25000, 120)],
  heat_exchanger: [
    m("PLU", "5.2", "service", 1.8, 1300, 16),
    m("INL", "2.2", "repair", 2.6, 4000, 24),
    m("ELP", "1.1", "repair", 1.4, 3500, 8),
  ],
  fired_heater: [m("OHE", "2.7", "repair", 2.0, 2500, 48), m("STD", "2.6", "replace", 3.0, 6000, 96)],
  pressure_vessel: [m("ELP", "2.2", "repair", 3.0, 12000, 48), m("AIR", "3.3", "check", 1.0, 3000, 3)],
  storage_tank: [m("ELP", "2.2", "repair", 3.0, 14000, 96), m("AIR", "3.3", "adjust", 1.0, 2500, 3)],
  control_valve: [
    m("ERO", "1.6", "service", 1.6, 1200, 4),
    m("ELP", "1.1", "replace", 1.4, 1800, 4),
    m("FTS", "3.1", "repair", 1.0, 2500, 3),
  ],
  psv: [m("INL", "2.3", "overhaul", 1.7, 2000, 8), m("FTS", "1.6", "overhaul", 2.0, 4000, 8)],
  inverter: [m("BRD", "4.1", "replace", 0.8, 2200, 6), m("OHE", "2.7", "service", 2.0, 1600, 4), m("UST", "3.3", "check", 1.0, 900, 2)],
  pv_string: [m("LOO", "4.5", "replace", 1.2, 4500, 3), m("BRD", "2.5", "replace", 1.5, 7000, 3)],
  combiner_box: [m("OHE", "1.5", "repair", 1.6, 5000, 3), m("BRD", "4.1", "replace", 1.0, 8000, 3)],
  tracker: [m("BRD", "2.4", "repair", 2.0, 2200, 4), m("ERO", "3.1", "adjust", 1.0, 1500, 2)],
  bess: [m("OHE", "2.7", "service", 1.8, 2500, 12), m("LOO", "6.0", "check", 1.3, 3000, 8), m("UST", "3.1", "check", 0.9, 1200, 3)],
  weather_station: [m("AIR", "3.3", "test", 1.0, 900, 2)],
};

/** Weibull draw: η·(−ln U)^(1/β). */
const weibull = (rng: Rng, beta: number, eta: number) => eta * Math.pow(-Math.log(1 - rng.next()), 1 / beta);

/** A standard normal draw (Box–Muller). */
function gauss(rng: Rng): number {
  const u = Math.max(1e-12, rng.next());
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng.next());
}

const r1 = (x: number) => Math.round(x * 10) / 10;

/** Is this asset a bad actor (about one in 30 fails ~3× as often as its sisters)? */
export function isSeededBadActor(asset: AssetRecord): boolean {
  return hashNoise(asset.seed ^ 0xbad0, 0) < 0.035;
}

function historyFor(asset: AssetRecord, from: number, to: number): Omit<FailureRecord, "id" | "repeat">[] {
  const lives = LIVES[asset.data.assetClass] ?? [];
  const rng = Rng.for(asset.seed, "failures");
  const start = Math.max(from, Date.parse(asset.data.commissionedAt));
  const bad = isSeededBadActor(asset) ? 0.3 : 1;
  // Each asset is a little different from its sisters.
  const own = 0.8 + 0.4 * hashNoise(asset.seed ^ 0x11fe, 0);
  const out: Omit<FailureRecord, "id" | "repeat">[] = [];
  for (const life of lives) {
    let t = start;
    for (;;) {
      t += weibull(rng, life.beta, life.etaDays * bad * own) * DAY;
      if (t >= to) break;
      const repairHours = Math.max(0.5, life.repairH * Math.exp(0.5 * gauss(rng)));
      // Waiting for people, parts and permits: hours to a couple of days.
      const waitHours = 2 + 46 * rng.next() ** 2;
      const downtime = repairHours + waitHours;
      out.push({
        assetId: asset.data.id,
        assetClass: asset.data.assetClass,
        siteId: asset.data.siteId,
        failedAt: iso(t),
        restoredAt: iso(t + downtime * HOUR),
        mode: life.mode,
        cause: life.cause,
        remedy: life.remedy,
        repairHours: r1(repairHours),
        downtimeHours: r1(downtime),
        source: "history",
        workOrderId: null,
      });
      t += downtime * HOUR; // the clock for this mode restarts once it's back in service
    }
  }
  return out;
}

/** Mark repeats: the same mode on the same asset within REPEAT_WINDOW_DAYS of the last one. */
function withRepeats(records: Omit<FailureRecord, "repeat">[]): FailureRecord[] {
  const sorted = [...records].sort((a, b) => a.failedAt.localeCompare(b.failedAt) || a.id.localeCompare(b.id));
  const last = new Map<string, number>();
  return sorted.map((r) => {
    const key = `${r.assetId}:${r.mode}`;
    const t = Date.parse(r.failedAt);
    const prev = last.get(key);
    last.set(key, t);
    return { ...r, repeat: prev !== undefined && t - prev <= REPEAT_WINDOW_DAYS * DAY };
  });
}

const historyCache = new WeakMap<World, Omit<FailureRecord, "repeat">[]>();

/** The maintenance system's five years of failures (generated once per world). */
function seededHistory(world: World): Omit<FailureRecord, "repeat">[] {
  const hit = historyCache.get(world);
  if (hit) return hit;
  const to = world.createdAt;
  const from = to - FAILURE_HISTORY_YEARS * YEAR;
  const assets = [...world.assets.values()].sort((a, b) => a.data.id.localeCompare(b.data.id));
  const records = assets
    .flatMap((a) => historyFor(a, from, to))
    .sort((a, b) => a.failedAt.localeCompare(b.failedAt) || a.assetId.localeCompare(b.assetId))
    .map((r, i) => ({ ...r, id: `FL-${String(i + 1).padStart(6, "0")}` }));
  historyCache.set(world, records);
  return records;
}

/** Every failure: the history, plus corrective work closed out in this session. */
export function allFailures(world: World, workOrders: WorkOrderStore): FailureRecord[] {
  const fromSession = workOrders
    .all()
    .filter((o) => o.type === "corrective" && o.closeOut && Date.parse(o.closeOut.completedAt) >= world.createdAt)
    .flatMap((o) => {
      const asset = world.assets.get(o.assetId);
      const c = o.closeOut!;
      if (!asset) return [];
      const failed = Date.parse(o.createdAt);
      const restored = Date.parse(c.completedAt);
      return [
        {
          id: `FL-${o.id}`,
          assetId: o.assetId,
          assetClass: asset.data.assetClass,
          siteId: asset.data.siteId,
          failedAt: o.createdAt,
          restoredAt: c.completedAt,
          mode: c.failureMode,
          cause: c.cause,
          remedy: c.remedy,
          repairHours: c.laborHours,
          downtimeHours: r1(Math.max(c.laborHours, (restored - failed) / HOUR)),
          source: "work_order" as const,
          workOrderId: o.id,
        },
      ];
    });
  return withRepeats([...seededHistory(world), ...fromSession]);
}

// ─── KPIs ────────────────────────────────────────────────────────────────────

/** Hours each asset existed in [from, to] (not before it was commissioned). */
function calendarHours(assets: readonly AssetRecord[], from: number, to: number): number {
  return assets.reduce((s, a) => s + Math.max(0, to - Math.max(from, Date.parse(a.data.commissionedAt))) / HOUR, 0);
}

/** Downtime hours of a failure that fall inside [from, to]. */
function downtimeIn(f: FailureRecord, from: number, to: number): number {
  const a = Math.max(from, Date.parse(f.failedAt));
  const b = Math.min(to, Date.parse(f.failedAt) + f.downtimeHours * HOUR);
  return Math.max(0, b - a) / HOUR;
}

const inWindow = (f: FailureRecord, from: number, to: number) => {
  const t = Date.parse(f.failedAt);
  return t >= from && t < to;
};

export function kpisOf(assets: readonly AssetRecord[], failures: readonly FailureRecord[], from: number, to: number): ReliabilityKpis {
  const calendar = calendarHours(assets, from, to);
  const inPeriod = failures.filter((f) => inWindow(f, from, to));
  const downtime = failures.reduce((s, f) => s + downtimeIn(f, from, to), 0);
  const operating = Math.max(0, calendar - downtime);
  const n = inPeriod.length;
  return {
    assets: assets.length,
    failures: n,
    mtbfHours: n > 0 ? Math.round(operating / n) : null,
    mttrHours: n > 0 ? r1(inPeriod.reduce((s, f) => s + f.repairHours, 0) / n) : null,
    availabilityPct: calendar > 0 ? Math.round((10000 * operating) / calendar) / 100 : 100,
    downtimeHours: Math.round(downtime),
    failureRatePerYear: calendar > 0 ? Math.round((1000 * n) / (calendar / (YEAR / HOUR))) / 1000 : 0,
    repeatFailures: inPeriod.filter((f) => f.repeat).length,
  };
}

export function reliabilitySummary(input: {
  world: World;
  workOrders: WorkOrderStore;
  now: number;
  request: ReliabilityRequest;
  inScope: (assetId: string) => boolean;
}): ReliabilitySummary {
  const { world, now, request } = input;
  const to = now;
  const from = now - request.years * YEAR;
  const scoped = [...world.assets.values()].filter((a) => input.inScope(a.data.id));
  const byAsset = new Map<string, FailureRecord[]>();
  for (const f of allFailures(world, input.workOrders)) {
    const list = byAsset.get(f.assetId) ?? [];
    list.push(f);
    byAsset.set(f.assetId, list);
  }
  const failuresOf = (assets: readonly AssetRecord[]) => assets.flatMap((a) => byAsset.get(a.data.id) ?? []);

  // Every class in scope.
  const classes = new Map<AssetClass, AssetRecord[]>();
  for (const a of scoped) {
    const list = classes.get(a.data.assetClass) ?? [];
    list.push(a);
    classes.set(a.data.assetClass, list);
  }
  const byClass: ClassReliability[] = [...classes]
    .map(([assetClass, assets]) => ({ assetClass, ...kpisOf(assets, failuresOf(assets), from, to) }))
    .sort((a, b) => b.failures - a.failures || a.assetClass.localeCompare(b.assetClass));

  const focus = request.assetClass ? (classes.get(request.assetClass) ?? []) : scoped;
  const focusFailures = failuresOf(focus);
  const kpis = kpisOf(focus, focusFailures, from, to);
  const inPeriod = focusFailures.filter((f) => inWindow(f, from, to));

  // Pareto of failure modes, biggest first, with the running total.
  const modes = new Map<FailureModeCode, { failures: number; downtimeHours: number }>();
  for (const f of inPeriod) {
    const e = modes.get(f.mode) ?? { failures: 0, downtimeHours: 0 };
    e.failures++;
    e.downtimeHours += f.downtimeHours;
    modes.set(f.mode, e);
  }
  const measure = (e: { failures: number; downtimeHours: number }) => (request.paretoBy === "downtime" ? e.downtimeHours : e.failures);
  const total = [...modes.values()].reduce((s, e) => s + measure(e), 0);
  const ranked = [...modes].sort(([ma, a], [mb, b]) => measure(b) - measure(a) || ma.localeCompare(mb));
  const pareto: ParetoBar[] = ranked.map(([mode, e], i) => {
    const running = ranked.slice(0, i + 1).reduce((s, [, x]) => s + measure(x), 0);
    return {
      mode,
      failures: e.failures,
      downtimeHours: Math.round(e.downtimeHours),
      sharePct: total > 0 ? r1((100 * measure(e)) / total) : 0,
      cumulativePct: total > 0 ? r1((100 * running) / total) : 0,
    };
  });

  // Bad actors: failing far more often than their class.
  const classRate = new Map(byClass.map((c) => [c.assetClass, c.failureRatePerYear]));
  const badActors: BadActor[] = focus
    .flatMap((a) => {
      const fs = (byAsset.get(a.data.id) ?? []).filter((f) => inWindow(f, from, to));
      if (fs.length < BAD_ACTOR_MIN_FAILURES) return [];
      const years = calendarHours([a], from, to) / (YEAR / HOUR);
      const avg = classRate.get(a.data.assetClass) ?? 0;
      const ratio = years > 0 && avg > 0 ? fs.length / years / avg : 0;
      if (ratio < BAD_ACTOR_RATIO) return [];
      const counts = new Map<FailureModeCode, number>();
      for (const f of fs) counts.set(f.mode, (counts.get(f.mode) ?? 0) + 1);
      const topMode = [...counts].sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))[0]![0];
      return [
        {
          assetId: a.data.id,
          assetName: a.data.name,
          assetClass: a.data.assetClass,
          siteId: a.data.siteId,
          failures: fs.length,
          downtimeHours: Math.round(fs.reduce((s, f) => s + f.downtimeHours, 0)),
          repeatFailures: fs.filter((f) => f.repeat).length,
          ratioToClass: Math.round(ratio * 10) / 10,
          topMode,
        },
      ];
    })
    .sort((a, b) => b.ratioToClass - a.ratioToClass || b.failures - a.failures)
    .slice(0, 20);

  // Failures per calendar month.
  const monthly: MonthCount[] = [];
  const first = new Date(from);
  const counts = new Map<string, number>();
  for (const f of inPeriod) counts.set(f.failedAt.slice(0, 7), (counts.get(f.failedAt.slice(0, 7)) ?? 0) + 1);
  for (let y = first.getUTCFullYear(), mo = first.getUTCMonth(); Date.UTC(y, mo, 1) < to;) {
    const key = `${y}-${String(mo + 1).padStart(2, "0")}`;
    monthly.push({ month: key, failures: counts.get(key) ?? 0 });
    mo++;
    if (mo === 12) {
      mo = 0;
      y++;
    }
  }

  return { from: iso(from), to: iso(to), kpis, byClass, pareto, badActors, monthly };
}

export function assetFailures(world: World, workOrders: WorkOrderStore, asset: AssetRecord, now: number): AssetFailures {
  const to = now;
  const from = world.createdAt - FAILURE_HISTORY_YEARS * YEAR;
  const all = allFailures(world, workOrders);
  const own = all.filter((f) => f.assetId === asset.data.id);
  const sisters = [...world.assets.values()].filter((a) => a.data.assetClass === asset.data.assetClass);
  const sisterIds = new Set(sisters.map((a) => a.data.id));
  return {
    assetId: asset.data.id,
    from: iso(from),
    to: iso(to),
    failures: [...own].sort((a, b) => b.failedAt.localeCompare(a.failedAt)),
    kpis: kpisOf([asset], own, from, to),
    classKpis: kpisOf(
      sisters,
      all.filter((f) => sisterIds.has(f.assetId)),
      from,
      to,
    ),
  };
}
