import { DECLINE_FORECAST_DAYS, DECLINE_HISTORY_DAYS, barlowThicknessMm } from "@pdm/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { createMockBackend, type MockBackend } from "./backend";
import { DAY } from "./clock";
import { fitExponential } from "./oil-gas";
import { declinePerYear, wellFactor } from "./signals";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);

let b: MockBackend;
beforeAll(() => {
  b = createMockBackend({ seed: 42, startTime: START, realNow: () => 0 });
});

const view = <S extends "upstream" | "midstream" | "downstream">(segment: S) => {
  const v = b.request("operations.oilGas", { segment }).view;
  if (v.segment !== segment) throw new Error(`expected ${segment}`);
  return v as Extract<typeof v, { segment: S }>;
};

describe("decline curve fitting", () => {
  it("recovers a known exponential decline exactly", () => {
    const points = Array.from({ length: 50 }, (_, day) => ({ day, q: 100 * Math.exp(-0.002 * day) }));
    const f = fitExponential(points)!;
    expect(f.b).toBeCloseTo(-0.002, 8);
    expect(Math.exp(f.a)).toBeCloseTo(100, 6);
    expect(f.r2).toBeCloseTo(1, 8);
  });

  it("ignores days without production", () => {
    expect(
      fitExponential([
        { day: 0, q: 0 },
        { day: 1, q: 0 },
      ]),
    ).toBeNull();
  });
});

describe("upstream", () => {
  it("a well makes less as the months go by", () => {
    // (One reading is too noisy to check this, so check the decline factor the rates use.)
    const well = b.world.assets.get("PBU-WH-101")!;
    const then = wellFactor(b.world, well, START - 90 * DAY, false);
    const now = wellFactor(b.world, well, START, false);
    expect(then / now).toBeCloseTo(Math.exp((declinePerYear(well) * 90) / 365.25), 6);
  });

  it("fits the field's decline and forecasts it", () => {
    const v = view("upstream");
    expect(v.production).toHaveLength(DECLINE_HISTORY_DAYS + DECLINE_FORECAST_DAYS);
    expect(v.production.slice(DECLINE_HISTORY_DAYS).every((p) => p.actual === null)).toBe(true);
    expect(v.fit!.r2).toBeGreaterThan(0.8);
    expect(v.fit!.declinePctPerYear).toBeGreaterThan(5);
    expect(v.fit!.declinePctPerYear).toBeLessThan(40);
  });

  it("a failed pump shuts its well in, and the lost oil is counted", () => {
    const v = view("upstream");
    const well = v.wells.find((w) => w.liftAssetId === "PBU-ESP-103")!;
    expect(well.oilRate!).toBeLessThan(0.5);
    expect(well.lostOilRate).toBeGreaterThan(5);
    expect(v.esps.find((e) => e.assetId === "PBU-ESP-103")!.diagnosis).toBe("stopped");
    expect(v.lostOilRate).toBeGreaterThanOrEqual(well.lostOilRate);
  });

  it("reads an overheating pump motor from its sensors", () => {
    const esp = view("upstream").esps.find((e) => e.assetId === "PBU-ESP-107")!;
    expect(esp.diagnosis).toBe("motor_hot");
    expect(esp.wellId).toMatch(/^PBU-WH-/);
  });
});

describe("midstream", () => {
  it("uses Barlow's formula for the minimum wall", () => {
    // 7.2 MPa × 610 mm ÷ (2 × 448 MPa × 0.72) = 6.81 mm
    expect(barlowThicknessMm()).toBeCloseTo(6.81, 2);
    expect(view("midstream").requiredWallMm).toBeCloseTo(6.81, 2);
  });

  it("works out remaining life from the worse of the two corrosion rates", () => {
    for (const p of view("midstream").pipelines) {
      const i = p.integrity!;
      expect(i.rate).toBeCloseTo(Math.max(i.longTermRate, i.shortTermRate ?? 0), 3);
      expect(i.remainingLifeYears!).toBeCloseTo((i.wallMm - i.requiredMm) / i.rate, 0);
    }
  });

  it("flags the corroding segment and lays the route out end to end", () => {
    const v = view("midstream");
    const bad = v.pipelines.find((p) => p.assetId === "GCM-PL-142")!;
    expect(bad.integrity!.status).toBe("act");
    v.pipelines.forEach((p, i) => i > 0 && expect(p.kmFrom).toBe(v.pipelines[i - 1]!.kmTo));
  });

  it("warns about a compressor near surge", () => {
    expect(view("midstream").compressors.find((c) => c.assetId === "GCM-CMP-105")!.flag).toBe("surge_close");
  });
});

describe("downstream", () => {
  it("forecasts when a fouling exchanger needs cleaning", () => {
    const v = view("downstream");
    const worst = v.exchangers[0]!;
    expect(worst.trendPtsPer30d!).toBeLessThan(0);
    expect(worst.daysToClean).not.toBeNull();
    // Clean ones aren't falling, so there's no date.
    expect(v.exchangers.some((e) => e.daysToClean === null)).toBe(true);
    expect(worst.history).toHaveLength(30);
  });

  it("schedules inspections by the codes' rules", () => {
    const v = view("downstream");
    const max = { api_510: 10, api_653: 20, ili: 7, api_576: 5 } as const;
    for (const i of v.inspections) {
      expect(i.intervalYears, i.assetId).toBeLessThanOrEqual(max[i.code]);
      if (i.basis === "half_life") expect(i.intervalYears).toBeCloseTo(Math.max(0.5, i.remainingLifeYears! / 2), 0);
      const due = Date.parse(i.nextDueAt);
      expect(i.status === "overdue").toBe(due < START);
    }
    // Soonest first.
    expect([...v.inspections].sort((a, b) => a.nextDueAt.localeCompare(b.nextDueAt))).toEqual(v.inspections);
    expect(v.inspections.some((i) => i.status === "overdue")).toBe(true);
  });
});

describe("Asset 360 performance for oil & gas equipment", () => {
  it("is per class", () => {
    const kind = (assetId: string) => b.request("assets.performance", { assetId }).kind;
    expect(kind("PBU-WH-101")).toBe("well");
    expect(kind("PBU-ESP-107")).toBe("esp");
    expect(kind("GCM-CMP-105")).toBe("compressor");
    expect(kind("RKR-HX-118")).toBe("exchanger");
    expect(kind("GCM-PL-142")).toBe("integrity");
    expect(kind("RKR-PSV-101")).toBe("integrity");
  });
});
