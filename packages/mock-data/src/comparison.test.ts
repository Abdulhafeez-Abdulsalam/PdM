import { OUTLIER_SCORE } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { robustSpread } from "./comparison";
import { ApiFailure } from "./errors";

describe("robust spread (median, MAD, modified z-score)", () => {
  it("works the textbook example", () => {
    // median 5; distances 4,3,1,0,1,2,20 → sorted 0,1,1,2,3,4,20 → MAD 2
    const s = robustSpread([1, 2, 4, 5, 6, 7, 25]);
    expect(s.median).toBe(5);
    expect(s.mad).toBe(2);
    expect(s.score(25)).toBeCloseTo((0.6745 * 20) / 2, 6); // 6.7: an outlier
    expect(s.score(7)).toBeCloseTo(0.6745, 6); // not
  });

  it("isn't fooled by the outlier itself, unlike the average", () => {
    const s = robustSpread([10, 10.2, 9.9, 10.1, 9.8, 50]);
    expect(s.median).toBeCloseTo(10.05, 6);
    expect(Math.abs(s.score(50)!)).toBeGreaterThan(OUTLIER_SCORE);
  });

  it("gives no score when the fleet doesn't vary", () => {
    expect(robustSpread([3, 3, 3, 3]).score(3)).toBeNull();
    expect(robustSpread([]).median).toBeNull();
  });
});

describe("fleet comparison", () => {
  const b = createMockBackend({ seed: 42, startTime: Date.UTC(2026, 9, 10, 8), realNow: () => 0 });

  it("ranks a class worst first and flags assets that stand apart", () => {
    const r = b.request("assets.compare", { assetClass: "gas_turbine", measure: "anomaly" });
    expect(r.items).toHaveLength(r.classes.find((c) => c.assetClass === "gas_turbine")!.count);
    const values = r.items.map((i) => i.value ?? -1);
    expect(values).toEqual([...values].sort((x, y) => y - x)); // anomaly: high is worse → highest first
    for (const row of r.items) {
      if (row.outlier) expect(Math.abs(row.deviation!)).toBeGreaterThan(OUTLIER_SCORE);
      else if (row.deviation !== null) expect(Math.abs(row.deviation)).toBeLessThanOrEqual(OUTLIER_SCORE);
    }
  });

  it("an asset with a developing fault stands out from its sisters", () => {
    const anomalous = b.request("anomalies.fleet", { state: ["anomalous"], limit: 500 }).items;
    const pick = anomalous.find((a) => b.request("assets.compare", { assetClass: a.assetClass, measure: "anomaly" }).items.length >= 8)!;
    const r = b.request("assets.compare", { assetClass: pick.assetClass, measure: "anomaly" });
    expect(r.items.find((i) => i.assetId === pick.assetId)?.outlier).toBe("high");
  });

  it("offers every sensor the whole class has, and refuses others", () => {
    const r = b.request("assets.compare", { assetClass: "inverter", measure: "health" });
    const sensors = r.measures.filter((m) => m.id.startsWith("tag:"));
    expect(sensors.length).toBeGreaterThan(0);
    const one = b.request("assets.compare", { assetClass: "inverter", measure: sensors[0]!.id });
    expect(one.measure.quantity).not.toBeNull();
    expect(() => b.request("assets.compare", { assetClass: "inverter", measure: "tag:NOT_A_SENSOR" })).toThrowError(ApiFailure);
  });

  it("compares only running equipment on its sensors", () => {
    const r = b.request("assets.compare", { assetClass: "pump", measure: "tag:BRG1_VIB" });
    for (const row of r.items) if (row.operatingStatus !== "running") expect(row.value, row.assetId).toBeNull();
    expect(r.items.some((row) => row.operatingStatus !== "running")).toBe(true); // the case exists in the data
    // …and so no stopped pump is "unusually low".
    expect(r.items.filter((row) => row.outlier === "low" && row.operatingStatus !== "running")).toEqual([]);
  });

  it("narrows to a scope", () => {
    const all = b.request("assets.compare", { assetClass: "gas_turbine", measure: "health" });
    const one = b.request("assets.compare", { assetClass: "gas_turbine", measure: "health", scopeId: "CBC" });
    expect(one.items.length).toBeLessThan(all.items.length);
    expect(one.items.every((i) => i.siteId === "CBC")).toBe(true);
  });
});
