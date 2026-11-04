import { describe, expect, it } from "vitest";
import { ESCALATION_CHAIN, ESCALATION_MINUTES, type Alarm, type RoleId } from "@pdm/contracts";
import { createMockBackend, type LoggedCommand } from "./backend";
import { HOUR, MINUTE } from "./clock";

const START = Date.UTC(2026, 9, 10, 8);

function setup(role: RoleId) {
  let real = START;
  const backend = createMockBackend({ seed: 42, startTime: START, realNow: () => real, role });
  const advance = (ms: number) => {
    const end = real + ms;
    while (real < end) {
      real = Math.min(end, real + 10 * MINUTE);
      backend.tick();
    }
  };
  return { backend, advance };
}
const urgent = (backend: ReturnType<typeof setup>["backend"]) =>
  backend.request("alarms.list", { states: ["active_unacked"], priorities: ["p1", "p2"], limit: 500 }).items;

describe("the on-call chain", () => {
  it("names one person for each step, at every site, shift by shift", () => {
    const { backend, advance } = setup("control_room_operator");
    const before = backend.request("alarms.onCall", {});
    expect(before.sites.length).toBeGreaterThan(3);
    for (const site of before.sites) expect(site.chain).toHaveLength(ESCALATION_CHAIN.length);
    advance(12 * HOUR);
    const after = backend.request("alarms.onCall", {});
    expect(Date.parse(after.shiftEndsAt) - Date.parse(before.shiftEndsAt)).toBe(12 * HOUR);
  });
});

describe("escalation", () => {
  it("moves an unanswered urgent alarm up the chain by itself, and records it", () => {
    const { backend, advance } = setup("plant_manager");
    advance(24 * HOUR);
    const moved = backend.request("alarms.list", { states: ["active_unacked"], limit: 500 }).items.filter((a) => a.escalation);
    expect(moved.length).toBeGreaterThan(0);
    for (const a of moved) {
      expect(a.priority === "p1" || a.priority === "p2").toBe(true);
      const waited = Date.parse(a.escalation!.at) - Date.parse(a.raisedAt);
      expect(waited).toBeGreaterThanOrEqual(ESCALATION_MINUTES[a.priority]![0]! * MINUTE - MINUTE);
      expect(a.escalation!.by).toBeNull();
    }
    const audit = backend.request("admin.audit", { limit: 500 }).items.filter((e) => e.action === "alarms.escalate");
    expect(audit.length).toBeGreaterThan(0);
    expect(audit[0]!.userId).toBe("system");
    expect(backend.request("alarms.analytics", { window: "24h" }).escalated).toBeGreaterThan(0);
  }, 60_000);

  it("stops when someone acknowledges the alarm", () => {
    const { backend, advance } = setup("control_room_operator");
    advance(2 * HOUR);
    const alarm = urgent(backend).find((a) => !a.escalation);
    expect(alarm, "an urgent alarm still with the operator").toBeDefined();
    backend.request("alarms.acknowledge", { alarmIds: [alarm!.id] });
    advance(2 * HOUR);
    const after = backend.request("alarms.list", { states: ["active_acked", "cleared"], limit: 500 }).items.find((a) => a.id === alarm!.id);
    expect(after?.escalation ?? null).toBeNull();
  }, 60_000);

  it("can be done by hand, is audited with the person's name, and stops at the top", () => {
    const { backend, advance } = setup("control_room_operator");
    advance(2 * HOUR);
    const me = backend.request("me.get", {});
    const alarm: Alarm = urgent(backend).find((a) => !a.escalation)!;
    const up = backend.request("alarms.escalate", { alarmId: alarm.id });
    expect(up.escalation).toMatchObject({ level: 1, by: me.id });
    expect(backend.request("admin.audit", { limit: 500 }).items.some((e) => e.action === "alarms.escalate" && e.userId === me.id)).toBe(
      true,
    );
    backend.request("alarms.escalate", { alarmId: alarm.id });
    expect(() => backend.request("alarms.escalate", { alarmId: alarm.id })).toThrow(/top of the on-call chain/);
  }, 60_000);

  it("refuses an alarm someone has already answered", () => {
    const { backend, advance } = setup("control_room_operator");
    advance(2 * HOUR);
    const alarm = urgent(backend)[0]!;
    backend.request("alarms.acknowledge", { alarmIds: [alarm.id] });
    expect(() => backend.request("alarms.escalate", { alarmId: alarm.id })).toThrow(/unanswered/);
  }, 60_000);

  it("lights the bell of the person it went to, and stops once it's answered", () => {
    const { backend, advance } = setup("control_room_operator");
    advance(2 * HOUR);
    const alarm = urgent(backend).find((a) => !a.escalation)!;
    const to = backend.request("alarms.escalate", { alarmId: alarm.id }).escalation!.to;
    const theirs = () =>
      backend
        .request("notifications.list", { unreadOnly: false, limit: 200 }, to)
        .items.find((n) => n.kind === "escalation" && n.refId === alarm.id);
    expect(theirs()?.read).toBe(false);
    backend.request("alarms.acknowledge", { alarmIds: [alarm.id] });
    expect(theirs()?.read).toBe(true);
  }, 60_000);

  it("comes back the same after a restart", () => {
    const log: LoggedCommand[] = [];
    const a = setup("control_room_operator");
    a.backend.onCommand = (entry) => log.push(structuredClone(entry));
    a.advance(2 * HOUR);
    const alarm = urgent(a.backend).find((x) => !x.escalation)!;
    a.backend.request("alarms.escalate", { alarmId: alarm.id });
    a.advance(HOUR);
    const b = setup("control_room_operator");
    for (const entry of log) b.backend.replay(entry);
    b.advance(HOUR); // the replay has already moved it on to the last command
    const pick = (backend: typeof a.backend) =>
      backend.request("alarms.list", { limit: 500 }).items.map((x) => [x.id, x.escalation?.level]);
    expect(pick(b.backend)).toEqual(pick(a.backend));
  }, 60_000);
});
