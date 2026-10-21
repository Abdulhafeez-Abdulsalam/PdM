import { canTransition } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { HOUR, iso } from "./clock";
import { ApiFailure } from "./errors";

const START = Date.UTC(2026, 9, 10, 8);
type Backend = ReturnType<typeof createMockBackend>;
/** Tick every line of a work order's checklist, entering a reading of 3 for each measurement. */
const allDone = (b: Backend, id: string) =>
  b
    .request("workOrders.get", { workOrderId: id })
    .checklist.map((i) => ({ itemId: i.id, done: true, value: i.kind === "reading" ? 3 : null }));
const safetyOnly = (b: Backend, id: string) =>
  b
    .request("workOrders.get", { workOrderId: id })
    .checklist.filter((i) => i.kind === "safety")
    .map((i) => ({ itemId: i.id, done: true, value: null }));

const makeBackend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "maintenance_planner" });

describe("seeded work orders", () => {
  it("have a history that ends at their current status and only uses allowed moves", () => {
    const { items } = makeBackend().request("workOrders.list", { limit: 500 });
    expect(items.length).toBeGreaterThan(300);
    for (const wo of items) {
      expect(wo.history.at(-1)?.to, wo.number).toBe(wo.status);
      for (const e of wo.history.slice(1)) {
        if (e.to === "completed") continue; // reached via close-out
        expect(canTransition(e.from!, e.to), `${wo.number}: ${e.from} → ${e.to}`).toBe(true);
      }
    }
  });

  it("finished work carries an ISO 14224 close-out", () => {
    const { items } = makeBackend().request("workOrders.list", { status: ["completed", "verified", "closed"], limit: 50 });
    for (const wo of items) expect(wo.closeOut?.failureMode, wo.number).toBeDefined();
  });
});

describe("lifecycle", () => {
  it("walks a new work order from request to closed", () => {
    const b = makeBackend();
    const asset = b.request("assets.list", { limit: 1 }).items[0]!;
    const tech = b.request("users.list", { role: "field_technician", limit: 1 }).items[0]!;
    const wo = b.request("workOrders.create", {
      title: "Replace bearing",
      description: "",
      assetId: asset.id,
      type: "corrective",
      priority: "high",
      assigneeId: null,
      dueAt: null,
      source: { kind: "manual", refId: null },
      evidence: null,
    });
    const move = (to: Parameters<typeof b.request<"workOrders.transition">>[1]["to"], extra = {}) =>
      b.request("workOrders.transition", { workOrderId: wo.id, to, ...extra });

    move("triaged");
    move("planned");
    expect(() => move("scheduled")).toThrowError(/start time and someone assigned/);
    move("scheduled", { scheduledStart: iso(START + 2 * HOUR), assigneeId: tech.id });
    move("approved");
    move("in_progress", { checklist: safetyOnly(b, wo.id) });
    const done = b.request("workOrders.closeOut", {
      workOrderId: wo.id,
      failureMode: "VIB",
      cause: "2.4",
      remedy: "replace",
      findings: "Outer race spalling on the drive-end bearing.",
      laborHours: 5.5,
      predictionVerdict: null,
      checklist: allDone(b, wo.id),
    });
    expect(done.status).toBe("completed");
    expect(done.closeOut?.cause).toBe("2.4");
    move("verified");
    const closed = move("closed");
    expect(closed.history.map((e) => e.to)).toEqual([
      "requested",
      "triaged",
      "planned",
      "scheduled",
      "approved",
      "in_progress",
      "completed",
      "verified",
      "closed",
    ]);
  });

  it("refuses moves the lifecycle doesn't allow", () => {
    const b = makeBackend();
    const wo = b.request("workOrders.list", { status: ["requested"], limit: 1 }).items[0]!;
    expect(() => b.request("workOrders.transition", { workOrderId: wo.id, to: "in_progress" })).toThrowError(ApiFailure);
  });

  it("a close-out verdict on predictive work becomes the prediction's feedback", () => {
    const b = makeBackend();
    // Set up our own data rather than hoping the random seed has a suitable work order.
    const p = b.request("predictions.list", { status: ["open"], limit: 1 }).items[0]!;
    const tech = b.request("users.list", { role: "field_technician", limit: 1 }).items[0]!;
    const wo = b.request("workOrders.create", {
      title: "Inspect bearing",
      description: "",
      assetId: p.assetId,
      type: "predictive",
      priority: "high",
      assigneeId: tech.id,
      dueAt: null,
      source: { kind: "prediction", refId: p.id },
      evidence: null,
    });
    for (const to of ["triaged", "planned", "scheduled", "approved", "in_progress"] as const) {
      b.request("workOrders.transition", {
        workOrderId: wo.id,
        to,
        scheduledStart: to === "scheduled" ? iso(START + HOUR) : undefined,
        checklist: to === "in_progress" ? safetyOnly(b, wo.id) : undefined,
      });
    }
    b.request("workOrders.closeOut", {
      workOrderId: wo.id,
      failureMode: "VIB",
      cause: "2.4",
      remedy: "replace",
      findings: "Bearing wear confirmed as predicted.",
      laborHours: 8,
      predictionVerdict: "true_positive",
      checklist: allDone(b, wo.id),
    });
    expect(b.request("predictions.get", { predictionId: wo.source.refId! }).feedback).toBe("true_positive");
  });
});

describe("checklists", () => {
  it("every work order has one, and finished work has every line done", () => {
    const { items } = makeBackend().request("workOrders.list", { limit: 500 });
    for (const wo of items) {
      expect(wo.checklist.length, wo.number).toBeGreaterThan(0);
      if (["completed", "verified", "closed"].includes(wo.status)) {
        expect(
          wo.checklist.every((i) => (i.kind === "reading" ? i.value !== null : i.done)),
          wo.number,
        ).toBe(true);
      }
    }
  });

  it("won't start work until every safety check is confirmed", () => {
    const b = makeBackend();
    const wo = b.request("workOrders.list", { status: ["approved"], limit: 1 }).items[0]!;
    const start = (checklist?: { itemId: string; done: boolean; value: null }[]) =>
      b.request("workOrders.transition", { workOrderId: wo.id, to: "in_progress", checklist });
    expect(() => start()).toThrowError(/safety check/);
    expect(() => start(safetyOnly(b, wo.id).slice(1))).toThrowError(/safety check/);
    expect(start(safetyOnly(b, wo.id)).status).toBe("in_progress");
  });

  it("won't complete work with required steps or readings missing, and stores the readings", () => {
    const b = makeBackend();
    const wo = b.request("workOrders.list", { status: ["in_progress"], type: ["corrective", "preventive"], limit: 1 }).items[0]!;
    const closeOut = (checklist: { itemId: string; done: boolean; value: number | null }[]) =>
      b.request("workOrders.closeOut", {
        workOrderId: wo.id,
        failureMode: "VIB",
        cause: "2.4",
        remedy: "replace",
        findings: "Bearing worn and replaced.",
        laborHours: 2,
        predictionVerdict: null,
        checklist,
      });
    const results = allDone(b, wo.id);
    expect(() => closeOut(results.slice(0, -1).map((r) => ({ ...r, done: false })))).toThrowError(/required checklist items/);
    expect(b.request("workOrders.get", { workOrderId: wo.id }).status).toBe("in_progress");
    const done = closeOut(results);
    expect(done.status).toBe("completed");
    for (const item of done.checklist.filter((i) => i.kind === "reading")) expect(item.value).toBe(3);
  });

  it("refuses results for items that aren't on the checklist", () => {
    const b = makeBackend();
    const wo = b.request("workOrders.list", { status: ["approved"], limit: 1 }).items[0]!;
    expect(() =>
      b.request("workOrders.transition", {
        workOrderId: wo.id,
        to: "in_progress",
        checklist: [{ itemId: "nope", done: true, value: null }],
      }),
    ).toThrowError(/Unknown checklist item/);
  });
});
