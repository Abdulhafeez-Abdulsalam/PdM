import type { Alarm, Prediction, User } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { draftFromAlarm, draftFromPrediction, suggestAssignees } from "./work-order-draft";

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
  escalation: null,
  firstOut: null,
  followsAlarmId: null,
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

describe("work order draft from a prediction", () => {
  const prediction: Prediction = {
    id: "PRED-0022",
    assetId: "RKR-GEN-101",
    failureMode: { code: "BRD", label: "Stator insulation degradation" },
    probability: 0.87,
    horizonDays: 7,
    confidence: 0.91,
    detectedAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-10-10T08:00:00Z",
    status: "open",
    modelId: "generator-health",
    modelVersion: "2.4.1",
    rul: { p10Days: 2, p50Days: 3, p90Days: 5, estimatedAt: "2026-10-10T08:00:00Z" },
    contributions: [],
    dataQuality: [],
    evidenceTagIds: ["RKR-GEN-101.PD_ACTIVITY"],
    recommendedAction: {
      summary: "Offline insulation tests (PI, tan δ) at next outage",
      actBy: "2026-10-11T00:00:00Z",
      interventionCost: { amount: 105_700, currency: "USD" },
      failureCost: { amount: 1_100_000, currency: "USD" },
    },
    feedback: null,
    workOrderId: null,
  };

  it("is urgent when likely and soon, predictive, and due no later than 'act by'", () => {
    const d = draftFromPrediction(prediction, NOW, (n) => `$${n}`);
    expect(d.priority).toBe("urgent");
    expect(d.type).toBe("predictive");
    expect(d.dueDate).toBe("2026-10-11"); // act-by beats the 3-day default
    expect(d.description).toContain("$105700 vs $1100000");
  });

  it("is normal priority when failure is months away", () => {
    const later = { ...prediction, probability: 0.4, rul: { ...prediction.rul!, p50Days: 80 } };
    expect(draftFromPrediction(later, NOW, String).priority).toBe("normal");
  });
});

describe("assignee suggestions", () => {
  it("puts technicians from the asset's site first", () => {
    const tech = (id: string, siteIds: string[]): User => ({ id, name: id, role: "field_technician", title: "", crewId: null, siteIds });
    const order = suggestAssignees([tech("far", ["PBU"]), tech("near", ["CBC", "PCS"])], "CBC").map((u) => u.id);
    expect(order).toEqual(["near", "far"]);
  });
});
