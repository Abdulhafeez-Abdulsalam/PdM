/**
 * The scripted AI provider (ADR-0010, ADR-0016): the only one so far. It answers with templates
 * instead of a model, but through the same interface a real model's provider would implement, and
 * its copilot reads the plant only through the toolbox it's given (the asker's tools).
 *
 * The daily briefing is the one exception: it's built from the simulation directly, as before. It
 * only summarises what the Command Center shows, which every role can see. A model's provider
 * would build it from the toolbox like everything else.
 */
import type { AiProvider, AiToolbox, AskRequest, Briefing, CopilotAnswer, EndpointInput } from "@pdm/contracts";
import { askCopilot } from "./copilot";
import type { World } from "./world";

/** What the scripted provider needs from the simulation. */
export interface ScriptedSource {
  world: World;
  now(): number;
  scriptedBriefing(scopeId: string | undefined): Briefing;
}

export class ScriptedAiProvider implements AiProvider {
  readonly name = "scripted";

  constructor(private readonly source: ScriptedSource) {}

  ask(request: AskRequest, toolbox: AiToolbox): Promise<CopilotAnswer> {
    return askCopilot(request, { world: this.source.world, now: this.source.now(), toolbox });
  }

  async dailyBriefing({ scopeId }: EndpointInput<"briefing.daily">): Promise<Briefing> {
    return this.source.scriptedBriefing(scopeId);
  }
}
