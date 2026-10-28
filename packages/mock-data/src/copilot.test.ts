import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { COPILOT_EXAMPLES } from "./copilot";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const b = createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "plant_manager" });
const ask = (question: string, scopeId?: string) => b.request("copilot.ask", { question, scopeId });

describe("copilot", () => {
  it("routes each example to the question it was built for", () => {
    expect(COPILOT_EXAMPLES.map((q) => ask(q).intent)).toEqual([
      "likely_failures",
      "asset_status",
      "urgent_alarms",
      "maintenance_backlog",
      "value",
      "emissions",
      "spare_parts",
    ]);
  });

  it("cites every paragraph, and every citation points at something that exists", () => {
    for (const q of COPILOT_EXAMPLES) {
      for (const p of ask(q).paragraphs) {
        expect(p.citations.length, `${q}: ${p.text}`).toBeGreaterThan(0);
        for (const c of p.citations) {
          if (c.kind === "asset") expect(b.world.assets.has(c.id)).toBe(true);
          if (c.kind === "prediction") expect(b.request("predictions.get", { predictionId: c.id }).id).toBe(c.id);
          if (c.kind === "work_order") expect(b.request("workOrders.get", { workOrderId: c.id }).id).toBe(c.id);
          if (c.kind === "page") expect(c.id.startsWith("/")).toBe(true);
        }
      }
    }
  });

  it("agrees with the predictions list: kind of equipment, place named in the question, and time span", () => {
    const a = ask("Which pumps in Gulf Coast Midstream are likely to fail within 2 weeks?", "EBC");
    expect(a.understoodAs).toBe("Centrifugal Pumps · Gulf Coast Midstream · next 14 days");
    const expected = b.request("predictions.list", {
      scopeId: "GCM",
      status: ["open", "acknowledged", "actioned"],
      assetClass: ["pump"],
      maxRulDays: 14,
      limit: 1,
    }).total;
    expect(a.paragraphs[0]!.text).toMatch(expected === 0 ? /^No centrifugal pumps in Gulf Coast Midstream/ : new RegExp(`^${expected} `));
  });

  it("suggests a work order for the riskiest failure, but only suggests it: asking changes nothing", () => {
    const before = b.request("workOrders.list", { limit: 1 }).total;
    const a = ask("Which assets are likely to fail in the next 90 days?");
    const raise = a.actions.find((x) => x.kind === "create_work_order");
    if (raise) expect(raise).toMatchObject({ assetId: expect.any(String), predictionId: expect.any(String) });
    expect(b.request("workOrders.list", { limit: 1 }).total).toBe(before);
    expect(b.request("admin.audit", {}).total).toBe(0);
  });

  it("says what it can answer when it doesn't understand", () => {
    const a = ask("Tell me a joke");
    expect(a).toMatchObject({ intent: "unknown", understoodAs: null, actions: [] });
    expect(a.followUps).toEqual(COPILOT_EXAMPLES);
  });
});
