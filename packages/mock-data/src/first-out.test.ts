import { BURST_MINUTES } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { HOUR, MINUTE } from "./clock";

const START = Date.UTC(2026, 9, 10, 8);

function setup() {
  let real = START;
  const backend = createMockBackend({ seed: 42, startTime: START, realNow: () => real, role: "control_room_operator" });
  const advance = (ms: number) => {
    const end = real + ms;
    while (real < end) {
      real = Math.min(end, real + 10 * MINUTE);
      backend.tick();
    }
  };
  return { backend, advance };
}

describe("first-out", () => {
  it("marks the earliest alarm of a burst on one asset, and what followed it", () => {
    const { backend, advance } = setup();
    advance(48 * HOUR);
    const all = backend.request("alarms.list", { states: ["active_unacked", "active_acked", "rtn_unacked", "cleared"], limit: 500 }).items;
    const firsts = all.filter((a) => a.firstOut);
    expect(firsts.length).toBeGreaterThan(0);
    for (const first of firsts) {
      const followers = all.filter((a) => a.followsAlarmId === first.id);
      for (const f of followers) {
        expect(f.assetId).toBe(first.assetId);
        expect(Date.parse(f.raisedAt)).toBeGreaterThanOrEqual(Date.parse(first.raisedAt));
        expect(f.firstOut).toBeNull();
      }
      if (followers.length > 0) {
        const times = [first, ...followers].map((a) => Date.parse(a.raisedAt)).sort((x, y) => x - y);
        for (let i = 1; i < times.length; i++) expect(times[i]! - times[i - 1]!).toBeLessThanOrEqual(BURST_MINUTES * MINUTE);
      }
    }
  }, 60_000);

  it("can leave out the alarms that followed, and only those", () => {
    const { backend, advance } = setup();
    advance(48 * HOUR);
    const states = ["active_unacked", "active_acked", "rtn_unacked", "cleared"] as const;
    const everything = backend.request("alarms.list", { states: [...states], limit: 500 });
    const causes = backend.request("alarms.list", { states: [...states], limit: 500, hideFollowers: true });
    expect(causes.total).toBeLessThan(everything.total);
    expect(causes.items.some((a) => a.followsAlarmId)).toBe(false);
    expect(causes.items.some((a) => a.firstOut)).toBe(true);
  }, 60_000);

  it("says so on the timeline", () => {
    const { backend, advance } = setup();
    advance(24 * HOUR);
    const to = new Date(START + 24 * HOUR).toISOString();
    const from = new Date(START - HOUR).toISOString();
    const events = backend.request("events.list", { from, to, kinds: ["alarm"], limit: 500 }).items;
    expect(events.some((e) => e.detail?.includes("first out"))).toBe(true);
  }, 60_000);
});
