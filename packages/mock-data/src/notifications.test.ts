import { describe, expect, it } from "vitest";
import type { RoleId } from "@pdm/contracts";
import { createMockBackend, type LoggedCommand } from "./backend";
import { HOUR } from "./clock";

const START = Date.UTC(2026, 9, 10, 8);

function setup(role: RoleId) {
  let real = START;
  const backend = createMockBackend({ seed: 42, startTime: START, realNow: () => real, role });
  const advance = (ms: number) => {
    for (let t = 0; t < ms; t += HOUR) {
      real += HOUR;
      backend.tick();
    }
  };
  return { backend, advance };
}
const LIST = { unreadOnly: false, limit: 200 };

describe("notifications", () => {
  it("tells a technician about their own jobs, and nothing about alarms", () => {
    const { backend } = setup("field_technician");
    const me = backend.request("me.get", {});
    const { items } = backend.request("notifications.list", LIST);
    expect(items.length).toBeGreaterThan(0);
    expect(new Set(items.map((n) => n.kind))).toEqual(new Set(["work_order"]));
    for (const n of items) expect(backend.request("workOrders.get", { workOrderId: n.refId }).assigneeId).toBe(me.id);
  });

  it("tells an operator about urgent alarms, and stops when one is acknowledged", () => {
    const { backend, advance } = setup("control_room_operator");
    advance(12 * HOUR);
    const before = backend.request("notifications.list", LIST);
    const unreadAlarm = before.items.find((n) => n.kind === "alarm" && !n.read);
    expect(unreadAlarm, "an urgent alarm nobody has acknowledged").toBeDefined();
    backend.request("alarms.acknowledge", { alarmIds: [unreadAlarm!.refId] });
    const after = backend.request("notifications.list", LIST);
    expect(after.items.find((n) => n.id === unreadAlarm!.id)?.read).toBe(true);
    expect(after.unread).toBe(before.unread - 1);
  });

  it("keeps read and snooze for each person, and neither goes in the audit log", () => {
    const { backend, advance } = setup("field_technician");
    const first = backend.request("notifications.list", LIST).items[0]!;
    const unread = backend.request("notifications.list", LIST).unread;

    expect(backend.request("notifications.markRead", { ids: [first.id] }).unread).toBe(unread - 1);

    const second = backend.request("notifications.list", { ...LIST, unreadOnly: true }).items[0]!;
    const until = new Date(START + 2 * HOUR).toISOString();
    expect(backend.request("notifications.snooze", { id: second.id, until }).items.map((n) => n.id)).not.toContain(second.id);
    advance(3 * HOUR);
    expect(backend.request("notifications.list", LIST).items.map((n) => n.id)).toContain(second.id);

    expect(backend.request("notifications.markRead", {}).unread).toBe(0);
    const audit = backend.request("admin.audit", { limit: 500 }).items;
    expect(audit.filter((e) => e.action.startsWith("notifications."))).toEqual([]);
  });
});

describe("notifications across a restart", () => {
  it("remembers what was read, from the command log", () => {
    const log: LoggedCommand[] = [];
    const { backend } = setup("field_technician");
    backend.onCommand = (entry) => log.push(structuredClone(entry));
    const first = backend.request("notifications.list", LIST).items[0]!;
    backend.request("notifications.markRead", { ids: [first.id] });
    expect(log).toHaveLength(1);

    const { backend: restarted } = setup("field_technician");
    for (const entry of log) restarted.replay(entry);
    expect(restarted.request("notifications.list", LIST).items.find((n) => n.id === first.id)?.read).toBe(true);
  });
});

describe("exports", () => {
  it("go in the audit log, saying what, how much and who", () => {
    const { backend } = setup("system_admin");
    const me = backend.request("me.get", {});
    backend.request("exports.record", { what: "Assets", rows: 1200, format: "csv" });
    const [entry] = backend.request("admin.audit", { limit: 500 }).items.filter((e) => e.action === "exports.record");
    expect(entry).toMatchObject({ userId: me.id, detail: "Assets: 1200 rows as csv" });
  });
});

describe("the simulated operator", () => {
  it("keeps the alarm list from piling up, and leaves urgent alarms and real faults for people", () => {
    const { backend, advance } = setup("control_room_operator");
    const states = ["active_unacked", "rtn_unacked"] as const;
    advance(96 * HOUR);
    const waiting = backend.request("alarms.list", { states: [...states], limit: 500 });
    // About 33 an hour used to pile up: over 3,000 by now.
    expect(waiting.total).toBeLessThan(400);
    const handledBySomeone = backend.request("alarms.list", { states: ["active_acked"], limit: 500 }).items;
    expect(handledBySomeone.some((a) => a.priority === "p4")).toBe(true);
    expect(waiting.items.some((a) => a.priority === "p2" || a.priority === "p1")).toBe(true);
  }, 60_000);
});
