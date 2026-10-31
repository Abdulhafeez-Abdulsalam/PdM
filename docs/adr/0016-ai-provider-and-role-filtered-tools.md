# ADR-0016: The AI provider on the server, and tools filtered by role

- **Status:** Accepted
- **Date:** 2026-10-31

## Context
[ADR-0010](0010-ai-provider-interface.md) put the copilot and daily briefing behind an "AI provider" idea, scripted for now, so a real model could replace it later with its key kept on a server. Phase 5 now has that server ([plan](../phase-5-plan.md), chunk 5). It was decided with the user to **keep the copilot scripted** (no API key, no cost) but make the code ready for a real model.

A real model answers questions by calling **tools**: functions the application offers, each with a name, a description and a JSON Schema for its input. Whatever tools a model is given, it may use, so the tools decide what it can see. The copilot answers in the name of the person asking, so it must never see more than that person can.

## Decision
- **`AiProvider`** (in `contracts/src/ai.ts`): `ask(question, toolbox)` and `dailyBriefing(request, toolbox)`, both **asynchronous**, as a model call over the network is. `ScriptedAiProvider` (mock-data) is the only implementation; its name, "scripted", is shown with each answer.
- **Tools are read endpoints from the contracts** (`AI_TOOL_MODULES`: 13 reads, from assets and predictions to ESG and financials), each with the endpoint's description and its input as JSON Schema (`z.toJSONSchema`). Requests that change something are never tools: anything the copilot suggests doing is still a button the person confirms.
- **Filtered by role**: a role gets a tool only if it can *see* that tool's module in the menu (`mayUseTool`). That's stricter than plain reads over HTTP (open to anyone signed in, [ADR-0014](0014-sessions-and-server-role-checks.md)): a model speaks for the person, so it stays within their screens.
- **The toolbox enforces it**: `toolboxFor(person)` lists the person's tools, and its `call` refuses any other tool (403 `forbidden`) whatever the provider asks for, then makes the read *as that person*. Tested with a provider that reaches for a tool it wasn't given.
- **A provider's answer is checked against the contract** before anyone sees it, like every other answer. A model can return anything; a malformed answer becomes an `internal` error, not a broken screen. Tested.
- **The scripted copilot uses the toolbox**: a question needing a tool the role lacks gets "that's outside what your role can see" and suggestions it *can* answer; an asset's condition leaves out sections the role can't see (no predictions for a technician). The copilot panel only offers example questions the role can ask.
- **The scripted briefing is the exception**: it's still built from the simulation directly, but it summarises only what the Command Center shows, which every role can see. A model's provider would build it from the toolbox.
- **`requestAsync`** (mock-data) answers the two AI endpoints through the provider and everything else as before. The browser's worker and the server both use it, so demo mode and server mode behave the same.
- **`GET /api/ai/tools`** shows the signed-in person the provider's name and exactly the tools a model would get for them.

## Consequences
- Plugging in a real model means writing one class: `LlmAiProvider.ask(question, toolbox)` sends the question and `toolbox.tools` to the model, runs each tool call it asks for through `toolbox.call`, and turns the model's reply into a `CopilotAnswer`. The key stays on the server; nothing else changes.
- Still to decide before a real model: which model and provider, cost limits, logging prompts and answers (without personal data), and how to handle a model that's slow or unavailable.
- Role filtering is by module. Finer limits (a technician seeing only their own site) would narrow the tools' inputs too.
