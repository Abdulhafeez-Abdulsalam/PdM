import { aiToolsFor, type AiProvider, type CopilotAnswer, type RoleId } from "@pdm/contracts";
import { describe, expect, it } from "vitest";
import { createMockBackend } from "./backend";
import { COPILOT_EXAMPLES } from "./copilot";

const START = Date.UTC(2026, 9, 10, 8, 0, 0);
const b = createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role: "plant_manager" });
const ask = (question: string, scopeId?: string) => b.requestAsync("copilot.ask", { question, scopeId });

describe("copilot", () => {
  it("routes each example to the question it was built for", async () => {
    expect((await Promise.all(COPILOT_EXAMPLES.map((q) => ask(q)))).map((a) => a.intent)).toEqual([
      "likely_failures",
      "asset_status",
      "urgent_alarms",
      "maintenance_backlog",
      "value",
      "emissions",
      "spare_parts",
    ]);
  });

  it("cites every paragraph, and every citation points at something that exists", async () => {
    for (const q of COPILOT_EXAMPLES) {
      for (const p of (await ask(q)).paragraphs) {
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

  it("agrees with the predictions list: kind of equipment, place named in the question, and time span", async () => {
    const a = await ask("Which pumps in Gulf Coast Midstream are likely to fail within 2 weeks?", "EBC");
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

  it("suggests a work order for the riskiest failure, but only suggests it: asking changes nothing", async () => {
    const before = b.request("workOrders.list", { limit: 1 }).total;
    const a = await ask("Which assets are likely to fail in the next 90 days?");
    const raise = a.actions.find((x) => x.kind === "create_work_order");
    if (raise) expect(raise).toMatchObject({ assetId: expect.any(String), predictionId: expect.any(String) });
    expect(b.request("workOrders.list", { limit: 1 }).total).toBe(before);
    expect(b.request("admin.audit", {}).total).toBe(0);
  });

  it("says what it can answer when it doesn't understand", async () => {
    const a = await ask("Tell me a joke");
    expect(a).toMatchObject({ intent: "unknown", understoodAs: null, actions: [] });
    expect(a.followUps).toEqual(COPILOT_EXAMPLES);
  });
});

describe("the AI provider and its tools (ADR-0016)", () => {
  const backendAs = (role: "field_technician" | "esg_lead" | "plant_manager", ai?: AiProvider) =>
    createMockBackend({ seed: 42, startTime: START, realNow: () => 0, role, ai });

  it("offers each role only reads of what its screens show, each described for a model", () => {
    const names = (role: RoleId) => aiToolsFor(role).map((t) => t.name);
    expect(names("plant_manager")).toContain("financials.overview");
    expect(names("field_technician")).not.toContain("predictions.list"); // Predictive is hidden for technicians
    expect(names("field_technician")).not.toContain("financials.overview");
    expect(names("esg_lead")).toContain("esg.overview");
    expect(names("esg_lead")).not.toContain("alarms.list");
    for (const tool of aiToolsFor("plant_manager")) {
      expect(tool.description.length, tool.name).toBeGreaterThan(10);
      expect(tool.inputSchema, tool.name).toMatchObject({ type: "object" });
    }
  });

  it("declines a question about what the asker's role can't see, and suggests ones it can answer", async () => {
    const esg = backendAs("esg_lead");
    const a = await esg.requestAsync("copilot.ask", { question: "Which alarms are urgent right now?" });
    expect(a.paragraphs[0]!.text).toMatch(/outside what your role can see/);
    expect(a.paragraphs.some((p) => /ALM-/.test(p.text))).toBe(false);
    expect(a.followUps).toContain("What are our emissions?");
    expect(a.followUps).not.toContain("Which alarms are urgent right now?");
    // An asset's condition, without the predictions a technician's screens don't show.
    const tech = backendAs("field_technician");
    const status = await tech.requestAsync("copilot.ask", { question: "How is CBC-GT-101?" });
    expect(status.intent).toBe("asset_status");
    expect(status.paragraphs.some((p) => /prediction/i.test(p.text))).toBe(false);
  });

  it("refuses a tool the provider wasn't given, whatever the provider asks for", async () => {
    const greedy: AiProvider = {
      name: "greedy",
      ask: async (request, toolbox) => {
        await toolbox.call("financials.overview", {}); // not in a technician's toolbox
        throw new Error("should not get here");
      },
      dailyBriefing: () => Promise.reject(new Error("unused")),
    };
    await expect(
      backendAs("field_technician", greedy).requestAsync("copilot.ask", { question: "Show me the money" }),
    ).rejects.toMatchObject({
      code: "forbidden",
    });
  });

  it("checks a provider's answer against the contract, as a model's must be", async () => {
    const sloppy: AiProvider = {
      name: "sloppy",
      ask: async () => ({ question: "?", intent: "made_up" }) as unknown as CopilotAnswer,
      dailyBriefing: () => Promise.reject(new Error("unused")),
    };
    await expect(backendAs("plant_manager", sloppy).requestAsync("copilot.ask", { question: "Anything" })).rejects.toMatchObject({
      code: "internal",
    });
  });
});
