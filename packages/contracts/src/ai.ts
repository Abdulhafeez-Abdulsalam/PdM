/**
 * Ready for a real AI model (ADR-0010, ADR-0016). The copilot and the daily briefing come from an
 * **AI provider**: scripted today, a real model later. Whatever the provider, it sees the plant only
 * through **tools**: read requests from the contracts, each with a description and a JSON Schema for
 * its input (the form model APIs expect), offered only if the signed-in person's role can see that
 * module. So a model can never see more than the person it answers.
 */
import { z } from "zod";
import { canSee, type ModuleId } from "./access";
import type { Briefing } from "./briefing";
import type { AskRequest, CopilotAnswer } from "./copilot";
import { changesThings, endpoints, type EndpointInput, type EndpointName, type EndpointOutput } from "./endpoints";
import type { RoleId } from "./users";

/** The read requests a model may use, and the module whose screens show what each returns. */
export const AI_TOOL_MODULES = {
  "assets.list": "assets",
  "assets.get": "assets",
  "risks.top": "command-center",
  "kpis.get": "command-center",
  "predictions.list": "predictive",
  "alarms.list": "alarms",
  "workOrders.list": "maintenance",
  "pm.overview": "maintenance",
  "reliability.summary": "reliability",
  "inventory.overview": "inventory",
  "hse.overview": "hse",
  "esg.overview": "esg",
  "financials.overview": "financials",
} as const satisfies Partial<Record<EndpointName, ModuleId>>;

export type AiToolName = keyof typeof AI_TOOL_MODULES;

export interface AiTool {
  name: AiToolName;
  description: string;
  /** What the tool takes, as JSON Schema: how a model is told what it may pass. */
  inputSchema: Record<string, unknown>;
}

/** May this role use this tool? Only reads, and only of modules the role can see (in the menu). */
export function mayUseTool(role: RoleId, name: AiToolName): boolean {
  return !changesThings(name) && canSee(role, AI_TOOL_MODULES[name]);
}

/** The tools for this role, described for a model. */
export function aiToolsFor(role: RoleId): AiTool[] {
  return (Object.keys(AI_TOOL_MODULES) as AiToolName[])
    .filter((name) => mayUseTool(role, name))
    .map((name) => ({
      name,
      description: endpoints[name].description,
      inputSchema: z.toJSONSchema(endpoints[name].input, { io: "input" }) as Record<string, unknown>,
    }));
}

/** What a provider is given: the tools it may use, and a way to call them. Nothing else. */
export interface AiToolbox {
  tools: readonly AiTool[];
  /** Calls a tool, as the signed-in person. A tool that isn't in `tools` is refused (forbidden). */
  call<N extends AiToolName>(name: N, input: EndpointInput<N>): Promise<EndpointOutput<N>>;
}

export interface AiProvider {
  /** Shown with each answer ("scripted", or a model's name). */
  readonly name: string;
  ask(request: AskRequest, toolbox: AiToolbox): Promise<CopilotAnswer>;
  dailyBriefing(request: EndpointInput<"briefing.daily">, toolbox: AiToolbox): Promise<Briefing>;
}
