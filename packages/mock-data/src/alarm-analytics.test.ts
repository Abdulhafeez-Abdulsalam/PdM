import { describe, expect, it } from "vitest";
import { alarmAnalytics, type Activation } from "./alarm-analytics";
import { createMockBackend } from "./backend";
import { MINUTE } from "./clock";

const NOW = Date.UTC(2026, 9, 10, 8);
const at = (minutesAgo: number, over: Partial<Activation> = {}): Activation => ({
  t: NOW - minutesAgo * MINUTE,
  assetId: "A-1",
  siteId: "S1",
  tagId: "A-1.TEMP",
  priority: "p4",
  message: "Temperature high",
  ...over,
});
const run = (log: Activation[]) =>
  alarmAnalytics({
    log,
    alarms: [],
    sites: [
      { id: "S1", name: "Site one" },
      { id: "S2", name: "Site two" },
    ],
    inScope: () => true,
    window: "24h",
    now: NOW,
  });

describe("alarm analytics arithmetic", () => {
  it("counts a flood when one control room gets more than 10 alarms in 10 minutes", () => {
    // 11 alarms between 29 and 21 minutes ago: all in the 07:30–07:40 period (now is 08:00).
    const flood = Array.from({ length: 11 }, (_, i) => at(29 - i * 0.8, { tagId: `A-1.T${i}` }));
    const r = run(flood);
    const s1 = r.sites.find((s) => s.siteId === "S1")!;
    expect(s1.peakPer10Min).toBe(11);
    expect(s1.floodPercent).toBeCloseTo((1 / 144) * 100, 1); // one 10-minute period out of 144 in a day
    expect(r.sites.find((s) => s.siteId === "S2")!.total).toBe(0); // a quiet control room still has a row
  });

  it("finds chattering: 3 soundings within 5 minutes is one episode", () => {
    const r = run([at(60), at(59), at(58), at(30), at(20), at(10)]);
    expect(r.chattering).toHaveLength(1);
    expect(r.chattering[0]).toMatchObject({ key: "A-1.TEMP", episodes: 1, count: 6 });
  });

  it("ranks bad actors and works out their share", () => {
    const pressure = { tagId: "A-1.PRES", message: "Pressure high" };
    const log = [
      ...Array.from({ length: 6 }, (_, i) => at(100 + i)),
      at(50, pressure),
      at(45, pressure),
      at(40, { tagId: null, priority: "p3", message: "Predicted wear" }),
    ];
    const r = run(log);
    expect(r.total).toBe(9);
    expect(r.badActors.map((b) => [b.key, b.count, b.sharePercent])).toEqual([
      ["A-1.TEMP", 6, 66.7],
      ["A-1.PRES", 2, 22.2],
      ["A-1:prediction", 1, 11.1],
    ]);
    expect(r.top10SharePercent).toBe(100);
    expect(r.priorities).toEqual({ p1: 0, p2: 0, p3: 1, p4: 8 });
  });

  it("ignores alarms outside the window", () => {
    expect(run([at(25 * 60), at(5)]).total).toBe(1);
  });
});

describe("alarm analytics from the simulation", () => {
  const b = createMockBackend({ seed: 42, startTime: NOW, realNow: () => 0, role: "control_room_operator" });

  it("has a steady week of history, the last day included", () => {
    const week = b.request("alarms.analytics", { window: "7d" });
    const perDay = Array.from({ length: 7 }, (_, i) => week.rate.points.slice(i * 24, i * 24 + 24).reduce((s, p) => s + p.count, 0));
    const mean = perDay.reduce((a, n) => a + n, 0) / 7;
    for (const n of perDay) expect(Math.abs(n - mean) / mean).toBeLessThan(0.25);
    expect(week.rate.bucketMinutes).toBe(60);
    expect(week.rate.points).toHaveLength(7 * 24);
  });

  it("matches the totals across views, and finds the chattering bad actors", () => {
    const day = b.request("alarms.analytics", { window: "24h" });
    expect(day.sites.reduce((s, x) => s + x.total, 0)).toBe(day.total);
    expect(day.rate.points.reduce((s, p) => s + p.count, 0)).toBe(day.total);
    expect(Object.values(day.priorities).reduce((s, n) => s + n, 0)).toBe(day.total);
    expect(day.chattering.length).toBeGreaterThan(0);
    expect(day.badActors[0]!.key).toBe(day.chattering[0]!.key);
    expect(day.shelved).toBe(b.request("alarms.summary", {}).shelved);
  });

  it("narrows to a site", () => {
    const all = b.request("alarms.analytics", { window: "24h" });
    const one = b.request("alarms.analytics", { window: "24h", scopeId: "CBC" });
    expect(one.sites.map((s) => s.siteId)).toEqual(["CBC"]);
    expect(one.total).toBe(all.sites.find((s) => s.siteId === "CBC")!.total);
  });

  it("isn't thrown off by time passing", () => {
    const before = b.request("alarms.analytics", { window: "24h" }).total;
    b.tick(); // advance the simulation a little
    expect(b.request("alarms.analytics", { window: "24h" }).total).toBeGreaterThan(before * 0.8);
  });
});
