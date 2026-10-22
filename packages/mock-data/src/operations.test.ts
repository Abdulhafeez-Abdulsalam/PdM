import { HGP_INTERVAL_EOH, WASH_HEAT_RATE_PCT } from "@pdm/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { createMockBackend, type MockBackend } from "./backend";
import { HOUR } from "./clock";
import { ApiFailure } from "./errors";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);

let b: MockBackend;
beforeAll(() => {
  b = createMockBackend({ seed: 42, startTime: START, realNow: () => 0 });
});

describe("gas-to-power plants", () => {
  it("lists the four plants, combined cycle and peaker, with sane figures", () => {
    const r = b.request("operations.power", {});
    expect(r.plants.map((p) => p.siteId).sort()).toEqual(["ANP", "CBC", "EBC", "SHP"]);
    expect(r.plants.find((p) => p.siteId === "SHP")!.kind).toBe("peaker");
    expect(r.plants.find((p) => p.siteId === "CBC")!.kind).toBe("combined_cycle");
    for (const p of r.plants) {
      expect(p.outputKw, p.siteId).toBeLessThanOrEqual(p.capacityKw);
      expect(p.availabilityPct).toBeGreaterThan(0);
      expect(p.availabilityPct).toBeLessThanOrEqual(100);
      expect(p.capacityFactorPct).toBeLessThanOrEqual(p.availabilityPct);
      // Healthy plants make what they're asked for, give or take sensor noise.
      expect(Math.abs(p.outputKw - p.dispatchKw) / p.dispatchKw, p.siteId).toBeLessThan(0.03);
    }
  });

  it("gets more out of its fuel in combined cycle than a gas turbine alone", () => {
    const r = b.request("operations.power", { siteId: "CBC" });
    const plant = r.plants.find((p) => p.siteId === "CBC")!;
    const gt = r.turbines[0]!;
    // The steam turbine adds output without burning anything.
    expect(plant.heatRate!).toBeLessThan(gt.heatRate! * 0.85);
  });

  it("defaults to the first plant and refuses one that isn't in scope", () => {
    expect(b.request("operations.power", {}).siteId).toBe("CBC");
    expect(() => b.request("operations.power", { siteId: "PCS" })).toThrowError(ApiFailure);
  });

  it("shows 48 hours of output and dispatch", () => {
    const { output } = b.request("operations.power", { siteId: "ANP" });
    expect(output).toHaveLength(48);
    expect(Date.parse(output.at(-1)!.t) - Date.parse(output[0]!.t)).toBe(47 * HOUR);
  });
});

describe("gas turbines against their ambient-corrected baseline", () => {
  it("a clean turbine sits on its baseline", () => {
    const t = b.request("operations.power", { siteId: "CBC" }).turbines.find((x) => x.assetId === "CBC-GT-101")!;
    expect(Math.abs(t.heatRateDeviationPct!)).toBeLessThan(0.5);
    expect(t.washRecommended).toBe(false);
  });

  it("a fouled compressor burns more fuel and gets a wash recommendation", () => {
    const t = b.request("operations.power", { siteId: "EBC" }).turbines.find((x) => x.assetId === "EBC-GT-101")!;
    expect(t.heatRateDeviationPct!).toBeGreaterThan(WASH_HEAT_RATE_PCT);
    expect(t.compressorEffDeviationPts!).toBeLessThan(0);
    expect(t.washRecommended).toBe(true);
    expect(b.request("operations.power", {}).plants.find((p) => p.siteId === "EBC")!.washesRecommended).toBe(1);
  });

  it("a water wash shows as a drop back to the baseline", () => {
    const trend = b.request("operations.turbineTrend", { assetId: "ANP-GT-102", days: 14 });
    expect(trend.points).toHaveLength(14 * 24);
    const wash = trend.events.find((e) => e.kind === "water_wash")!;
    expect(wash).toBeDefined();
    const avg = (from: number, to: number) => {
      const xs = trend.points
        .filter((p) => Date.parse(p.t) >= from && Date.parse(p.t) < to)
        .flatMap((p) => (p.heatRateDeviationPct === null ? [] : [p.heatRateDeviationPct]));
      return xs.reduce((s, x) => s + x, 0) / xs.length;
    };
    const at = Date.parse(wash.t);
    expect(avg(at - 12 * HOUR, at)).toBeGreaterThan(1);
    expect(Math.abs(avg(at, at + 12 * HOUR))).toBeLessThan(0.4);
  });

  it("counts equivalent operating hours towards the next inspection", () => {
    const { turbines } = b.request("operations.power", { siteId: "SHP" });
    for (const t of turbines) {
      expect(t.eoh.sinceInspection).toBeLessThanOrEqual(t.eoh.total);
      expect(t.eoh.remaining).toBe(HGP_INTERVAL_EOH - t.eoh.sinceInspection);
    }
    // A daily-start peaker collects starts far faster than a base-load unit.
    const base = b.request("operations.power", { siteId: "CBC" }).turbines[0]!;
    expect(Math.max(...turbines.map((t) => t.eoh.starts / t.eoh.total))).toBeGreaterThan((base.eoh.starts / base.eoh.total) * 5);
  });

  it("only gas turbines have a trend", () => {
    expect(() => b.request("operations.turbineTrend", { assetId: "CBC-ST-101", days: 14 })).toThrowError(ApiFailure);
  });
});

describe("transformer oil analysis", () => {
  it("healthy transformers are condition 1, in the low-temperature corner of the triangle", () => {
    const { transformers } = b.request("operations.power", { siteId: "CBC" });
    for (const tx of transformers) {
      expect(tx.samples[0]!.condition).toBe(1);
      expect(["T1", "T2"]).toContain(tx.samples[0]!.duval!.zone);
    }
  });

  it("a developing hot spot raises the gases and walks towards higher temperatures", () => {
    const dga = b.request("operations.power", { siteId: "ANP" }).transformers.find((x) => x.assetId === "ANP-TX-104")!;
    const [latest] = dga.samples;
    const oldest = dga.samples.at(-1)!;
    expect(latest!.condition).toBeGreaterThanOrEqual(2);
    expect(latest!.duval!.c2h4Pct).toBeGreaterThan(oldest.duval!.c2h4Pct + 10);
    expect(dga.tdcgPerDay!).toBeGreaterThan(0);
    expect(b.request("operations.power", {}).plants.find((p) => p.siteId === "ANP")!.transformersOfConcern).toBe(1);
  });

  it("samples are monthly, newest first", () => {
    const dga = b.request("assets.performance", { assetId: "CBC-TX-101" });
    if (dga.kind !== "transformer") throw new Error("expected a transformer");
    const times = dga.dga.samples.map((s) => Date.parse(s.sampledAt));
    expect(times[0]).toBeLessThanOrEqual(START);
    for (let i = 1; i < times.length; i++) expect(times[i - 1]! - times[i]!).toBe(30 * 24 * HOUR);
  });
});

describe("Asset 360 performance", () => {
  it("is per class", () => {
    expect(b.request("assets.performance", { assetId: "CBC-GT-101" }).kind).toBe("gas_turbine");
    expect(b.request("assets.performance", { assetId: "CBC-TX-101" }).kind).toBe("transformer");
    expect(b.request("assets.performance", { assetId: "CBC-ST-101" }).kind).toBe("none");
  });
});
