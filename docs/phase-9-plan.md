# Phase 9 plan: a real AI model behind the copilot

Chosen on 2026-11-15. Today the copilot is **scripted**: it recognises seven kinds of question by keywords and fills in templates. This phase puts a real model, Claude, behind the same interface, so it can answer questions nobody anticipated, from the plant's own data.

The groundwork is done ([ADR-0016](adr/0016-ai-provider-and-role-filtered-tools.md)): the copilot already talks to an `AiProvider`, and a provider sees the plant only through 13 read-only **tools**, filtered by the asker's role. A model plugs in there, and can never see more than the person asking.

## How it will work

1. A person asks a question. The server (never the browser) sends it to Claude with the tools that person's role allows.
2. Claude asks for data by calling tools ("list predictions for pumps"). The server runs each call as that person, and sends back the result.
3. Claude writes the answer in the copilot's existing shape: paragraphs with citations, suggested actions, follow-up questions. The server checks it against the contract before showing it.
4. Anything that changes the plant (raising a work order) stays a suggestion the person must confirm, as now.

## Chunks, in order

| # | Chunk | What you get | Notes |
| --- | --- | --- | --- |
| 1 | **The Claude provider** | A `ClaudeAiProvider` on the server, using the official Anthropic SDK: the tool loop, the answer in the contract's shape, checked before it's shown. Chosen with a setting (`AI_PROVIDER=claude`); the default stays scripted. If the model fails, refuses or times out, the scripted answer is given and says so | Tested with a stand-in for the API, so tests and CI need no key and cost nothing |
| 2 | **Limits and honesty** | A cap on questions per person per minute and on spend per day; a ceiling on tool calls per question; each answer says which model wrote it; token use logged; the stable part of each request cached to cut cost | A model's answer can be wrong: the label and the citations let people check |
| 3 | **Trying it for real** | You add your own API key; a small script asks a set of real questions and saves the answers; the prompt is tuned on what we see; a short written evaluation | The first step that costs money, and needs you |
| 4 | **Review** | Suites, criteria, the demo script, what it costs per question, measured | |

## Decisions for you

- **Which model.** Recommended: **Claude Opus 5.5** (`claude-opus-5-5`), the current default Claude model, set in one place (`AI_MODEL`) so you can change it. Rough cost per question, to be measured in chunk 3: about $0.10 on Opus 5.5, about half that on Sonnet 5.5, under one cent on Haiku 5.5 (list prices of $4/$20, $2/$10 and $0.10/$0.50 per million tokens in and out).
- **The API key is yours.** You'd create an Anthropic API account and key, and put it in an environment variable on your computer (`ANTHROPIC_API_KEY`). It never goes in the repository (which is public), and I won't type or see it. Every question then costs you real money, which is why chunk 2 adds caps before chunk 3 turns it on.
- **Demo mode stays scripted.** With no server there's nowhere safe to keep a key: anything in the browser can be read by anyone. The real model works in server mode only (`npm start`).
- **The daily briefing stays scripted for now.** It loads with every Command Center visit, so a model there would cost far more than the copilot. Worth a later look, with caching.

## Things to keep in mind

- **Data leaves the server.** Questions and the tool results go to Anthropic's API. Here it's simulated data. With a real plant, that would need the company's agreement.
- **Text in the plant's data is data, not instructions.** Comments and alarm messages can contain anything; the model is told to treat tool results as information only, and it has no tool that changes anything.
- **Tests stay free and repeatable**: the scripted provider remains the default everywhere a test runs.
- Both backends, contracts first; every commit pushed after `npm run check`; ask before each chunk.
