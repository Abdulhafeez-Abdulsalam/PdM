import { describe, expect, it } from "vitest";
import { deferral, failedBy, failsWithin, normalCdf } from "./what-if";

const rul = { p10Days: 13, p50Days: 20, p90Days: 29 };

describe("what-if arithmetic", () => {
  it("the normal distribution is right at known points", () => {
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.2816)).toBeCloseTo(0.9, 3);
    expect(normalCdf(-1.96)).toBeCloseTo(0.025, 3);
  });

  it("the fitted remaining life passes through the prediction's own 10 / 50 / 90 % points", () => {
    expect(failedBy(rul, 20)).toBeCloseTo(0.5, 3);
    expect(failedBy(rul, 13)).toBeCloseTo(0.1, 1);
    expect(failedBy(rul, 29)).toBeCloseTo(0.9, 1);
    expect(failedBy(rul, 0)).toBe(0);
  });

  it("a machine that has survived longer is more likely to fail in the next few days", () => {
    expect(failsWithin(rul, 15, 5)).toBeGreaterThan(failsWithin(rul, 0, 5));
    expect(failsWithin(rul, 0, 20)).toBeCloseTo(0.5, 3);
  });

  it("deferring costs the chance of failure times what a failure adds over the repair", () => {
    const prediction = {
      rul: { ...rul, estimatedAt: "2026-10-28T08:00:00Z" },
      recommendedAction: {
        summary: "Replace bearing",
        actBy: "2026-11-05T08:00:00Z",
        interventionCost: { amount: 10_000, currency: "USD" },
        failureCost: { amount: 210_000, currency: "USD" },
      },
    };
    const now = deferral(prediction, 0, 0)!;
    expect(now).toMatchObject({ chance: 0, expectedCost: 10_000, extra: 0 });
    const month = deferral(prediction, 0, 30)!;
    expect(month.extra).toBeCloseTo(month.chance * 200_000, 6);
    expect(month.expectedCost).toBeCloseTo(10_000 + month.extra, 6);
    expect(deferral({ ...prediction, rul: null }, 0, 10)).toBeNull();
  });
});
