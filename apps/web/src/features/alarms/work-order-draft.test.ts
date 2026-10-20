import type { Alarm, User } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { draftFromAlarm, suggestAssignees } from "./work-order-draft";

const alarm: Alarm = {
  id: "ALM-000042",
  assetId: "CBC-GT-101",
  tagId: "CBC-GT-101.COMP_EFF",
  priority: "p2",
  state: "active_unacked",
  kind: "low_low",
  message: "Compressor isentropic efficiency low-low",
  value: 84.0,
  limit: 84.1,
  quantity: "percent",
  raisedAt: "2026-10-10T08:00:00Z",
  acknowledgedAt: null,
  acknowledgedBy: null,
  returnedToNormalAt: null,
  shelve: null,
  workOrderId: null,
  occurrenceCount: 1,
};

const NOW = Date.UTC(2026, 9, 10, 9);

describe("work order draft from an alarm", () => {
  it("maps P2 to urgent, due in 3 days, corrective", () => {
    const d = draftFromAlarm(alarm, NOW, "84 %");
    expect(d.priority).toBe("urgent");
    expect(d.dueDate).toBe("2026-10-13");
    expect(d.type).toBe("corrective");
    expect(d.title).toBe("Compressor isentropic efficiency low-low — CBC-GT-101");
    expect(d.description).toContain("ALM-000042");
    expect(d.description).toContain("84 %");
  });

  it("makes prediction alarms predictive work", () => {
    expect(draftFromAlarm({ ...alarm, kind: "prediction" }, NOW, null).type).toBe("predictive");
  });

  it("keeps titles within the 120-character limit", () => {
    expect(draftFromAlarm({ ...alarm, message: "x".repeat(200) }, NOW, null).title.length).toBeLessThanOrEqual(120);
  });
});

describe("assignee suggestions", () => {
  it("puts technicians from the asset's site first", () => {
    const tech = (id: string, siteIds: string[]): User => ({ id, name: id, role: "field_technician", title: "", crewId: null, siteIds });
    const order = suggestAssignees([tech("far", ["PBU"]), tech("near", ["CBC", "PCS"])], "CBC").map((u) => u.id);
    expect(order).toEqual(["near", "far"]);
  });
});
