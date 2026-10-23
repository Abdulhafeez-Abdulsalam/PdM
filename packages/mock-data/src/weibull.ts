/**
 * Weibull analysis and the risk matrix.
 *
 * Weibull: for one class and failure mode, collect every time between failures (the clock
 * restarts when the asset is back in service) and every running time that hasn't ended in a
 * failure yet (a "suspension": we know it lasted at least that long). Fit β and η by maximum
 * likelihood, which uses both, and estimate how sure we are from the likelihood's curvature.
 *
 * Risk matrix: each asset's chance of failing within a year (from its own failure rate, or an
 * open prediction if that says more) against its criticality.
 */
import {
  FAILURE_HISTORY_YEARS,
  WEIBULL_MIN_FAILURES,
  failurePattern,
  likelihoodLevel,
  riskLevel,
  type AssetClass,
  type FailureModeCode,
  type FailureRecord,
  type Prediction,
  type RiskMatrix,
  type RiskMatrixItem,
  type RiskRequest,
  type WeibullAnalysis,
  type WeibullFit,
  type WeibullRequest,
} from "@pdm/contracts";
import { DAY } from "./clock";
import type { AssetRecord } from "./model";
import type { World } from "./world";

const YEAR = 365.25 * DAY;
/** 90 % two-sided: 1.645 standard deviations either way. */
const Z90 = 1.645;

// ─── The maths ───────────────────────────────────────────────────────────────

/** Γ(x) by the Lanczos approximation (good to ~15 digits for x > 0). */
export function gamma(x: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) return Math.PI / (Math.sin(Math.PI * x) * gamma(1 - x));
  x -= 1;
  let a = c[0]!;
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i]! / (x + i);
  return Math.sqrt(2 * Math.PI) * Math.pow(t, x + 0.5) * Math.exp(-t) * a;
}

/** Weibull log-likelihood with right-censoring, in (a = ln β, b = ln η). */
function logLikelihood(a: number, b: number, failures: readonly number[], all: readonly number[]): number {
  const beta = Math.exp(a);
  let l = 0;
  for (const t of failures) l += a - beta * b + (beta - 1) * Math.log(t);
  for (const x of all) l -= Math.exp(beta * (Math.log(x) - b));
  return l;
}

/**
 * Maximum-likelihood β and η for failure times and suspension (still-running) times.
 * For a given β the best η has a formula (η^β = Σ x^β ÷ failures), so only β needs searching:
 * the equation below is increasing in β, so bisection finds its root.
 */
export function fitWeibull(
  failures: readonly number[],
  suspensions: readonly number[],
): { beta: number; eta: number; cov: number[][] } | null {
  const r = failures.length;
  if (r < 2) return null;
  // Work in units of the mean time, so x^β stays a sensible size.
  const all = [...failures, ...suspensions];
  const scale = all.reduce((s, x) => s + x, 0) / all.length;
  const f = failures.map((x) => x / scale);
  const xs = all.map((x) => x / scale);
  const meanLnF = f.reduce((s, x) => s + Math.log(x), 0) / r;
  const g = (beta: number) => {
    let num = 0;
    let den = 0;
    for (const x of xs) {
      const p = Math.pow(x, beta);
      num += p * Math.log(x);
      den += p;
    }
    return num / den - 1 / beta - meanLnF;
  };
  let lo = 0.05;
  let hi = 20;
  if (g(lo) > 0 || g(hi) < 0) return null;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (g(mid) > 0) hi = mid;
    else lo = mid;
  }
  const beta = (lo + hi) / 2;
  const etaScaled = Math.pow(xs.reduce((s, x) => s + Math.pow(x, beta), 0) / r, 1 / beta);

  // Covariance of (ln β, ln η): the inverse of minus the Hessian of the log-likelihood,
  // estimated with central differences.
  const a = Math.log(beta);
  const b = Math.log(etaScaled);
  const h = 1e-3;
  const L = (da: number, db: number) => logLikelihood(a + da, b + db, f, xs);
  const haa = (L(h, 0) - 2 * L(0, 0) + L(-h, 0)) / (h * h);
  const hbb = (L(0, h) - 2 * L(0, 0) + L(0, -h)) / (h * h);
  const hab = (L(h, h) - L(h, -h) - L(-h, h) + L(-h, -h)) / (4 * h * h);
  const det = haa * hbb - hab * hab;
  const cov = [
    [-hbb / det, hab / det],
    [hab / det, -haa / det],
  ];
  return { beta, eta: etaScaled * scale, cov };
}

/**
 * Median ranks with suspensions (Johnson's adjusted ranks and Bernard's approximation): the
 * estimated share failed by each failure time, for plotting on Weibull paper.
 */
export function medianRanks(failures: readonly number[], suspensions: readonly number[]): { t: number; f: number }[] {
  const items = [...failures.map((t) => ({ t, failed: true })), ...suspensions.map((t) => ({ t, failed: false }))].sort(
    (x, y) => x.t - y.t || Number(y.failed) - Number(x.failed),
  );
  const n = items.length;
  let rank = 0;
  const out: { t: number; f: number }[] = [];
  items.forEach((it, i) => {
    if (!it.failed) return;
    const remaining = n - i; // this item and everything after it
    rank += (n + 1 - rank) / (1 + remaining);
    out.push({ t: it.t, f: (rank - 0.3) / (n + 0.4) });
  });
  return out;
}

// ─── Weibull analysis of the history ─────────────────────────────────────────

const r2 = (x: number) => Math.round(x * 100) / 100;
const r0 = (x: number) => Math.round(x);

/** Times between failures of one mode, and the running times since the last one, per asset (days). */
function lifeData(assets: readonly AssetRecord[], failures: readonly FailureRecord[], mode: FailureModeCode, from: number, now: number) {
  const byAsset = new Map<string, FailureRecord[]>();
  for (const f of failures) {
    if (f.mode !== mode) continue;
    const list = byAsset.get(f.assetId) ?? [];
    list.push(f);
    byAsset.set(f.assetId, list);
  }
  const lives: number[] = [];
  const running: number[] = [];
  for (const a of assets) {
    let start = Math.max(from, Date.parse(a.data.commissionedAt));
    for (const f of (byAsset.get(a.data.id) ?? []).sort((x, y) => x.failedAt.localeCompare(y.failedAt))) {
      const t = Date.parse(f.failedAt);
      if (t > start) lives.push((t - start) / DAY);
      start = Math.max(start, Date.parse(f.restoredAt));
    }
    if (now > start) running.push((now - start) / DAY);
  }
  return { lives, running };
}

export function weibullAnalysis(input: {
  world: World;
  failures: readonly FailureRecord[];
  now: number;
  request: WeibullRequest;
  inScope: (assetId: string) => boolean;
}): WeibullAnalysis {
  const { world, now, request } = input;
  const assets = [...world.assets.values()].filter((a) => a.data.assetClass === request.assetClass && input.inScope(a.data.id));
  const ids = new Set(assets.map((a) => a.data.id));
  const failures = input.failures.filter((f) => ids.has(f.assetId));
  const counts = new Map<FailureModeCode, number>();
  for (const f of failures) counts.set(f.mode, (counts.get(f.mode) ?? 0) + 1);
  const modes = [...counts]
    .map(([mode, n]) => ({ mode, failures: n }))
    .sort((a, b) => b.failures - a.failures || a.mode.localeCompare(b.mode));
  const mode = request.mode ?? modes[0]?.mode ?? null;
  const empty = { assetClass: request.assetClass, mode, modes, failures: 0, suspensions: 0, fit: null, points: [], curve: [] };
  if (!mode) return empty;

  const from = world.createdAt - FAILURE_HISTORY_YEARS * YEAR;
  const { lives, running } = lifeData(assets, failures, mode, from, now);
  const base = { ...empty, failures: lives.length, suspensions: running.length };
  const ml = lives.length >= WEIBULL_MIN_FAILURES ? fitWeibull(lives, running) : null;
  const points = medianRanks(lives, running).map((p) => ({ days: r2(p.t), unreliabilityPct: r2(p.f * 100) }));
  if (!ml) return { ...base, points };

  const { beta, eta, cov } = ml;
  const sa = Math.sqrt(Math.max(0, cov[0]![0]!));
  const sb = Math.sqrt(Math.max(0, cov[1]![1]!));
  const fit: WeibullFit = {
    beta: r2(beta),
    betaLow: r2(beta * Math.exp(-Z90 * sa)),
    betaHigh: r2(beta * Math.exp(Z90 * sa)),
    etaDays: r0(eta),
    etaLowDays: r0(eta * Math.exp(-Z90 * sb)),
    etaHighDays: r0(eta * Math.exp(Z90 * sb)),
    b10Days: r0(eta * Math.pow(-Math.log(0.9), 1 / beta)),
    mttfDays: r0(eta * gamma(1 + 1 / beta)),
    pattern: failurePattern(beta),
  };

  // R(t) with a 90 % band: on the "Weibull scale" u = β(ln t − ln η) the uncertainty is
  // nearly normal; its variance comes from the covariance of (ln β, ln η) (the delta method).
  const curve = Array.from({ length: 100 }, (_, i) => {
    const t = ((i + 1) / 100) * 2.5 * eta;
    const u = beta * (Math.log(t) - Math.log(eta));
    const ga = u; // ∂u/∂(ln β)
    const gb = -beta; // ∂u/∂(ln η)
    const v = ga * ga * cov[0]![0]! + 2 * ga * gb * cov[0]![1]! + gb * gb * cov[1]![1]!;
    const s = Math.sqrt(Math.max(0, v));
    const R = (x: number) => Math.exp(-Math.exp(x));
    return { days: r0(t), reliability: r2(R(u) * 100) / 100, low: r2(R(u + Z90 * s) * 100) / 100, high: r2(R(u - Z90 * s) * 100) / 100 };
  });
  return { ...base, fit, points, curve };
}

// ─── Risk matrix ─────────────────────────────────────────────────────────────

/** A prediction's chance within its horizon, turned into a chance within a year. */
function yearlyFromPrediction(p: Prediction): number {
  if (p.horizonDays >= 365) return p.probability;
  return 1 - Math.pow(1 - p.probability, 365 / p.horizonDays);
}

export function riskMatrix(input: {
  world: World;
  failures: readonly FailureRecord[];
  predictions: readonly Prediction[];
  now: number;
  request: RiskRequest;
  inScope: (assetId: string) => boolean;
}): RiskMatrix {
  const { world, now, request } = input;
  const from = now - FAILURE_HISTORY_YEARS * YEAR;
  const counts = new Map<string, number>();
  for (const f of input.failures) {
    if (Date.parse(f.failedAt) >= from) counts.set(f.assetId, (counts.get(f.assetId) ?? 0) + 1);
  }
  const predicted = new Map<string, number>();
  for (const p of input.predictions) {
    if (p.status === "closed" || p.status === "dismissed") continue;
    predicted.set(p.assetId, Math.max(predicted.get(p.assetId) ?? 0, yearlyFromPrediction(p)));
  }

  const items: RiskMatrixItem[] = [...world.assets.values()]
    .filter((a) => input.inScope(a.data.id))
    .map((a) => {
      const years = Math.max(0.25, (now - Math.max(from, Date.parse(a.data.commissionedAt))) / YEAR);
      const rate = (counts.get(a.data.id) ?? 0) / years;
      const fromHistory = 1 - Math.exp(-rate);
      const fromPrediction = predicted.get(a.data.id) ?? 0;
      const probability = Math.min(0.99, Math.max(fromHistory, fromPrediction));
      return {
        assetId: a.data.id,
        assetName: a.data.name,
        assetClass: a.data.assetClass as AssetClass,
        siteId: a.data.siteId,
        likelihood: likelihoodLevel(probability),
        consequence: a.data.criticality,
        probability: Math.round(probability * 1000) / 1000,
        basis: fromPrediction > fromHistory ? ("prediction" as const) : ("history" as const),
      };
    });

  const cells = [5, 4, 3, 2, 1].flatMap((likelihood) =>
    [1, 2, 3, 4, 5].map((consequence) => ({
      likelihood,
      consequence,
      count: items.filter((i) => i.likelihood === likelihood && i.consequence === consequence).length,
    })),
  );
  const score = (i: RiskMatrixItem) => i.likelihood * i.consequence + i.probability; // probability breaks ties
  const chosen =
    request.likelihood && request.consequence
      ? items.filter((i) => i.likelihood === request.likelihood && i.consequence === request.consequence)
      : items.filter((i) => riskLevel(i.likelihood, i.consequence) !== "low");
  return {
    cells,
    items: [...chosen].sort((a, b) => score(b) - score(a) || a.assetId.localeCompare(b.assetId)).slice(0, request.likelihood ? 500 : 30),
    total: items.length,
  };
}
