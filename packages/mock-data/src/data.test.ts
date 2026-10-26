import { DATA_QUALITY_HOURS, SCAN_MINUTES } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { HOUR } from "./clock";
import { tagValue } from "./signals";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const WINDOWS = (DATA_QUALITY_HOURS * 60) / SCAN_MINUTES;

/** A backend whose clock we move by hand, with chaos mode switched on for the last `chaosHours`. */
function makeBackend(chaosHours = 0) {
  let real = 0;
  const b = createMockBackend({ seed: 42, startTime: START, realNow: () => real, role: "condition_analyst" });
  if (chaosHours > 0) {
    b.chaos.set(true, b.now());
    real += chaosHours * HOUR;
  }
  return b;
}

describe("data quality", () => {
  it("without chaos, only offline assets' tags and stuck tags have issues", () => {
    const b = makeBackend();
    const q = b.request("data.quality", {});
    const tags = [...b.world.tags.values()];
    expect(q.totals.tags).toBe(tags.length);
    const offline = tags.filter((t) => t.asset.staticStatus === "offline").length;
    expect(q.totals.byIssue.no_data).toBe(offline);
    expect(q.totals.byIssue.flatline).toBe(tags.filter((t) => t.flatline && t.asset.staticStatus !== "offline").length);
    expect(q.totals.byIssue.gaps + q.totals.byIssue.bad_quality).toBe(0);
    expect(q.totals.completenessPct).toBeCloseTo((100 * (tags.length - offline)) / tags.length, 1);
    expect(q.worst[0]).toMatchObject({ issue: "no_data", missingPct: 100 });
  });

  it("with chaos on, finds gaps and bad readings, exactly where the readings have them", () => {
    const b = makeBackend(3);
    const q = b.request("data.quality", { scopeId: "CBC" });
    expect(q.totals.byIssue.gaps).toBeGreaterThan(0);
    expect(q.totals.byIssue.bad_quality).toBeGreaterThan(0);
    // Check the scan against the readings themselves, window by window.
    const row = q.worst.find((r) => r.issue === "bad_quality" || r.issue === "gaps")!;
    const tag = b.world.tags.get(row.tagId)!;
    const to = Date.parse(q.to);
    let missing = 0;
    let bad = 0;
    for (let t = Date.parse(q.from); t < to; t += SCAN_MINUTES * 60_000) {
      const r = tagValue(b.world, b.chaos, tag, t);
      if (!r) missing++;
      else if (r.quality === "bad") bad++;
    }
    expect(row.missingPct).toBeCloseTo((100 * missing) / WINDOWS, 1);
    expect(row.badPct).toBeCloseTo((100 * bad) / WINDOWS, 1);
  });

  it("orders sites least complete first", () => {
    const q = makeBackend(2).request("data.quality", {});
    const pcts = q.sites.map((s) => s.completenessPct);
    expect(pcts).toEqual([...pcts].sort((a, b) => a - b));
  });
});

describe("tags and sources", () => {
  it("searches, filters by issue and pages through tags", () => {
    const b = makeBackend();
    const found = b.request("data.tags", { search: "CBC-GT-101.", limit: 50 });
    expect(found.items.length).toBeGreaterThan(3);
    for (const t of found.items) expect(t.id.startsWith("CBC-GT-101.")).toBe(true);
    expect(found.items[0]!.latest).not.toBeNull();
    const dead = b.request("data.tags", { issue: "no_data", limit: 5 });
    expect(dead.total).toBe(b.request("data.quality", {}).totals.byIssue.no_data);
    for (const t of dead.items) expect(t.latest).toBeNull();
    const second = b.request("data.tags", { offset: 5, limit: 5 });
    expect(second.items[0]!.id).toBe(b.request("data.tags", { limit: 10 }).items[5]!.id);
  });

  it("shows the historian degraded while chaos mode is on", () => {
    const calm = makeBackend().request("data.sources", {}).items;
    expect(calm.every((s) => s.status === "connected")).toBe(true);
    const historian = makeBackend(1)
      .request("data.sources", {})
      .items.find((s) => s.kind === "historian")!;
    expect(historian).toMatchObject({ status: "degraded" });
    expect(historian.problem).toMatch(/gaps/);
  });
});
