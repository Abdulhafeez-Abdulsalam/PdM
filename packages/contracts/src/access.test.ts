import { describe, expect, it } from "vitest";
import { canDo, mayMove, mayRequest, requiredAction, type AccessLookups } from "./access";
import { changesThings, endpoints, type EndpointName } from "./endpoints";
import type { WorkOrderStatus } from "./work-orders";

const lookups = (status: WorkOrderStatus | null = null): AccessLookups => ({ workOrderStatus: () => status });

describe("who may make which request (the server's check, ADR-0014)", () => {
  it("lets anyone signed in read, except the audit log, which is for administrators", () => {
    for (const [name, def] of Object.entries(endpoints) as [EndpointName, (typeof endpoints)[EndpointName]][]) {
      if (def.method !== "GET") continue;
      const expected = name === "admin.audit" ? "admin.manage" : null;
      expect(requiredAction(name, {} as never, lookups()), name).toBe(expected);
    }
  });

  it("guards every request that changes something", () => {
    const unguarded = (Object.keys(endpoints) as EndpointName[]).filter(
      (name) => changesThings(name) && requiredAction(name, sample(name), lookups("approved")) === null,
    );
    expect(unguarded).toEqual([]);
    expect(changesThings("timeseries.history")).toBe(false); // a long read, sent as POST
  });

  it("uses the same rules as the buttons: only operators acknowledge alarms", () => {
    const ack = { alarmIds: ["AL-1"] };
    expect(mayRequest("control_room_operator", "alarms.acknowledge", ack, lookups())).toBe(true);
    expect(mayRequest("executive", "alarms.acknowledge", ack, lookups())).toBe(false);
    expect(canDo("executive", "alarm.acknowledge")).toBe(false);
  });

  it("decides a work-order move from where the work order is now", () => {
    const move = (to: WorkOrderStatus) => ({ workOrderId: "WO-1", to });
    expect(mayRequest("plant_manager", "workOrders.transition", move("approved"), lookups("scheduled"))).toBe(true);
    expect(mayRequest("maintenance_planner", "workOrders.transition", move("approved"), lookups("scheduled"))).toBe(false);
    // Reopening completed work is the verifier's call, not the technician's.
    expect(mayRequest("field_technician", "workOrders.transition", move("in_progress"), lookups("completed"))).toBe(false);
    expect(mayRequest("reliability_engineer", "workOrders.transition", move("in_progress"), lookups("completed"))).toBe(true);
    expect(mayMove("reliability_engineer", "completed", "in_progress")).toBe(true);
  });

  it("decides MOC moves and new work orders from what they are", () => {
    expect(mayRequest("maintenance_planner", "hse.mocTransition", { mocId: "MOC-1", to: "implemented" }, lookups())).toBe(true);
    expect(mayRequest("maintenance_planner", "hse.mocTransition", { mocId: "MOC-1", to: "approved" }, lookups())).toBe(false);
    const wo = (kind: "alarm" | "prediction") => ({ source: { kind, refId: "X-1" } }) as never;
    expect(mayRequest("control_room_operator", "workOrders.create", wo("alarm"), lookups())).toBe(true);
    expect(mayRequest("control_room_operator", "workOrders.create", wo("prediction"), lookups())).toBe(false);
  });

  it("lets only reliability's users edit RCAs, while anyone who sees assets may comment", () => {
    expect(canDo("reliability_engineer", "rca.edit")).toBe(true);
    expect(canDo("plant_manager", "rca.edit")).toBe(false);
    expect(canDo("procurement", "asset.comment")).toBe(true);
  });
});

/** Just enough input for the rules that read it. */
function sample(name: string): never {
  const inputs: Record<string, unknown> = {
    "hse.mocTransition": { mocId: "MOC-1", to: "approved" },
    "workOrders.create": { source: { kind: "manual", refId: null } },
    "workOrders.transition": { workOrderId: "WO-1", to: "in_progress" },
  };
  return (inputs[name] ?? {}) as never;
}
