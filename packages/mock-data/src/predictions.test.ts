import { describe, expect, it } from "vitest";
import { ANOMALY_THRESHOLD, anomalyScore } from "./anomaly";
import { createMockBackend } from "./backend";
import { DAY, HOUR, iso } from "./clock";
import { ApiFailure } from "./errors";
import { DETECTION_PROGRESS, timeAtProgress } from "./faults";

const START = Date.UTC(2026, 9, 10, 8);
const makeBackend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0 });

describe("prediction console queries", () => {
  it("sorts by money at risk (probability × cost if it fails) by default", () => {
    const { items } = makeBackend().request("predictions.list", { limit: 20 });
    const exposure = items.map((p) => p.probability * p.recommendedAction.failureCost.amount);
    expect(exposure).toEqual([...exposure].sort((a, b) => b - a));
  });

  it("filters by minimum probability and remaining life", () => {
    const { items } = makeBackend().request("predictions.list", { minProbability: 0.7, maxRulDays: 30, limit: 500 });
    expect(items.length).toBeGreaterThan(0);
    for (const p of items) {
      expect(p.probability).toBeGreaterThanOrEqual(0.7);
      expect(p.rul!.p50Days).toBeLessThanOrEqual(30);
    }
  });
});

describe("feedback loop", () => {
  it("records feedback and moves the precision figure", () => {
    const b = makeBackend();
    const before = b.request("predictions.feedbackSummary", {});
    const p = b.request("predictions.list", { status: ["open"], limit: 1 }).items[0]!;

    const updated = b.request("predictions.feedback", {
      predictionId: p.id,
      feedback: "false_positive",
      comment: "Sensor fault, not bearing wear",
    });
    expect(updated.feedback).toBe("false_positive");

    const after = b.request("predictions.feedbackSummary", {});
    expect(after.falsePositive).toBe(before.falsePositive + 1);
    expect(after.precision!).toBeLessThan(before.precision!);
  });

  it("requires a reason to dismiss, and logs it", () => {
    const b = makeBackend();
    const p = b.request("predictions.list", { status: ["open"], limit: 1 }).items[0]!;
    expect(() => b.request("predictions.triage", { predictionId: p.id, action: "dismiss" })).toThrowError(ApiFailure);

    const dismissed = b.request("predictions.triage", { predictionId: p.id, action: "dismiss", reason: "Duplicate of PRED-0007" });
    expect(dismissed.status).toBe("dismissed");
    const events = b.request("events.list", { assetId: p.assetId, from: iso(START - DAY), to: iso(START + HOUR) }).items;
    expect(events.some((e) => e.detail === "Duplicate of PRED-0007")).toBe(true);

    expect(b.request("predictions.triage", { predictionId: p.id, action: "reopen" }).status).toMatch(/open|actioned/);
  });
});

describe("anomaly score", () => {
  it("crosses the threshold around the moment the prediction is raised", () => {
    const b = makeBackend();
    const fault = b.world.faults.find((f) => timeAtProgress(f, DETECTION_PROGRESS) < START - 5 * DAY && f.asset.staticStatus === "normal")!;
    const detection = timeAtProgress(fault, DETECTION_PROGRESS);
    const span = fault.failAt - fault.start;
    expect(anomalyScore(b.world, fault.asset, detection - 0.15 * span)!).toBeLessThan(ANOMALY_THRESHOLD);
    expect(anomalyScore(b.world, fault.asset, detection + 0.15 * span)!).toBeGreaterThan(ANOMALY_THRESHOLD);
  });

  it("returns history with the threshold, ≤ maxPoints", () => {
    const b = makeBackend();
    const res = b.request("anomalies.history", { assetId: "CBC-GT-101", from: iso(START - 30 * DAY), to: iso(START), maxPoints: 200 });
    expect(res.threshold).toBe(ANOMALY_THRESHOLD);
    expect(res.points.length).toBeGreaterThan(100);
    expect(res.points.length).toBeLessThanOrEqual(200);
    // A healthy turbine stays well below the threshold.
    expect(Math.max(...res.points.map((p) => p.score))).toBeLessThan(ANOMALY_THRESHOLD);
  });
});
