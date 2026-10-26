import { LABOUR_RATE } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend, type MockBackend } from "./backend";
import { iso } from "./clock";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const makeBackend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "executive" });
const b = makeBackend();

/** Raise a predictive job on an open prediction and close it out with the given verdict. */
function closePredictive(backend: MockBackend, verdict: "true_positive" | "false_positive", laborHours: number) {
  const p = backend.request("predictions.list", { status: ["open"], limit: 1 }).items[0]!;
  const tech = backend.request("users.list", { role: "field_technician", limit: 1 }).items[0]!;
  const wo = backend.request("workOrders.create", {
    title: "Inspect",
    description: "",
    assetId: p.assetId,
    type: "predictive",
    priority: "high",
    assigneeId: tech.id,
    dueAt: null,
    source: { kind: "prediction", refId: p.id },
    evidence: null,
  });
  const checklist = (kinds?: string[]) =>
    backend
      .request("workOrders.get", { workOrderId: wo.id })
      .checklist.filter((i) => !kinds || kinds.includes(i.kind))
      .map((i) => ({ itemId: i.id, done: true, value: i.kind === "reading" ? 3 : null }));
  for (const to of ["triaged", "planned", "scheduled", "approved", "in_progress"] as const) {
    if (to === "in_progress")
      for (const permit of backend.request("hse.permits", { workOrderId: wo.id, status: ["requested"] }).items)
        backend.request("hse.issuePermit", { permitId: permit.id });
    backend.request("workOrders.transition", {
      workOrderId: wo.id,
      to,
      scheduledStart: to === "scheduled" ? iso(START + 3_600_000) : undefined,
      checklist: to === "in_progress" ? checklist(["safety"]) : undefined,
    });
  }
  backend.request("workOrders.closeOut", {
    workOrderId: wo.id,
    failureMode: "VIB",
    cause: "2.4",
    remedy: "replace",
    findings: "Checked as the prediction asked.",
    laborHours,
    predictionVerdict: verdict,
    checklist: checklist(),
  });
  return wo;
}

describe("financials", () => {
  it("adds up: months and categories to the total, sites to the downtime", () => {
    const o = b.request("financials.overview", {});
    expect(o.spend.months).toHaveLength(12);
    expect(o.spend.months.at(-1)!.month).toBe("2026-10");
    const byMonth = o.spend.months.reduce((s, m) => s + m.corrective + m.preventive + m.predictive, 0);
    const byCategory = o.spend.byCategory.reduce((s, c) => s + c.total, 0);
    expect(Math.abs(byCategory - o.spend.total)).toBeLessThanOrEqual(3);
    expect(Math.abs(byMonth - o.spend.total)).toBeLessThanOrEqual(12);
    expect(Math.abs(o.spend.months.reduce((s, m) => s + m.budget, 0) - o.spend.budget)).toBeLessThanOrEqual(12);
    expect(Math.abs(o.downtime.sites.reduce((s, x) => s + x.cost, 0) - o.downtime.cost)).toBeLessThanOrEqual(o.downtime.sites.length);
    expect(o.spend.plannedPct).toBeGreaterThan(0);
    expect(o.spend.plannedPct).toBeLessThan(100);
    expect(o.atRisk.amount).toBeGreaterThan(0);
  });

  it("shows the working for each finished predictive job", () => {
    const backend = makeBackend();
    const wo = closePredictive(backend, "true_positive", 6);
    const item = backend.request("financials.overview", {}).value.items.find((i) => i.workOrderId === wo.id)!;
    expect(item.falseAlarm).toBe(false);
    expect(item.avoided).toBeGreaterThan(0);
    expect(item.labourHours).toBe(6);
    expect(Math.abs(item.cost - (6 * LABOUR_RATE + item.partsCost))).toBeLessThanOrEqual(1);
    expect(item.net).toBe(Math.round(item.avoided - item.cost));
  });

  it("counts a false alarm as cost with nothing avoided", () => {
    const backend = makeBackend();
    const before = backend.request("financials.overview", {});
    closePredictive(backend, "false_positive", 2);
    const after = backend.request("financials.overview", {});
    expect(after.value.jobs).toBe(before.value.jobs + 1);
    expect(after.value.falseAlarms).toBe(before.value.falseAlarms + 1);
    expect(after.value.avoided).toBe(before.value.avoided);
    expect(Math.abs(after.value.cost - (before.value.cost + 2 * LABOUR_RATE))).toBeLessThanOrEqual(1);
  });

  it("narrows to one site", () => {
    const all = b.request("financials.overview", {});
    const one = b.request("financials.overview", { scopeId: "EBC" });
    expect(one.spend.total).toBeLessThan(all.spend.total);
    for (const s of one.downtime.sites) expect(s.siteId).toBe("EBC");
  });
});
