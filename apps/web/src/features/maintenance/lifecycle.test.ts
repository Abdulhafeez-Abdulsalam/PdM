import { describe, expect, it } from "vitest";
import { BOARD_COLUMNS, allowedMoves, mayMove, resolveDrop } from "./lifecycle";

const column = (id: string) => BOARD_COLUMNS.find((c) => c.id === id)!;
const wo = (status: Parameters<typeof allowedMoves>[1]["status"], extra = {}) => ({
  status,
  scheduledStart: null,
  assigneeId: null,
  ...extra,
});

describe("who may move a work order", () => {
  it("planners plan, managers approve, technicians execute and close out", () => {
    expect(allowedMoves("maintenance_planner", wo("requested"))).toEqual(["triaged", "cancelled"]);
    expect(allowedMoves("plant_manager", wo("scheduled"))).toEqual(["approved", "cancelled"]);
    expect(allowedMoves("field_technician", wo("approved"))).toEqual(["in_progress"]);
    expect(allowedMoves("field_technician", wo("in_progress"))).toEqual(["completed"]);
    expect(allowedMoves("reliability_engineer", wo("completed"))).toEqual(["verified", "in_progress"]);
  });

  it("gives an executive no moves at all", () => {
    for (const s of ["requested", "scheduled", "in_progress", "completed"] as const) expect(allowedMoves("executive", wo(s))).toEqual([]);
  });

  it("doesn't let a technician reopen their own completed work", () => {
    expect(mayMove("field_technician", "completed", "in_progress")).toBe(false);
  });
});

describe("dropping a card on a Kanban column", () => {
  it("moves when allowed", () => {
    expect(resolveDrop("maintenance_planner", wo("requested"), column("requested"))).toEqual({ kind: "none" });
    expect(resolveDrop("maintenance_planner", wo("triaged"), column("planned"))).toEqual({ kind: "move", to: "planned" });
  });

  it("asks for a start time and assignee before scheduling", () => {
    expect(resolveDrop("maintenance_planner", wo("planned"), column("scheduled"))).toEqual({ kind: "schedule" });
    expect(
      resolveDrop("maintenance_planner", wo("planned", { scheduledStart: "2026-10-12T06:00:00Z", assigneeId: "U-1" }), column("scheduled")),
    ).toEqual({
      kind: "move",
      to: "scheduled",
    });
  });

  it("opens the close-out form when a technician drops work in Done", () => {
    expect(resolveDrop("field_technician", wo("in_progress"), column("done"))).toEqual({ kind: "closeOut" });
  });

  it("refuses skipping steps, and moves the role may not make", () => {
    expect(resolveDrop("maintenance_planner", wo("requested"), column("in_progress"))).toEqual({ kind: "refuse", reason: "notAllowed" });
    expect(resolveDrop("maintenance_planner", wo("scheduled"), column("approved"))).toEqual({ kind: "refuse", reason: "role" });
  });
});
