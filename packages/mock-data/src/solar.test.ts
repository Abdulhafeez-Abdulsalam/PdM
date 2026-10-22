import { INVERTER_FLAG_PCT, STRING_FLAG_PCT } from "@pdm/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { createMockBackend, type MockBackend } from "./backend";
import { DAY, HOUR } from "./clock";
import { ApiFailure } from "./errors";
import { DC_AC_RATIO, pvBreakdown, soilingState } from "./signals";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);

let b: MockBackend;
beforeAll(() => {
  b = createMockBackend({ seed: 42, startTime: START, realNow: () => 0 });
});

describe("the PV model", () => {
  it("makes nothing at night and clips at the inverter's rating", () => {
    const inv = b.world.assets.get("PCS-INV-101")!;
    // Pecos is UTC−6: midnight local = 06:00 UTC.
    expect(pvBreakdown(b.world, inv, Date.UTC(2026, 9, 9, 6)).ac).toBe(0);
    let clipped = 0;
    for (let t = START - 7 * DAY; t < START; t += HOUR) {
      const p = pvBreakdown(b.world, inv, t);
      expect(p.ac).toBeLessThanOrEqual(p.acRated);
      expect(p.dcRated).toBeCloseTo(p.acRated * DC_AC_RATIO, 6);
      if (p.beforeClip > p.acRated) clipped++;
    }
    expect(clipped).toBeGreaterThan(0); // some clear, cool noons hit the limit
  });

  it("soiling builds up steadily and drops when the panels are cleaned", () => {
    const s = soilingState(b.world, "SPV", START);
    const before = soilingState(b.world, "SPV", s.lastCleaned - HOUR);
    const after = soilingState(b.world, "SPV", s.lastCleaned + HOUR);
    expect(before.pct).toBeGreaterThan(after.pct + 5);
    expect(soilingState(b.world, "SPV", s.lastCleaned + 11 * DAY).pct - after.pct).toBeCloseTo(s.ratePctPerDay * 11, 1);
  });
});

describe("solar plants", () => {
  it("lists the solar plants with a believable performance ratio", () => {
    const r = b.request("operations.solar", {});
    expect(r.plants.map((p) => p.siteId).sort()).toEqual(["KSF", "PCS", "SPV", "WSS"]);
    for (const p of r.plants) {
      expect(p.performanceRatioPct!, p.siteId).toBeGreaterThan(70);
      expect(p.performanceRatioPct!, p.siteId).toBeLessThan(92);
      expect(p.dcCapacityKw).toBeGreaterThan(p.acCapacityKw);
    }
  });

  it("accounts for every kWh: sunlight minus the losses is what was delivered", () => {
    for (const siteId of ["PCS", "SPV", "WSS"]) {
      const { waterfall } = b.request("operations.solar", { siteId });
      const w = waterfall!;
      expect(w.sunKwh - w.losses.reduce((s, l) => s + l.kwh, 0), siteId).toBe(w.actualKwh);
      // The model explains nearly everything: "other" is small.
      const other = w.losses.find((l) => l.step === "other")!.kwh;
      expect(Math.abs(other) / w.sunKwh, siteId).toBeLessThan(0.01);
    }
  });

  it("dust costs most where it's dustiest", () => {
    const loss = (siteId: string) => {
      const w = b.request("operations.solar", { siteId }).waterfall!;
      return w.losses.find((l) => l.step === "soiling")!.kwh / w.sunKwh;
    };
    expect(loss("WSS")).toBeGreaterThan(loss("PCS"));
  });

  it("flags the inverter with failing cooling and the weak string", () => {
    const r = b.request("operations.solar", { siteId: "PCS" });
    const inv = r.inverters.find((i) => i.assetId === "PCS-INV-117")!;
    expect(inv.performancePct!).toBeLessThan(INVERTER_FLAG_PCT);
    expect(r.strings[0]!.assetId).toBe("PCS-STR-150");
    for (const s of r.strings) expect(s.pctOfSisters).toBeLessThan(STRING_FLAG_PCT);
    // Strings switched off for maintenance aren't "underperforming".
    for (const s of r.strings) expect(b.world.assets.get(s.assetId)!.staticStatus).toBe("normal");
  });

  it("shows batteries, with the drifting one's cells further apart", () => {
    const { bess } = b.request("operations.solar", { siteId: "PCS" });
    const healthy = bess.find((x) => x.assetId === "PCS-BESS-101")!;
    const drifting = bess.find((x) => x.assetId === "PCS-BESS-102")!;
    expect(drifting.cellSpreadMv!).toBeGreaterThan(healthy.cellSpreadMv!);
    expect(drifting.sohPct!).toBeLessThan(healthy.sohPct!);
    expect(healthy.soc).toHaveLength(48);
  });

  it("advises cleaning on the cheapest rhythm", () => {
    for (const siteId of ["PCS", "SPV", "WSS"]) {
      const a = b.request("operations.solar", { siteId }).soiling!;
      const since = (START - Date.parse(a.lastCleanedAt)) / DAY;
      // Both are rounded to whole days separately, so allow a day either way.
      expect(Math.abs(a.cleanInDays - Math.max(0, a.optimalIntervalDays - since)), siteId).toBeLessThanOrEqual(1);
      expect(a.recommendation === "clean_now").toBe(a.cleanInDays === 0);
      expect(a.cleaningCost).toBeGreaterThan(0);
    }
    // Cheap robot cleaning and fast dust make for frequent washes; Pecos's slow dust and dear washes, rare ones.
    const spv = b.request("operations.solar", { siteId: "SPV" }).soiling!;
    const pcs = b.request("operations.solar", { siteId: "PCS" }).soiling!;
    expect(spv.optimalIntervalDays).toBeLessThan(pcs.optimalIntervalDays);
  });

  it("refuses a plant that isn't solar", () => {
    expect(() => b.request("operations.solar", { siteId: "CBC" })).toThrowError(ApiFailure);
  });
});

describe("Asset 360 performance for solar equipment", () => {
  it("is per class", () => {
    expect(b.request("assets.performance", { assetId: "PCS-INV-117" }).kind).toBe("inverter");
    expect(b.request("assets.performance", { assetId: "PCS-STR-150" }).kind).toBe("pv_string");
    expect(b.request("assets.performance", { assetId: "PCS-BESS-102" }).kind).toBe("bess");
  });

  it("compares a string with its sisters hour by hour", () => {
    const p = b.request("assets.performance", { assetId: "PCS-STR-150" });
    if (p.kind !== "pv_string") throw new Error("expected a string");
    expect(p.string.power).toHaveLength(48);
    const sunny = p.string.power.filter((x) => (x.sistersMedianKw ?? 0) > 5);
    expect(sunny.length).toBeGreaterThan(0);
    for (const x of sunny) expect(x.kw!).toBeLessThan(x.sistersMedianKw!);
  });
});
