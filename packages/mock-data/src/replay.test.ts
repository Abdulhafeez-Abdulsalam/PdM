import { describe, expect, it } from "vitest";
import { createMockBackend, type LoggedCommand, type MockBackend } from "./backend";
import { HOUR, MINUTE, iso } from "./clock";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);

/** Everything a person could see that the changes and the passing time affect. */
function stateOf(b: MockBackend) {
  return {
    status: b.status(),
    alarms: b.request("alarms.list", { limit: 500, sort: "newest" }).items,
    workOrders: b.request("workOrders.list", { limit: 200 }).items,
    audit: b.request("admin.audit", { limit: 200 }).items,
    users: b.request("users.list", { limit: 100 }).items,
    permits: b.request("hse.permits", {}),
    predictions: b.request("predictions.list", { limit: 50 }).items,
    tag: b.request("data.tags", { search: "CBC-GT-101.EXH_TEMP", limit: 1 }).items,
  };
}

describe("replaying the command log (ADR-0015)", () => {
  it("gives the same alarms however often the plant is ticked", () => {
    const run = (stepMs: number) => {
      let real = 0;
      const b = createMockBackend({ seed: 42, startTime: START, realNow: () => real });
      b.control({ type: "set_speed", speed: 3600 });
      const total = 30 * HOUR;
      for (let t = stepMs; t < total; t += stepMs) {
        real = t / 3600;
        b.tick();
      }
      real = total / 3600;
      b.tick();
      return b.request("alarms.list", { limit: 500, sort: "newest" }).items;
    };
    const once = run(30 * HOUR);
    expect(run(37_000)).toEqual(once); // ticked every 37 simulated seconds
    expect(run(HOUR)).toEqual(once); // once a real second at the top speed
  });

  // Walks the plant through two simulated days, a minute at a time, twice: seconds, not milliseconds.
  it("rebuilds exactly the same plant from the changes people made", { timeout: 60_000 }, () => {
    // A server's day: uneven ticks, changes of speed, chaos, the storyline, and people at work.
    let real = 0;
    const live = createMockBackend({ seed: 42, startTime: START, realNow: () => real });
    const log: LoggedCommand[] = [];
    live.onCommand = (entry) => log.push(structuredClone(entry));
    const wait = (realMs: number, ticks = 3) => {
      for (let i = 0; i < ticks; i++) {
        real += realMs / ticks;
        live.tick();
      }
    };
    const users = live.request("users.list", { limit: 100 }).items;
    const first = (role: string) => users.find((u) => u.role === role)!.id;

    live.control({ type: "set_speed", speed: 600 });
    wait(5000);
    const alarm = live.request("alarms.list", { states: ["active_unacked"], limit: 1 }).items[0]!;
    live.request("alarms.acknowledge", { alarmIds: [alarm.id] }, first("control_room_operator"));
    live.control({ type: "set_chaos", enabled: true });
    wait(7300, 7);
    live.control({ type: "start_storyline" });
    live.control({ type: "set_speed", speed: 3600 });
    wait(40_000, 13); // 40 simulated hours: the storyline moves on by itself
    const wo = live.request(
      "workOrders.create",
      {
        title: "Inspect the seal",
        description: "",
        assetId: alarm.assetId,
        type: "corrective",
        priority: "urgent",
        assigneeId: null,
        dueAt: null,
        source: { kind: "alarm", refId: alarm.id },
        evidence: null,
      },
      first("maintenance_planner"),
    );
    live.request("admin.setLimits", { tagId: "CBC-GT-101.EXH_TEMP", limits: { highAlert: 600, highAlarm: 615 } }, first("system_admin"));
    live.request("admin.setUserRole", { userId: users.find((u) => u.role === "executive")!.id, role: "esg_lead" }, first("system_admin"));
    live.control({ type: "set_chaos", enabled: false });
    wait(3000);
    // A read changes nothing, so it isn't logged (or audited).
    live.request("timeseries.latest", { tagIds: ["CBC-GT-101.EXH_TEMP"] }, first("executive"));
    wait(1000, 1);

    expect(log.map((e) => (e.command.kind === "request" ? e.command.name : e.command.control.type))).toEqual([
      "set_speed",
      "alarms.acknowledge",
      "set_chaos",
      "start_storyline",
      "set_speed",
      "workOrders.create",
      "admin.setLimits",
      "admin.setUserRole",
      "set_chaos",
    ]);

    // Restart: a fresh simulation from the same seed and start, the log replayed, the clock carried on.
    const stoppedAt = live.now();
    let real2 = 0;
    const restarted = createMockBackend({ seed: 42, startTime: START, realNow: () => real2 });
    for (const entry of JSON.parse(JSON.stringify(log)) as LoggedCommand[]) restarted.replay(entry);
    restarted.clock.jumpTo(stoppedAt);
    restarted.tick();

    expect(iso(restarted.now())).toBe(iso(stoppedAt));
    expect(stateOf(restarted)).toEqual(stateOf(live));
    expect(restarted.request("workOrders.get", { workOrderId: wo.id }).title).toBe("Inspect the seal");

    // And both carry on alike (10 simulated minutes at 3600× is a sixth of a real second).
    real += (10 * MINUTE) / 3600;
    real2 += (10 * MINUTE) / 3600;
    live.tick();
    restarted.tick();
    expect(stateOf(restarted)).toEqual(stateOf(live));
  });
});
