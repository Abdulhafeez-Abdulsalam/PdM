import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { DAY } from "./clock";
import { ApiFailure } from "./errors";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const makeBackend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "procurement" });
const b = makeBackend();

describe("inventory", () => {
  it("stocks every part where its equipment is, with a reorder point below the maximum", () => {
    const o = b.request("inventory.overview", {});
    expect(o.counts.lines).toBeGreaterThan(100);
    for (const l of o.lines) {
      expect(l.reorderPoint).toBeLessThan(l.max);
      if (l.criticality !== "desirable") expect(l.reorderPoint).toBeGreaterThanOrEqual(1);
    }
    const bearings = o.lines.filter((l) => l.partNumber === "SP-BRG-6309");
    expect(bearings.map((l) => l.siteId).sort()).toEqual(
      [...new Set([...b.world.assets.values()].filter((a) => a.data.assetClass === "pump").map((a) => a.data.siteId))].sort(),
    );
  });

  it("puts the lines that will run short first", () => {
    const { lines, counts } = b.request("inventory.overview", {});
    expect(counts.short).toBeGreaterThan(0);
    expect(counts.reorder).toBeGreaterThan(0);
    expect(counts.excess).toBeGreaterThan(0);
    const order = { short: 0, reorder: 1, ok: 2, excess: 3 };
    for (let i = 1; i < lines.length; i++) expect(order[lines[i]!.status]).toBeGreaterThanOrEqual(order[lines[i - 1]!.status]);
    for (const l of lines.filter((x) => x.status === "short" || x.status === "reorder")) expect(l.suggestedQty).toBeGreaterThan(0);
  });

  it("forecasts bearings from predictions: their wear is watched, not replaced on a schedule", () => {
    const d = b.request("inventory.part", { partNumber: "SP-BRG-6309" });
    // Bearing wear is condition-based (a model watches it), so its PM plan is a check with no parts.
    expect(d.pmPlanId).toBeNull();
    const fromPrediction = d.demand.find((x) => x.assetId === "PBU-PMP-106" && x.source === "prediction");
    expect(fromPrediction).toBeDefined();
    expect(fromPrediction!.quantity).toBe(2);
    expect(Date.parse(fromPrediction!.needBy)).toBeLessThan(START + 90 * DAY);
    expect(d.demand.every((x) => x.source === "prediction")).toBe(true);
    const pbu = d.lines.find((l) => l.siteId === "PBU")!;
    expect(pbu.demand).toBe(d.demand.filter((x) => x.siteId === "PBU").reduce((n, x) => n + x.quantity, 0));
  });

  it("forecasts parts from PM plans for modes replaced on a schedule", () => {
    const plan = b.request("pm.overview", {}).plans.find((p) => p.task === "planned_remedy" && p.counts.dueSoon > 0)!;
    const d = b.request("inventory.part", { partNumber: plan.parts[0]!.partNumber });
    expect(d.pmPlanId).toBe(plan.id);
    expect(d.demand.filter((x) => x.source === "pm" && x.refId === plan.id).length).toBeGreaterThanOrEqual(plan.counts.dueSoon);
  });

  it("places an order that arrives after the lead time", () => {
    const backend = makeBackend();
    const line = backend.request("inventory.overview", { status: ["reorder"] }).lines[0]!;
    const part = backend.request("inventory.part", { partNumber: line.partNumber }).part;
    const po = backend.request("inventory.order", { partNumber: line.partNumber, siteId: line.siteId, quantity: line.suggestedQty });
    expect(Date.parse(po.eta) - Date.parse(po.orderedAt)).toBe(part.leadTimeDays * DAY);
    const after = backend
      .request("inventory.overview", {})
      .lines.find((l) => l.partNumber === line.partNumber && l.siteId === line.siteId)!;
    expect(after.onOrder).toBe(line.onOrder + line.suggestedQty);
    expect(after.status).not.toBe("reorder");
  });

  it("takes parts out of stock when PM work that replaced them is closed out", () => {
    const backend = makeBackend();
    const plan = backend.request("pm.overview", {}).plans.find((p) => p.task === "planned_remedy" && p.counts.dueSoon > 0)!;
    const part = plan.parts[0]!;
    const { created } = backend.request("pm.generate", { planId: plan.id });
    const job = created[0]!;
    const asset = backend.world.assets.get(job.assetId)!;
    const lineOf = () =>
      backend.request("inventory.overview", {}).lines.find((l) => l.partNumber === part.partNumber && l.siteId === asset.data.siteId)!;
    const before = lineOf();
    const parts = backend.request("inventory.workOrderParts", { workOrderId: job.workOrderId });
    expect(parts.parts).toEqual([expect.objectContaining({ partNumber: part.partNumber, quantity: part.quantity, onHand: before.onHand })]);
    expect(parts.issued).toBe(false);

    const tech = backend.request("users.list", { role: "field_technician" }).items[0]!;
    for (const to of ["scheduled", "approved", "in_progress"] as const) {
      backend.request("workOrders.transition", {
        workOrderId: job.workOrderId,
        to,
        scheduledStart: to === "scheduled" ? new Date(START + 3_600_000).toISOString() : undefined,
        assigneeId: to === "scheduled" ? tech.id : undefined,
        checklist:
          to === "in_progress"
            ? backend
                .request("workOrders.get", { workOrderId: job.workOrderId })
                .checklist.filter((i) => i.kind === "safety")
                .map((i) => ({ itemId: i.id, done: true, value: null }))
            : undefined,
      });
    }
    backend.request("workOrders.closeOut", {
      workOrderId: job.workOrderId,
      failureMode: plan.mode,
      cause: "2.4",
      remedy: "replace",
      findings: "Parts replaced as planned.",
      laborHours: 5,
      predictionVerdict: null,
      checklist: backend
        .request("workOrders.get", { workOrderId: job.workOrderId })
        .checklist.map((i) => ({ itemId: i.id, done: true, value: i.kind === "reading" ? 3 : null })),
    });
    expect(lineOf().onHand).toBe(Math.max(0, before.onHand - part.quantity));
    expect(backend.request("inventory.workOrderParts", { workOrderId: job.workOrderId }).issued).toBe(true);
  });

  it("refuses unknown parts and sites that don't stock them", () => {
    expect(() => b.request("inventory.part", { partNumber: "SP-NOPE" })).toThrowError(ApiFailure);
    expect(() => b.request("inventory.order", { partNumber: "SP-BRG-6309", siteId: "PCS", quantity: 1 })).toThrowError(ApiFailure);
  });
});
