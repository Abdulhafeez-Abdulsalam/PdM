import { likelihoodLevel, riskLevel } from "@pdm/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { createMockBackend, type MockBackend } from "./backend";
import { Rng } from "./random";
import { fitWeibull, gamma, medianRanks } from "./weibull";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);

let b: MockBackend;
beforeAll(() => {
  b = createMockBackend({ seed: 42, startTime: START, realNow: () => 0 });
});

/** n Weibull lives, each cut off ("suspended") at a random inspection time if it's still running then. */
function sample(beta: number, eta: number, n: number, seed: number) {
  const rng = new Rng(seed);
  const failures: number[] = [];
  const suspensions: number[] = [];
  for (let i = 0; i < n; i++) {
    const life = eta * Math.pow(-Math.log(1 - rng.next()), 1 / beta);
    const cutoff = 2.5 * eta * rng.next();
    if (life <= cutoff) failures.push(life);
    else suspensions.push(cutoff);
  }
  return { failures, suspensions };
}

describe("the maths", () => {
  it("Γ matches known values", () => {
    expect(gamma(5)).toBeCloseTo(24, 8);
    expect(gamma(0.5)).toBeCloseTo(Math.sqrt(Math.PI), 8);
    expect(gamma(1 + 1 / 2)).toBeCloseTo(Math.sqrt(Math.PI) / 2, 8);
  });

  it("recovers β and η from data with a known answer, suspensions and all", () => {
    for (const [beta, eta] of [
      [0.7, 300],
      [1, 1000],
      [2.5, 2000],
    ] as const) {
      const { failures, suspensions } = sample(beta, eta, 800, 7);
      expect(suspensions.length).toBeGreaterThan(50);
      const fit = fitWeibull(failures, suspensions)!;
      expect(fit.beta / beta, `β for ${beta}`).toBeGreaterThan(0.9);
      expect(fit.beta / beta, `β for ${beta}`).toBeLessThan(1.1);
      expect(fit.eta / eta, `η for ${eta}`).toBeGreaterThan(0.9);
      expect(fit.eta / eta, `η for ${eta}`).toBeLessThan(1.1);
    }
  });

  it("ignoring suspensions would get it badly wrong (why they matter)", () => {
    const { failures, suspensions } = sample(2, 1000, 800, 11);
    const withThem = fitWeibull(failures, suspensions)!;
    const without = fitWeibull(failures, [])!;
    // Only counting the ones that failed makes the item look far shorter-lived than it is.
    expect(without.eta).toBeLessThan(withThem.eta * 0.85);
  });

  it("median ranks without suspensions are Bernard's (i − 0.3) ÷ (n + 0.4)", () => {
    const r = medianRanks([5, 1, 3, 2, 4], []);
    r.forEach((p, i) => expect(p.f).toBeCloseTo((i + 1 - 0.3) / 5.4, 10));
    expect(r.map((p) => p.t)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("Weibull analysis of the failure history", () => {
  // The history is generated from known lives (LIVES in reliability.ts). Fleets aren't uniform,
  // though: each asset's life is ±20 % of its type's and a few bad actors fail ~3× as often, and
  // a mixed population fits a lower β. So: η close, β close or a little low.
  const cases = [
    ["pv_string", "LOO", 1.2, 4500],
    ["inverter", "BRD", 0.8, 2200],
    ["pump", "VIB", 2.2, 1100],
    ["control_valve", "ERO", 1.6, 1200],
  ] as const;
  for (const [assetClass, mode, beta, eta] of cases) {
    it(`recovers ${assetClass} ${mode} (β ${beta}, η ${eta} days)`, () => {
      const r = b.request("reliability.weibull", { assetClass, mode });
      const fit = r.fit!;
      expect(fit.etaDays / eta).toBeGreaterThan(0.8);
      expect(fit.etaDays / eta).toBeLessThan(1.15);
      expect(fit.beta / beta).toBeGreaterThan(0.75);
      expect(fit.beta / beta).toBeLessThan(1.15);
      expect(fit.betaLow).toBeLessThan(fit.beta);
      expect(fit.betaHigh).toBeGreaterThan(fit.beta);
    });
  }

  it("names the pattern from β", () => {
    expect(b.request("reliability.weibull", { assetClass: "inverter", mode: "BRD" }).fit!.pattern).toBe("infant_mortality");
    expect(b.request("reliability.weibull", { assetClass: "pump", mode: "VIB" }).fit!.pattern).toBe("wear_out");
  });

  it("draws a falling reliability curve inside its band, and B10 where 10 % have failed", () => {
    const r = b.request("reliability.weibull", { assetClass: "pump", mode: "VIB" });
    for (let i = 1; i < r.curve.length; i++) expect(r.curve[i]!.reliability).toBeLessThanOrEqual(r.curve[i - 1]!.reliability);
    for (const p of r.curve) {
      expect(p.low).toBeLessThanOrEqual(p.reliability);
      expect(p.high).toBeGreaterThanOrEqual(p.reliability);
    }
    const { beta, etaDays, b10Days } = r.fit!;
    expect(Math.exp(-Math.pow(b10Days / etaDays, beta))).toBeCloseTo(0.9, 2);
  });

  it("defaults to the commonest mode and lists the others", () => {
    const r = b.request("reliability.weibull", { assetClass: "pump" });
    expect(r.mode).toBe(r.modes[0]!.mode);
    expect(r.modes.length).toBeGreaterThan(1);
  });
});

describe("risk matrix", () => {
  it("bands likelihood and risk as documented", () => {
    expect(likelihoodLevel(0.01)).toBe(1);
    expect(likelihoodLevel(0.05)).toBe(2);
    expect(likelihoodLevel(0.49)).toBe(3);
    expect(likelihoodLevel(0.8)).toBe(5);
    expect(riskLevel(2, 2)).toBe("low");
    expect(riskLevel(3, 3)).toBe("medium");
    expect(riskLevel(3, 4)).toBe("high");
    expect(riskLevel(5, 3)).toBe("extreme");
  });

  it("places every asset in exactly one of 25 cells", () => {
    const r = b.request("reliability.risk", {});
    expect(r.cells).toHaveLength(25);
    expect(r.cells.reduce((s, c) => s + c.count, 0)).toBe(r.total);
    expect(r.total).toBe(b.world.assets.size);
  });

  it("lists a chosen cell's assets", () => {
    const r = b.request("reliability.risk", { likelihood: 3, consequence: 3 });
    expect(r.items.length).toBe(r.cells.find((c) => c.likelihood === 3 && c.consequence === 3)!.count);
    for (const i of r.items) expect([i.likelihood, i.consequence]).toEqual([3, 3]);
  });

  it("lets an open prediction raise an asset's likelihood", () => {
    const predicted = b.request("predictions.list", { status: ["open"], limit: 1 }).items[0]!;
    const levels = [1, 2, 3, 4, 5];
    const all = levels.flatMap((l) => levels.flatMap((c) => b.request("reliability.risk", { likelihood: l, consequence: c }).items));
    const item = all.find((i) => i.assetId === predicted.assetId)!;
    expect(item.probability).toBeGreaterThanOrEqual(predicted.probability);
  });
});
