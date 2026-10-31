# Phase 5 plan: a real backend

*Agreed 2026-10-30. Decisions made with the user on 2026-10-29; PostgreSQL was considered on 2026-10-30 and SQLite kept.*

Phases 1–4 built the whole frontend on a fake backend that lives inside the browser (the mock, [ADR-0004](adr/0004-mock-backend-in-web-worker.md)). The [Phase 4 review](phase-4-review.md) listed what only a real server can do: **enforce roles on every request**, **keep what people do** after a reload or restart, and later **host a real AI model** with its key kept off the browser. Phase 5 builds that server, step by step, without changing a single page: the app already talks to one "transport" switch point, and every request and response is already defined in `packages/contracts`.

## The big idea: a simulated plant, real actions

There is still no real plant to connect to, so the server runs **the same simulation** as the demo: the same seed and the same moment always give the same assets, readings and faults. What becomes real is **what people do**:

- **Who** is asking: a signed-in person with a session the server checks.
- **What they may do**: the server refuses requests their role doesn't allow, whatever the screen shows.
- **What they did**: every change (a work order raised, an alarm acknowledged, a limit edited…) is stored in a SQLite database, in order, with who and when. When the server restarts, it rebuilds the simulation and **replays those changes**, so everything comes back exactly as it was.

That last pattern is a **command log**, a simple cousin of **event sourcing**: one table of "what happened" instead of a table per kind of thing. It fits here because the simulation is deterministic, and it means every in-memory store (work orders, permits, stock, rules, notes, approvals…) becomes persistent at once.

## Chunks, in order

| # | Chunk | What you'd see | Notes |
|---|---|---|---|
| 1 ✅ | **The server and the HTTP transport** | A new `apps/server` answering every endpoint over HTTP at the method and path the contracts already define (`GET /assets/:assetId`…), checking inputs and outputs against the contracts. The web app gains the `HttpTransport` ADR-0004 promised; one setting chooses demo mode (today's, the default) or server mode. `npm run dev:server` starts it; the Vite dev server forwards `/api` to it | Fastify (mature, fast, with built-in request testing). SQLite comes in chunk 4; Node's built-in `node:sqlite` works here, its stability to be checked then |
| 2 | **Live values and simulation controls** | Live tag values stream over a **WebSocket** using the same messages the worker uses today; the simulation clock, speed, chaos mode and storyline run on the server, so two browsers see the same plant at the same moment | The live budget (≤ 300 tags, 1 update/s) still holds |
| 3 | **Sign-in, sessions and real role checks** | A sign-in page listing the demo people; choosing one starts a **session** (an HttpOnly cookie the page's code can't read); sign-out. The server checks the role matrix on **every request** and answers 403 for anything not allowed; the audit log records the real person. The role matrix moves into `contracts`, so the screen and the server use one copy. In server mode the "viewing as" picker becomes "signed in as" | Demo sign-in, no passwords (decided). Demo mode keeps its role picker |
| 4 | **Keeping what people do: SQLite** | A database file with tables for people, sessions, the audit log and the **command log**; **migrations** (numbered SQL files that build and change the tables); on restart the server replays the command log and the simulation clock carries on where it stopped. Stop the server, start it again: every work order, permit, note and limit is still there | One file to back up; moving to PostgreSQL later changes the database layer, not the app |
| 5 | **Ready for a real AI model** | The copilot and daily briefing move behind the **AI provider interface** from [ADR-0010](adr/0010-ai-provider-interface.md) on the server, with the scripted provider as today. The read endpoints a model may use become a list of **tools**, filtered by the signed-in person's role, so a future model can see no more than that person | Scripted stays (decided); no API key, no cost |
| 6 | **Running it properly** | One command builds and starts everything: the server serves the built web app and the API together. Settings from environment variables (port, database file, seed), a health check, structured logs, security headers (a Content Security Policy), a limit on sign-in attempts, a clean shutdown. The end-to-end journeys also run against the real server. A "how to run it" section in the README | Still local, on this laptop; no internet hosting in this phase |
| 7 | **Phase 5 review** | Criteria re-tested in both modes, gaps listed, what a production deployment would still need | |

**What chunk 1 added beyond the table:** [ADR-0012](adr/0012-fastify-server-and-http-format.md): GET values travel in the query string as JSON (exact for numbers, lists and nested filters), POST values as a JSON body, one shared copy (`contracts/src/http.ts`) for the browser and the server; errors as the contract's `ApiError` with matching HTTP statuses, and internal details never leave the server. The simulation panel's controls have their own route, checked by a new schema; until sign-in (chunk 3) the browser names its demo role in an `X-Demo-Role` header. Server mode is `vite --mode server` (no env file, since `.env.*` files are kept out of git for secrets). zod went to 4.6.7 to close an advisory about memory exhaustion while validating oversized collections, which matters now that the server validates requests from the network. See [learning note 37](learning/37-http-and-the-first-server.md).

Each chunk adds an **architecture decision record** where it makes a decision (server framework, sessions, command log), server tests that make real HTTP requests, and a learning note: HTTP and REST, WebSockets, sessions and cookies, authentication vs authorisation, databases and migrations, the command log, and running a service.

## Decisions (made 2026-10-29)

| Decision | Outcome |
|---|---|
| **Server language** | **TypeScript**, in this repository: it reuses the contracts and the simulation, so the frontend and server share one language and one set of types |
| **Database** | **SQLite**: one file, nothing to install; easy to move to PostgreSQL later. PostgreSQL in Docker was weighed on 2026-10-30 (production-grade, but Docker running for every session, a gigabyte or two of this laptop's 8 GB, and a password to manage) and left for later |
| **Sign-in** | **Demo sign-in**: pick a person, get a real session, real role checks; passwords later |
| **AI** | **Keep the copilot scripted**, behind an interface ready for a real model |

## Things to keep in mind

- **Demo mode stays.** The in-browser mock remains the default: the unit tests, the accessibility tests and a no-server demo all use it. Server mode is chosen by a setting.- **No page changes for the switch.** If a page has to change to work with the server, the contracts or the transport are wrong.
- **The plant is still simulated.** Only people's actions and identities are real data.
- **Local only.** The server runs on this laptop. Putting it on the internet needs more (HTTPS, real accounts, backups, monitoring), listed in the review.
- **The budgets still hold**: ≤ 2,000 points per chart line, ≤ 300 live tags, and `npm run check` before every commit.
