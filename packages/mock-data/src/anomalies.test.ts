import { ANOMALY_WATCH_LEVEL } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";

const START = Date.UTC(2026, 9, 10, 8);
const backend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "condition_analyst" });

describe("fleet anomaly view", () => {
  it("puts every asset in exactly one state, matching its score", () => {
    const b = backend();
    const fleet = b.request("anomalies.fleet", { limit: 500 });
    const assets = b.request("assets.list", { limit: 500 }).total;
    expect(fleet.total).toBe(assets);
    expect(Object.values(fleet.counts).reduce((a, n) => a + n, 0)).toBe(assets);
    for (const row of fleet.items) {
      if (row.score === null) expect(row.state, row.assetId).toBe("no_data");
      else if (row.score >= row.threshold) expect(row.state, row.assetId).toBe("anomalous");
      else if (row.score >= ANOMALY_WATCH_LEVEL) expect(row.state, row.assetId).toBe("rising");
      expect(row.trend, row.assetId).toHaveLength(24);
    }
    expect(fleet.counts.anomalous).toBeGreaterThan(0);
  });

  it("tells the same story as the predictions: same assets, same sensors", () => {
    const b = backend();
    const anomalous = b.request("anomalies.fleet", { state: ["anomalous"], limit: 500 }).items;
    for (const row of anomalous) {
      expect(row.aboveSince).not.toBeNull();
      // The score wobbles, so it can poke over the line a little before the model raises a
      // prediction (a real model waits for an anomaly to persist). Allow that for under a day.
      if (row.predictionId === null) {
        expect(START - Date.parse(row.aboveSince!), `${row.assetId} has been anomalous for a day with no prediction`).toBeLessThan(
          24 * 3_600_000,
        );
        continue;
      }
      const prediction = b.request("predictions.get", { predictionId: row.predictionId! });
      expect(row.contributions.map((c) => c.tagId)).toEqual(prediction.contributions.slice(0, 5).map((c) => c.tagId));
      expect(Date.parse(row.aboveSince!)).toBeLessThanOrEqual(START);
    }
  });

  it("sorts the most unusual first, filters by state, and searches by name or id", () => {
    const b = backend();
    const scores = b.request("anomalies.fleet", { limit: 500 }).items.map((r) => r.score ?? -1);
    expect(scores).toEqual([...scores].sort((x, y) => y - x));

    const rising = b.request("anomalies.fleet", { state: ["rising"], limit: 500 });
    expect(rising.items.every((r) => r.state === "rising")).toBe(true);
    expect(rising.total).toBe(rising.counts.rising);

    const one = b.request("anomalies.fleet", { search: "cbc-gt-101", limit: 10 });
    expect(one.items.map((r) => r.assetId)).toContain("CBC-GT-101");
  });

  it("names no sensors when nothing stands out", () => {
    const normal = backend().request("anomalies.fleet", { state: ["normal"], limit: 500 }).items;
    for (const row of normal) expect(row.contributions, row.assetId).toEqual([]);
  });
});
