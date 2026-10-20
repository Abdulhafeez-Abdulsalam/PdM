import { describe, expect, it } from "vitest";
import { type z } from "zod";
import {
  ALARM_PRIORITY_HEALTH,
  AlarmPriority,
  ClientMessage,
  HistoryRequest,
  Prediction,
  RulEstimate,
  ServerMessage,
  ShelveAlarmRequest,
  WorkOrder,
  endpoints,
  pathParams,
  pickIntervalSeconds,
} from "./index";

const NOW = "2026-10-10T08:00:00Z";
const DAY = 86_400;

describe("pickIntervalSeconds (ADR-0006)", () => {
  it.each([
    ["1 hour", 3600, 2],
    ["24 hours", DAY, 60],
    ["3 days", 3 * DAY, 300],
    ["7 days", 7 * DAY, 600],
    ["30 days", 30 * DAY, 1800],
    ["1 year", 365 * DAY, 21_600],
  ])("%s → %i s interval", (_label, range, expected) => {
    expect(pickIntervalSeconds(range)).toBe(expected);
  });

  it("never returns more than 2,000 points for any range up to 2,000 days", () => {
    for (let range = 60; range <= 2000 * DAY; range *= 1.37) {
      expect(Math.ceil(range / pickIntervalSeconds(range))).toBeLessThanOrEqual(2000);
    }
  });
});

describe("HistoryRequest", () => {
  const valid = { tagIds: ["GT-101.EXH_TEMP"], from: "2026-10-09T08:00:00Z", to: NOW };

  it("fills in maxPoints = 2000 by default", () => {
    expect(HistoryRequest.parse(valid).maxPoints).toBe(2000);
  });

  it("rejects `from` after `to`", () => {
    expect(HistoryRequest.safeParse({ ...valid, from: NOW, to: "2026-10-09T08:00:00Z" }).success).toBe(false);
  });

  it("rejects more than 5 tags (one chart's worth)", () => {
    const tagIds = ["a", "b", "c", "d", "e", "f"];
    expect(HistoryRequest.safeParse({ ...valid, tagIds }).success).toBe(false);
  });

  it("rejects timestamps that are not UTC ISO 8601", () => {
    expect(HistoryRequest.safeParse({ ...valid, to: "10/10/2026" }).success).toBe(false);
  });
});

describe("RulEstimate", () => {
  it("rejects percentiles out of order", () => {
    const bad = { p10Days: 30, p50Days: 20, p90Days: 40, estimatedAt: NOW };
    expect(RulEstimate.safeParse(bad).success).toBe(false);
  });
});

describe("Prediction", () => {
  const prediction = {
    id: "PRED-1",
    assetId: "GT-101",
    failureMode: { code: "PDE", label: "Compressor fouling" },
    probability: 0.72,
    horizonDays: 30,
    confidence: 0.81,
    detectedAt: NOW,
    updatedAt: NOW,
    status: "open",
    modelId: "gt-compressor-health",
    modelVersion: "3.2.0",
    rul: { p10Days: 12, p50Days: 26, p90Days: 41, estimatedAt: NOW },
    contributions: [{ tagId: "GT-101.CDP", label: "Compressor discharge pressure", weight: 0.46 }],
    dataQuality: [],
    evidenceTagIds: ["GT-101.CDP", "GT-101.CDT"],
    recommendedAction: {
      summary: "Schedule an offline water wash within 14 days",
      actBy: "2026-10-24T00:00:00Z",
      interventionCost: { amount: 18_000, currency: "USD" },
      failureCost: { amount: 640_000, currency: "USD" },
    },
    feedback: null,
    workOrderId: null,
  };

  it("accepts a complete prediction", () => {
    expect(Prediction.parse(prediction).id).toBe("PRED-1");
  });

  it("rejects a probability above 1", () => {
    expect(Prediction.safeParse({ ...prediction, probability: 1.5 }).success).toBe(false);
  });
});

describe("alarms", () => {
  it("requires a real reason to shelve", () => {
    expect(ShelveAlarmRequest.safeParse({ alarmId: "A1", reason: "  ok ", until: NOW }).success).toBe(false);
    expect(ShelveAlarmRequest.safeParse({ alarmId: "A1", reason: "Instrument tech recalibrating", until: NOW }).success).toBe(true);
  });

  it("maps every priority to a health colour", () => {
    for (const p of AlarmPriority.options) expect(ALARM_PRIORITY_HEALTH[p]).toBeDefined();
  });
});

describe("WorkOrder", () => {
  it("requires numbers shaped like WO-12345", () => {
    expect(WorkOrder.shape.number.safeParse("WO-10482").success).toBe(true);
    expect(WorkOrder.shape.number.safeParse("10482").success).toBe(false);
  });
});

describe("live messages", () => {
  it("parses a tag_values batch", () => {
    const msg = ServerMessage.parse({
      type: "tag_values",
      seq: 41,
      t: NOW,
      values: [{ tagId: "GT-101.EXH_TEMP", t: NOW, value: 562.4, quality: "good" }],
    });
    expect(msg.type).toBe("tag_values");
  });

  it("rejects subscribing to more than 300 tags at once (ADR-0005)", () => {
    const tagIds = Array.from({ length: 301 }, (_, i) => `T-${i}`);
    expect(ClientMessage.safeParse({ type: "subscribe_tags", tagIds }).success).toBe(false);
  });

  it("rejects unknown message types", () => {
    expect(ClientMessage.safeParse({ type: "subscribe_everything" }).success).toBe(false);
  });
});

describe("endpoint list", () => {
  it("declares every :pathParam in the endpoint's input", () => {
    for (const [name, def] of Object.entries(endpoints)) {
      const inputKeys = Object.keys((def.input as z.ZodObject).shape);
      for (const param of pathParams(def.path)) {
        expect(inputKeys, `${name} is missing path param "${param}"`).toContain(param);
      }
    }
  });

  it("never reuses the same method + path twice", () => {
    const routes = Object.values(endpoints).map((d) => `${d.method} ${d.path}`);
    expect(new Set(routes).size).toBe(routes.length);
  });
});
