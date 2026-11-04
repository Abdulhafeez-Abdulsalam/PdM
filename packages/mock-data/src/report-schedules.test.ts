import { describe, expect, it } from "vitest";
import { createMockBackend, type LoggedCommand } from "./backend";
import { DAY, HOUR } from "./clock";

const START = Date.UTC(2026, 9, 10, 8);

function setup() {
  let real = START;
  const backend = createMockBackend({ seed: 42, startTime: START, realNow: () => real, role: "plant_manager" });
  const advance = (ms: number) => {
    const end = real + ms;
    while (real < end) {
      real = Math.min(end, real + 6 * HOUR);
      backend.tick();
    }
  };
  return { backend, advance };
}
const daily = { reportId: "weekly-reliability", scopeId: "enterprise", frequency: "daily" } as const;
const reports = (b: ReturnType<typeof setup>["backend"]) =>
  b.request("notifications.list", { kinds: ["report"], unreadOnly: false, limit: 50 }).items;

describe("scheduled reports", () => {
  it("run when due, and tell the owner, with a link to the report and its scope", () => {
    const { backend, advance } = setup();
    const { id } = backend.request("reportSchedules.create", daily);
    expect(reports(backend)).toEqual([]);
    advance(2 * DAY);
    const [schedule] = backend.request("reportSchedules.list", {}).items;
    expect(schedule).toMatchObject({ id, runCount: 2 });
    const bell = reports(backend);
    expect(bell).toHaveLength(2);
    expect(bell[0]).toMatchObject({
      title: "Weekly reliability report is ready",
      refId: "weekly-reliability",
      scopeId: "enterprise",
      assetId: null,
    });
  }, 60_000);

  it("stop while paused, and start a fresh interval on resuming", () => {
    const { backend, advance } = setup();
    const { id } = backend.request("reportSchedules.create", daily);
    expect(backend.request("reportSchedules.setActive", { scheduleId: id, active: false }).nextRunAt).toBeNull();
    advance(2 * DAY);
    expect(backend.request("reportSchedules.list", {}).items[0]?.runCount).toBe(0);
    expect(backend.request("reportSchedules.setActive", { scheduleId: id, active: true }).nextRunAt).not.toBeNull();
    advance(DAY);
    expect(backend.request("reportSchedules.list", {}).items[0]?.runCount).toBe(1);
  }, 60_000);

  it("are each person's own, and go in the audit log", () => {
    const { backend } = setup();
    const { id } = backend.request("reportSchedules.create", daily);
    const someone = backend.request("users.list", { role: "executive", limit: 1 }).items[0]!.id;
    expect(backend.request("reportSchedules.list", {}, someone).items).toEqual([]);
    expect(() => backend.request("reportSchedules.delete", { scheduleId: id }, someone)).toThrow(/not found/);
    backend.request("reportSchedules.delete", { scheduleId: id });
    expect(backend.request("reportSchedules.list", {}).items).toEqual([]);
    const actions = backend.request("admin.audit", { limit: 500 }).items.map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["reportSchedules.create", "reportSchedules.delete"]));
  }, 60_000);

  it("come back the same after a restart", () => {
    const log: LoggedCommand[] = [];
    const a = setup();
    a.backend.onCommand = (entry) => log.push(structuredClone(entry));
    a.backend.request("reportSchedules.create", daily);
    a.advance(3 * DAY);
    const b = setup();
    for (const entry of log) b.backend.replay(entry);
    b.advance(3 * DAY);
    expect(b.backend.request("reportSchedules.list", {}).items).toEqual(a.backend.request("reportSchedules.list", {}).items);
  }, 60_000);
});
