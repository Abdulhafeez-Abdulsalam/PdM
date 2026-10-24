import { FMEA_RPN_ACT, FMEA_SEVERITY_ACT } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { ApiFailure } from "./errors";
import { occurrenceScore, strategyFor } from "./rca";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const makeBackend = () => createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "reliability_engineer" });

describe("FMEA", () => {
  it("scores every failure mode the type has, highest risk first", () => {
    const b = makeBackend();
    const f = b.request("reliability.fmea", { assetClass: "pump" });
    expect(f.rows.map((r) => r.mode).sort()).toEqual(["BRD", "ELP", "LOO", "VIB"]);
    for (const r of f.rows) {
      expect(r.rpn).toBe(r.severity * r.occurrence * r.detection);
      expect(r.act).toBe(r.rpn >= FMEA_RPN_ACT || r.severity >= FMEA_SEVERITY_ACT);
    }
    for (let i = 1; i < f.rows.length; i++) expect(f.rows[i - 1]!.rpn).toBeGreaterThanOrEqual(f.rows[i]!.rpn);
  });

  it("gives credit for a predictive model watching a mode", () => {
    const vib = makeBackend()
      .request("reliability.fmea", { assetClass: "pump" })
      .rows.find((r) => r.mode === "VIB")!;
    expect(vib.monitored).toBe(true); // bearing wear is modelled for rotating equipment
    expect(vib.detection).toBeLessThanOrEqual(2);
    expect(vib.strategy).toBe("condition_based");
  });

  it("bands occurrence and picks a strategy from β", () => {
    expect(occurrenceScore(0)).toBe(1);
    expect(occurrenceScore(0.15)).toBe(5);
    expect(occurrenceScore(5)).toBe(10);
    expect(strategyFor({ severity: 7, monitored: false, pattern: "wear_out" })).toBe("time_based");
    expect(strategyFor({ severity: 7, monitored: false, pattern: "infant_mortality" })).toBe("redesign");
    expect(strategyFor({ severity: 2, monitored: false, pattern: "random" })).toBe("run_to_failure");
    expect(strategyFor({ severity: 8, monitored: true, pattern: "wear_out" })).toBe("condition_based");
  });
});

describe("root-cause analysis", () => {
  it("starts with two investigations on the most-failing assets", () => {
    const b = makeBackend();
    const { items } = b.request("rca.list", {});
    expect(items).toHaveLength(2);
    const reviewed = b.request("rca.get", { rcaId: items.find((i) => i.status === "in_review")!.id });
    expect(reviewed.whys.every((w) => w.length > 0)).toBe(true);
    expect(reviewed.rootCause.length).toBeGreaterThan(10);
    expect(reviewed.timeline.some((e) => e.kind === "failure")).toBe(true);
  });

  it("is created, filled in and closed", () => {
    const b = makeBackend();
    const rca = b.request("rca.create", { assetId: "CBC-GT-101", title: "Spurious trips on GT-101" });
    expect(rca.status).toBe("open");
    // Closing needs a root cause.
    expect(() => b.request("rca.update", { rcaId: rca.id, status: "closed" })).toThrowError(ApiFailure);
    const filled = b.request("rca.update", {
      rcaId: rca.id,
      whys: [
        "Tripped on flame loss",
        "Flame detector read low",
        "Lens dirty",
        "Not in the PM routine",
        "Routine copied from an older model",
      ],
      fishbone: {
        people: [],
        machine: ["Flame detector lens fouled"],
        method: ["PM routine misses the lens"],
        material: [],
        measurement: [],
        environment: [],
      },
      rootCause: "The PM routine for this model leaves out the flame detector lens.",
      status: "closed",
    });
    expect(filled.status).toBe("closed");
    expect(filled.fishbone.machine).toEqual(["Flame detector lens fouled"]);
    // Closed means read-only until reopened.
    expect(() => b.request("rca.update", { rcaId: rca.id, rootCause: "x" })).toThrowError(ApiFailure);
    expect(b.request("rca.update", { rcaId: rca.id, status: "open" }).status).toBe("open");
  });

  it("turns a corrective action into a work order that points back to it", () => {
    const b = makeBackend();
    const rca = b.request("rca.create", { assetId: "PBU-PMP-101", title: "Seal leaks on PMP-101" });
    const after = b.request("rca.addAction", {
      rcaId: rca.id,
      text: "Fit the upgraded seal kit at the next overhaul",
      createWorkOrder: true,
    });
    const action = after.actions[0]!;
    expect(action.workOrderId).not.toBeNull();
    const wo = b.request("workOrders.get", { workOrderId: action.workOrderId! });
    expect(wo.source).toEqual({ kind: "rca", refId: rca.id });
    expect(wo.assetId).toBe("PBU-PMP-101");
    // And the work order shows up on the investigation's timeline.
    expect(after.timeline.some((e) => e.kind === "work_order" && e.refId === wo.id)).toBe(true);
    // An action can also be just a note.
    expect(
      b.request("rca.addAction", { rcaId: rca.id, text: "Brief the night shift", createWorkOrder: false }).actions[1]!.workOrderId,
    ).toBeNull();
  });

  it("refuses unknown investigations and assets", () => {
    const b = makeBackend();
    expect(() => b.request("rca.get", { rcaId: "RCA-999" })).toThrowError(ApiFailure);
    expect(() => b.request("rca.create", { assetId: "NOPE-1", title: "Does not exist" })).toThrowError(ApiFailure);
  });
});
