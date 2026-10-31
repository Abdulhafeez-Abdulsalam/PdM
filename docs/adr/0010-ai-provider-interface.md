# ADR-0010: Scripted AI behind a provider interface

- **Status:** Accepted (extended by [ADR-0016](0016-ai-provider-and-role-filtered-tools.md): the provider on the server, with role-filtered tools)
- **Date:** 2026-10-10

## Context
The spec includes an AI daily briefing and a natural-language copilot ("Which compressors in the Permian are likely to fail in 30 days?"). A real AI model needs an API key, and **API keys must never be placed in frontend code** (anyone could copy them). That requires a backend, which we don't have yet.

## Decision
Define an interface the UI talks to:

```ts
interface AiProvider {
  dailyBriefing(scope: AssetScope): Promise<Briefing>;          // text + citations
  ask(question: string, context: AskContext): Promise<Answer>;   // text + charts + citations + suggested actions
}
```

- **Today:** `ScriptedAiProvider` builds answers from the mock data with templates and simple query matching. Every claim cites the data it came from.
- **Later:** `LlmAiProvider` calls the company's backend, which calls a real model (e.g. Claude) with the key kept server-side.
- **Guarded actions:** any action the AI suggests (e.g. "create work order") shows a confirmation dialog. The AI never acts on its own.

## Consequences
- ✅ The full UI (chat panel, citations, suggested actions) can be built and tested now.
- ✅ No secrets in the browser.
- ❌ Scripted answers only cover questions we anticipated. Unknown questions get a polite "I can answer questions about…" response with examples.
