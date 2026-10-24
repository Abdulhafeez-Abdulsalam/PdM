import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { HOUR, iso } from "./clock";
import { ApiFailure } from "./errors";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const makeBackend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "hse_officer" });
const b = makeBackend();

describe("permits to work", () => {
  it("starts with issued permits for work under way and requested ones for scheduled work", () => {
    const permits = b.request("hse.permits", {}).items;
    const wos = b.request("workOrders.list", { status: ["scheduled", "approved", "in_progress"], limit: 500 }).items;
    for (const wo of wos) {
      const mine = permits.filter((p) => p.workOrderId === wo.id);
      if (wo.type === "inspection" || wo.type === "calibration") expect(mine).toHaveLength(0);
      else expect(mine.map((p) => p.status)).toEqual([wo.status === "scheduled" ? "requested" : "issued"]);
    }
    // Waiting ones first.
    expect(permits[0]!.status).toBe("requested");
  });

  it("follows the work: raised when scheduled, issued, required to start, closed at close-out", () => {
    const backend = makeBackend();
    const tech = backend.request("users.list", { role: "field_technician" }).items[0]!;
    const wo = backend.request("workOrders.create", {
      title: "Replace seal on transformer",
      description: "",
      assetId: [...backend.world.assets.values()].find((a) => a.data.assetClass === "transformer")!.data.id,
      type: "corrective",
      priority: "high",
      assigneeId: null,
      dueAt: null,
      source: { kind: "manual", refId: null },
      evidence: null,
    });
    const move = (to: "triaged" | "planned" | "scheduled" | "approved" | "in_progress", extra = {}) =>
      backend.request("workOrders.transition", { workOrderId: wo.id, to, ...extra });
    move("triaged");
    move("planned");
    expect(backend.request("hse.permits", { workOrderId: wo.id }).items).toHaveLength(0);
    move("scheduled", { scheduledStart: iso(START + 2 * HOUR), assigneeId: tech.id });
    const [permit] = backend.request("hse.permits", { workOrderId: wo.id }).items;
    expect(permit).toMatchObject({ status: "requested", type: "electrical_isolation" });
    move("approved");
    const safety = backend
      .request("workOrders.get", { workOrderId: wo.id })
      .checklist.filter((i) => i.kind === "safety")
      .map((i) => ({ itemId: i.id, done: true, value: null }));
    expect(() => move("in_progress", { checklist: safety })).toThrowError(/hasn't been issued/);
    expect(backend.request("hse.issuePermit", { permitId: permit!.id }).status).toBe("issued");
    expect(() => backend.request("hse.issuePermit", { permitId: permit!.id })).toThrowError(ApiFailure);
    move("in_progress", { checklist: safety });
    backend.request("workOrders.closeOut", {
      workOrderId: wo.id,
      failureMode: "ELP",
      cause: "1.1",
      remedy: "replace",
      findings: "Seal replaced, no further leaks.",
      laborHours: 3,
      predictionVerdict: null,
      checklist: backend
        .request("workOrders.get", { workOrderId: wo.id })
        .checklist.map((i) => ({ itemId: i.id, done: true, value: i.kind === "reading" ? 3 : null })),
    });
    expect(backend.request("hse.permits", { workOrderId: wo.id }).items[0]!.status).toBe("closed");
  });
});

describe("HSE overview", () => {
  it("lists safety-critical elements, impaired ones first, each saying why", () => {
    const o = b.request("hse.overview", {});
    expect(o.counts.sces).toBe(o.sces.length);
    expect(o.counts.impaired).toBe(o.sces.filter((s) => s.reasons.length > 0).length);
    expect(o.counts.impaired).toBeGreaterThan(0);
    for (let i = 1; i < o.sces.length; i++) expect(o.sces[i - 1]!.reasons.length).toBeGreaterThanOrEqual(o.sces[i]!.reasons.length);
    for (const s of o.sces) {
      if (s.reasons.includes("health")) expect(["warning", "critical"]).toContain(s.health);
      const a = b.world.assets.get(s.assetId)!;
      expect(
        ["psv", "pressure_vessel", "pipeline_segment", "storage_tank", "fired_heater", "separator"].includes(a.data.assetClass) ||
          a.data.criticality === 5,
      ).toBe(true);
    }
  });

  it("finds process safety events in the failure history, and near misses at every site", () => {
    const incidents = b.request("hse.incidents", {}).items;
    const pse = incidents.filter((i) => i.kind === "process_safety_event");
    expect(pse.length).toBeGreaterThan(0);
    for (const i of pse) {
      expect(i.failureId).not.toBeNull();
      if (i.tier === 1) expect(b.world.assets.get(i.assetId!)!.data.criticality).toBe(5);
    }
    const sites = new Set(incidents.filter((i) => i.kind === "near_miss").map((i) => i.siteId));
    expect(sites.size).toBe(new Set([...b.world.assets.values()].map((a) => a.data.siteId)).size);
    const backend = makeBackend();
    const reported = backend.request("hse.reportIncident", { kind: "near_miss", assetId: "PBU-PMP-106", title: "Loose guard on coupling" });
    expect(backend.request("hse.incidents", {}).items[0]!.id).toBe(reported.id);
  });
});

describe("management of change", () => {
  it("goes from proposed through review to implemented, and needs a reason to reject", () => {
    const backend = makeBackend();
    expect(backend.request("hse.mocs", {}).items.length).toBeGreaterThanOrEqual(5);
    const moc = backend.request("hse.createMoc", {
      title: "Change the lube oil grade",
      description: "Move to a synthetic oil with a longer life.",
      assetId: "PBU-PMP-106",
      kind: "equipment",
      risk: "low",
    });
    expect(() => backend.request("hse.mocTransition", { mocId: moc.id, to: "implemented" })).toThrowError(ApiFailure);
    expect(() => backend.request("hse.mocTransition", { mocId: moc.id, to: "rejected" })).toThrowError(ApiFailure);
    for (const to of ["under_review", "approved", "implemented"] as const) backend.request("hse.mocTransition", { mocId: moc.id, to });
    const done = backend.request("hse.mocs", {}).items.find((m) => m.id === moc.id)!;
    expect(done.history.map((h) => h.to)).toEqual(["proposed", "under_review", "approved", "implemented"]);
  });
});
