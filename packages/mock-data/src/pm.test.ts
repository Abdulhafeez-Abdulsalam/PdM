import { PM_HORIZON_DAYS } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { DAY } from "./clock";
import { ApiFailure } from "./errors";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const makeBackend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "maintenance_planner" });
const b = makeBackend();

describe("PM programs", () => {
  it("builds plans from FMEA: replacements for wear-out modes, checks for condition-based ones", () => {
    const all = b.request("pm.overview", {});
    expect(all.plans.length).toBeGreaterThan(10);
    for (const plan of all.plans) {
      const fmea = b.request("reliability.fmea", { assetClass: plan.assetClass }).rows.find((r) => r.mode === plan.mode)!;
      expect(plan.strategy).toBe(fmea.strategy);
      expect(plan.task).toBe(fmea.strategy === "time_based" ? "planned_remedy" : "condition_check");
    }
    // Modes FMEA says to run to failure or redesign have no plan, and are listed as such.
    for (const u of all.uncovered) expect(["run_to_failure", "redesign"]).toContain(u.strategy);
    const pump = all.plans.find((p) => p.id === "PM-PMP-VIB" || (p.assetClass === "pump" && p.mode === "VIB"));
    if (pump?.task === "planned_remedy") expect(pump.parts[0]!.partNumber).toBe("SP-BRG-6309");
  });

  it("counts compliance as on-time ÷ due, over the last 90 days", () => {
    const { counts } = b.request("pm.overview", {});
    expect(counts.decided).toBe(counts.onTime + counts.late + counts.missed);
    expect(counts.compliancePct).toBeCloseTo((100 * counts.onTime) / counts.decided, 1);
    expect(counts.compliancePct!).toBeGreaterThan(60);
    expect(counts.compliancePct!).toBeLessThan(98);
  });

  it("follows the scope, and the Command Center tile agrees", () => {
    const site = b.request("pm.overview", { scopeId: "CBC" });
    const all = b.request("pm.overview", {});
    expect(site.counts.decided).toBeLessThan(all.counts.decided);
    const tile = b.request("kpis.get", { scopeId: "CBC", keys: ["pm_compliance"] }).kpis[0]!;
    expect(tile.value).toBe(site.counts.compliancePct);
  });

  it("shows each covered asset's next due date, overdue first", () => {
    const plan = b.request("pm.overview", {}).plans.find((p) => p.counts.overdue > 0)!;
    const detail = b.request("pm.plan", { planId: plan.id });
    expect(detail.assetStatus).toHaveLength(plan.assets);
    expect(detail.assetStatus[0]!.status).toBe("overdue");
    expect(detail.assetStatus.filter((a) => a.status === "overdue")).toHaveLength(plan.counts.overdue);
    expect(detail.why.rpn).toBe(detail.why.severity * detail.why.occurrence * detail.why.detection);
  });

  it("raises work orders for what's due, once, and counts them done when closed out", () => {
    const backend = makeBackend();
    const plan = backend.request("pm.overview", {}).plans.find((p) => p.counts.overdue > 0 && p.counts.dueSoon > 0)!;
    const before = backend.request("pm.plan", { planId: plan.id });
    const { created } = backend.request("pm.generate", { planId: plan.id });
    expect(created.length).toBe(plan.counts.overdue + plan.counts.dueSoon);
    for (const c of created) expect(Date.parse(c.dueAt)).toBeLessThanOrEqual(START + PM_HORIZON_DAYS * DAY);
    const wo = backend.request("workOrders.get", { workOrderId: created[0]!.workOrderId });
    expect(wo.source).toEqual({ kind: "pm", refId: plan.id });
    expect(wo.status).toBe("planned");
    // Generating again creates nothing: everything due already has a work order.
    expect(backend.request("pm.generate", { planId: plan.id }).created).toHaveLength(0);
    const after = backend.request("pm.plan", { planId: plan.id });
    expect(after.counts.overdue).toBe(0);
    expect(after.assetStatus.filter((a) => a.status === "planned").length).toBe(new Set(created.map((c) => c.assetId)).size);
    expect(before.counts.overdue).toBe(plan.counts.overdue);

    // Close one overdue PM out today: it counts as done, but late.
    const overdue = created.find((c) => Date.parse(c.dueAt) < START && Date.parse(c.dueAt) > START - 80 * DAY)!;
    const tech = backend.request("users.list", { role: "field_technician" }).items[0]!;
    for (const to of ["scheduled", "approved", "in_progress"] as const) {
      const checklist =
        to === "in_progress"
          ? backend
              .request("workOrders.get", { workOrderId: overdue.workOrderId })
              .checklist.filter((i) => i.kind === "safety")
              .map((i) => ({ itemId: i.id, done: true, value: null }))
          : undefined;
      backend.request("workOrders.transition", {
        workOrderId: overdue.workOrderId,
        to,
        scheduledStart: to === "scheduled" ? new Date(START + 3_600_000).toISOString() : undefined,
        assigneeId: to === "scheduled" ? tech.id : undefined,
        checklist,
      });
    }
    backend.request("workOrders.closeOut", {
      workOrderId: overdue.workOrderId,
      failureMode: plan.mode,
      cause: "2.4",
      remedy: "replace",
      findings: "Preventive work done as planned.",
      laborHours: 4,
      predictionVerdict: null,
      checklist: backend
        .request("workOrders.get", { workOrderId: overdue.workOrderId })
        .checklist.map((i) => ({ itemId: i.id, done: true, value: i.kind === "reading" ? 3 : null })),
    });
    const closed = backend.request("pm.plan", { planId: plan.id });
    expect(closed.counts.late).toBe(after.counts.late + 1);
    expect(closed.counts.missed).toBe(after.counts.missed - 1);
    expect(Date.parse(closed.assetStatus.find((a) => a.assetId === overdue.assetId)!.lastDone!)).toBe(START);
  });

  it("refuses unknown plans", () => {
    expect(() => b.request("pm.plan", { planId: "PM-NOPE" })).toThrowError(ApiFailure);
  });
});
