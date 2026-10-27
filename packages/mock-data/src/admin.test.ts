import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { ApiFailure } from "./errors";
import { limitCrossings } from "./faults";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const makeBackend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "system_admin" });

describe("audit log", () => {
  it("records every change, who made it and to what, newest first; reads aren't changes", () => {
    const b = makeBackend();
    b.request("assets.list", { limit: 5 });
    expect(b.request("admin.audit", {}).total).toBe(0);
    const asset = b.request("assets.list", { limit: 1 }).items[0]!;
    const wo = b.request("workOrders.create", {
      title: "Check the seal",
      description: "",
      assetId: asset.id,
      type: "corrective",
      priority: "normal",
      assigneeId: null,
      dueAt: null,
      source: { kind: "manual", refId: null },
      evidence: null,
    });
    b.request("handover.addNote", { siteId: null, text: "Audit me" });
    const log = b.request("admin.audit", {});
    expect(log.total).toBe(2);
    expect(log.items.map((e) => e.action)).toEqual(["handover.addNote", "workOrders.create"]);
    const me = b.request("me.get", {});
    expect(log.items[1]).toMatchObject({ userId: me.id, targetId: asset.id, description: expect.stringMatching(/./) });
    expect(wo.assetId).toBe(asset.id);
    expect(b.request("admin.audit", { action: "workOrders." }).total).toBe(1);
  });

  it("does not record a change that was refused", () => {
    const b = makeBackend();
    expect(() => b.request("admin.setLimits", { tagId: "NOPE.TAG", limits: {} })).toThrowError(ApiFailure);
    expect(b.request("admin.audit", {}).total).toBe(0);
  });
});

describe("limits", () => {
  it("must rise from low trip to high trip", () => {
    const b = makeBackend();
    const tag = [...b.world.tags.values()].find((t) => t.tag.limits.highAlarm !== undefined)!;
    expect(() => b.request("admin.setLimits", { tagId: tag.tag.id, limits: { highAlert: 10, highAlarm: 9 } })).toThrowError(/must rise/);
  });

  it("moves a developing fault's alarm: a lower alert limit sounds earlier, and the log says what changed", () => {
    const b = makeBackend();
    const fault = b.world.faults.find((f) => f.asset.tags.some((t) => limitCrossings(f, t).length > 0))!;
    const tag = fault.asset.tags.find((t) => limitCrossings(fault, t).length > 0)!;
    const before = limitCrossings(fault, tag).find((c) => c.level === 0)!;
    const limits = { ...tag.tag.limits };
    const high = tag.template.bad === "high";
    const key = high ? "highAlert" : "lowAlert";
    const nearer = (before.limit + tag.base) / 2;
    b.request("admin.setLimits", { tagId: tag.tag.id, limits: { ...limits, [key]: nearer } });
    const after = limitCrossings(fault, tag).find((c) => c.level === 0)!;
    expect(after.limit).toBe(nearer);
    expect(after.t).toBeLessThan(before.t);
    expect(b.request("admin.audit", {}).items[0]).toMatchObject({
      action: "admin.setLimits",
      targetId: tag.tag.id,
      detail: expect.stringMatching(new RegExp(`^${high ? "High" : "Low"} alert .+ → `)),
    });
  });
});

describe("users and roles", () => {
  it("changes a person's role and title", () => {
    const b = makeBackend();
    const tech = b.request("users.list", { role: "field_technician" }).items[1]!;
    const updated = b.request("admin.setUserRole", { userId: tech.id, role: "maintenance_planner" });
    expect(updated).toMatchObject({ id: tech.id, role: "maintenance_planner", title: expect.stringMatching(/plan/i) });
    expect(b.request("admin.audit", {}).items[0]).toMatchObject({ targetId: tech.id, detail: "field_technician → maintenance_planner" });
  });

  it("never leaves a role with nobody in it", () => {
    const b = makeBackend();
    const leads = b.request("users.list", { role: "esg_lead" }).items;
    for (const u of leads.slice(0, -1)) b.request("admin.setUserRole", { userId: u.id, role: "executive" });
    expect(() => b.request("admin.setUserRole", { userId: leads.at(-1)!.id, role: "executive" })).toThrowError(/only/);
  });
});
