import { MODULE_IDS } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { ALL_MODULE_IDS, ALL_ROLES, accessFor, canDo, canSee, homeFor } from "./roles";

describe("role-based views (ADR-0008, IA §4)", () => {
  it("has a decision for every role × module", () => {
    for (const role of ALL_ROLES) for (const m of ALL_MODULE_IDS) expect(["use", "view", "none"]).toContain(accessFor(role, m));
  });

  it("matches spot checks from the information architecture table", () => {
    expect(accessFor("control_room_operator", "alarms")).toBe("use");
    expect(accessFor("executive", "alarms")).toBe("view");
    expect(accessFor("esg_lead", "alarms")).toBe("none");
    expect(accessFor("field_technician", "field")).toBe("use");
    expect(canSee("system_admin", "admin")).toBe(true);
    expect(canSee("plant_manager", "admin")).toBe(false);
  });

  it("every role can see its own home page, and can see the Command Center", () => {
    for (const role of ALL_ROLES) {
      expect(canSee(role, homeFor(role)), role).toBe(true);
      expect(canSee(role, "command-center"), role).toBe(true);
    }
  });

  it("has the same modules as the rules the server checks (one copy, in the contracts)", () => {
    expect([...ALL_MODULE_IDS].sort()).toEqual([...MODULE_IDS].sort());
  });

  it("only operators acknowledge alarms; several roles can raise work orders from them", () => {
    expect(canDo("control_room_operator", "alarm.acknowledge")).toBe(true);
    expect(canDo("executive", "alarm.acknowledge")).toBe(false);
    expect(canDo("maintenance_planner", "alarm.createWorkOrder")).toBe(true);
  });
});
