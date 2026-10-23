import { BAD_ACTOR_MIN_FAILURES, BAD_ACTOR_RATIO, FAILURE_HISTORY_YEARS, REPEAT_WINDOW_DAYS } from "@pdm/contracts";
import { beforeAll, describe, expect, it } from "vitest";
import { createMockBackend, type MockBackend } from "./backend";
import { DAY } from "./clock";
import { allFailures } from "./reliability";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);

let b: MockBackend;
beforeAll(() => {
  b = createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "maintenance_planner" });
});

describe("failure history", () => {
  it("covers five years, with ISO 14224 codes the class can actually have", () => {
    const all = allFailures(b.world, b.workOrders);
    expect(all.length).toBeGreaterThan(1000);
    const oldest = Math.min(...all.map((f) => Date.parse(f.failedAt)));
    expect(START - oldest).toBeLessThanOrEqual(FAILURE_HISTORY_YEARS * 365.25 * DAY);
    expect(START - oldest).toBeGreaterThan((FAILURE_HISTORY_YEARS - 0.5) * 365.25 * DAY);
    // A PV string doesn't vibrate; it loses output or breaks.
    expect(all.filter((f) => f.assetClass === "pv_string").every((f) => ["LOO", "BRD"].includes(f.mode))).toBe(true);
  });

  it("is the same every time for the same seed", () => {
    const again = createMockBackend({ seed: 42, startTime: START, realNow: () => 0 });
    expect(allFailures(again.world, again.workOrders).slice(0, 50)).toEqual(allFailures(b.world, b.workOrders).slice(0, 50));
  });

  it("marks a repeat when the same mode fails again soon on the same asset", () => {
    const all = allFailures(b.world, b.workOrders);
    const repeats = all.filter((x) => x.repeat);
    expect(repeats.length).toBeGreaterThan(0);
    for (const f of repeats.slice(0, 30)) {
      const earlier = all.filter((x) => x.assetId === f.assetId && x.mode === f.mode && x.failedAt < f.failedAt).at(-1)!;
      expect(Date.parse(f.failedAt) - Date.parse(earlier.failedAt)).toBeLessThanOrEqual(REPEAT_WINDOW_DAYS * DAY);
    }
  });

  it("adds corrective work closed out in this session", () => {
    const wo = b.request("workOrders.list", { status: ["in_progress"], type: ["corrective"], limit: 1 }).items[0]!;
    const checklist = b
      .request("workOrders.get", { workOrderId: wo.id })
      .checklist.map((i) => ({ itemId: i.id, done: true, value: i.kind === "reading" ? 3 : null }));
    b.request("workOrders.closeOut", {
      workOrderId: wo.id,
      failureMode: "ELP",
      cause: "1.1",
      remedy: "replace",
      findings: "Mechanical seal leaking; replaced.",
      laborHours: 4,
      predictionVerdict: null,
      checklist,
    });
    const record = b.request("assets.failures", { assetId: wo.assetId }).failures.find((f) => f.workOrderId === wo.id)!;
    expect(record.source).toBe("work_order");
    expect(record.mode).toBe("ELP");
    expect(record.repairHours).toBe(4);
  });
});

describe("reliability KPIs", () => {
  it("follow their definitions", () => {
    const r = b.request("reliability.summary", { years: 1 });
    const k = r.kpis;
    // Calendar hours: every asset, from a year ago (or since it was commissioned) to now.
    const from = START - 365.25 * DAY;
    const calendar = [...b.world.assets.values()].reduce(
      (s, a) => s + (START - Math.max(from, Date.parse(a.data.commissionedAt))) / 3_600_000,
      0,
    );
    // MTBF = operating hours ÷ failures, where operating = calendar − downtime.
    expect(k.mtbfHours!).toBeCloseTo((calendar - k.downtimeHours) / k.failures, -1);
    expect(k.availabilityPct).toBeCloseTo((100 * (calendar - k.downtimeHours)) / calendar, 1);
    expect(r.byClass.reduce((s, c) => s + c.failures, 0)).toBe(k.failures);
    expect(r.monthly.reduce((s, m) => s + m.failures, 0)).toBe(k.failures);
  });

  it("a longer period has more failures and a similar rate", () => {
    const one = b.request("reliability.summary", { years: 1 }).kpis;
    const five = b.request("reliability.summary", { years: 5 }).kpis;
    expect(five.failures).toBeGreaterThan(one.failures * 3);
    expect(five.failureRatePerYear / one.failureRatePerYear).toBeGreaterThan(0.6);
    expect(five.failureRatePerYear / one.failureRatePerYear).toBeLessThan(1.6);
  });

  it("ranks failure modes biggest first and adds up to 100 %", () => {
    for (const paretoBy of ["failures", "downtime"] as const) {
      const { pareto } = b.request("reliability.summary", { years: 3, paretoBy });
      const value = (p: (typeof pareto)[number]) => (paretoBy === "failures" ? p.failures : p.downtimeHours);
      for (let i = 1; i < pareto.length; i++) expect(value(pareto[i - 1]!)).toBeGreaterThanOrEqual(value(pareto[i]!));
      expect(pareto.at(-1)!.cumulativePct).toBeCloseTo(100, 0);
    }
  });

  it("finds bad actors by their rate against their class", () => {
    const { badActors } = b.request("reliability.summary", { years: 5 });
    expect(badActors.length).toBeGreaterThan(0);
    for (const a of badActors) {
      expect(a.failures).toBeGreaterThanOrEqual(BAD_ACTOR_MIN_FAILURES);
      expect(a.ratioToClass).toBeGreaterThanOrEqual(BAD_ACTOR_RATIO);
    }
  });

  it("narrows to one class, but still lists every class", () => {
    const r = b.request("reliability.summary", { years: 1, assetClass: "pump" });
    expect(r.kpis.failures).toBe(r.byClass.find((c) => c.assetClass === "pump")!.failures);
    expect(r.byClass.length).toBeGreaterThan(10);
    expect(r.badActors.every((a) => a.assetClass === "pump")).toBe(true);
  });

  it("follows the scope", () => {
    const all = b.request("reliability.summary", { years: 1 }).kpis;
    const one = b.request("reliability.summary", { years: 1, scopeId: "CBC" }).kpis;
    expect(one.assets).toBeLessThan(all.assets);
    expect(one.failures).toBeLessThan(all.failures);
  });

  it("compares an asset with its class", () => {
    const r = b.request("assets.failures", { assetId: "CBC-GT-101" });
    expect(r.classKpis.assets).toBe(11);
    expect(r.failures.every((f) => f.assetId === "CBC-GT-101")).toBe(true);
    for (let i = 1; i < r.failures.length; i++) expect(r.failures[i - 1]!.failedAt >= r.failures[i]!.failedAt).toBe(true);
  });
});
