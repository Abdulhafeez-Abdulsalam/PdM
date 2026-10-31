# Phase 5 review

Phase 5 ("toward a real backend") is complete for its six building chunks. The same app, unchanged page for page, now runs either in the browser on the simulation (demo mode, still the default) or against a **real server**:

- requests over HTTP and live values over a WebSocket, from one shared plant;
- **demo sign-in** with sessions and **role checks on every request**;
- what people do **kept in SQLite** and replayed on restart;
- the copilot behind an **AI provider** whose tools are filtered by role;
- one command to run it all, with settings, a health check, logs, security headers and a sign-in limit.

This review checks the result against the [plan](phase-5-plan.md), re-tests the acceptance criteria **in both modes**, measures what the new parts cost, and records what was found and fixed while reviewing.

*Reviewed 2026-10-31, at commit `d370de9` plus the fixes listed under "Found and fixed during this review".*

## Acceptance criteria, in both modes

| # | Criterion (as amended in [scope-decisions.md](scope-decisions.md)) | Demo mode | Server mode | Evidence |
|---|---|---|---|---|
| A | A new user finds the top 5 riskiest assets within 10 s of login | ✅ | ✅ | Demo: every role lands on its home page. Server: from clicking a person on the sign-in page to five top risks on screen, under 3 s (end-to-end test, budget 10 s). |
| B | Any prediction traces to evidence, explanation, confidence and action within 2 clicks | ✅ | ✅ | Unchanged pages and contracts; the server answers the same requests (a test compares its answers with the simulation's, value for value). |
| C | An alarm becomes an assigned work order in under 30 s | ✅ | ✅ | Two clicks in both suites. Against the server this test found the dialog problem fixed below. |
| D | A technician who loses connection keeps what they typed | ✅ | ✅ | Both suites; in server mode the reload also keeps the session (a cookie). |
| E | Dashboards stay responsive with 300 live tags at 1 update/s | ✅ | ✅ | Browser side re-measured (table below). Server side: 300 subscribed tags cost the server about 1.7 ms per tick and send about 23 KB/s to each browser. |
| F | Every screen passes automated accessibility checks in all three themes | ✅ | ✅ | All demo screens as before (axe, 0 violations). New in server mode: the sign-in page and the signed-in top bar, in all three themes: 0 violations. |
| G | No hard-coded strings, units or colours outside tokens and the text catalog | ✅ | ✅ | The new screens (sign-in page, "signed in as") use the text catalog; a missing key fails the tests. |

**Criterion E, re-measured in demo mode** (production build, Chrome, 300 live tags, 20 s of real clicks). The whole suite ran twice, before and after this review's fixes; both runs are shown, as single runs on a busy laptop vary:

| Machine (Chrome CPU) | Slowest tap | Longest freeze | Blocked per second | Budget for the slowest tap |
|---|---|---|---|---|
| This laptop (1×) | 64 / 56 ms | 0 / 0 ms | 0 / 0 ms | 100 ms |
| Older office PC (2× slower) | 104 / 96 ms | 0 / 50 ms | 0 / 0 ms | 200 ms |
| Low-end machine (4× slower) | 144 / 216 ms | 103 / 110 ms | 71 / 79 ms | 500 ms |

In line with the [Phase 4 review](phase-4-review.md) (56, 96 and 216 ms): Phase 5 changed no page and no part of the browser's live-data path.

## What Phase 5 added

| Chunk | Highlights | Decision | Learning note |
|---|---|---|---|
| 1. Server and HTTP | Fastify answering every endpoint at its contract method and path; values sent exactly (JSON in the query); errors as the contract's `ApiError`; `HttpTransport`, chosen by `vite --mode server` | [ADR-0012](adr/0012-fastify-server-and-http-format.md) | [37](learning/37-http-and-the-first-server.md) |
| 2. Live values | One WebSocket per browser carrying the worker's own messages; one plant and clock for everyone; reconnecting with backoff; same-site only | [ADR-0013](adr/0013-live-values-over-a-websocket.md) | [38](learning/38-websockets-and-a-shared-plant.md) |
| 3. Sign-in and roles | Server-side sessions in an `HttpOnly` cookie; the role matrix moved to `contracts`, one rule per endpoint; 401 and 403; the audit log names the real person | [ADR-0014](adr/0014-sessions-and-server-role-checks.md) | [39](learning/39-sign-in-sessions-and-role-checks.md) |
| 4. SQLite | A command log replayed on restart; migrations; sessions stored as fingerprints; the alarm engine made truly repeatable | [ADR-0015](adr/0015-sqlite-command-log-and-replay.md) | [40](learning/40-databases-migrations-and-the-command-log.md) |
| 5. AI provider | An asynchronous `AiProvider`; 13 read endpoints as tools, filtered by role and enforced; every answer checked against the contract | [ADR-0016](adr/0016-ai-provider-and-role-filtered-tools.md) | [41](learning/41-ai-providers-and-tools.md) |
| 6. Running it | `npm start`; settings checked at start-up; health check; JSON logs; strict Content Security Policy; sign-in limit; clean stop; browser tests against the server | [ADR-0017](adr/0017-running-the-server.md) | [42](learning/42-running-a-service.md) |

The plan's promise held: **no page changed to work with the server**. The pages that did change, changed for the roles (RCA editing, the copilot's examples) or for sign-in, and behave the same in both modes.

**Size of the safety net:** 587 unit, component and server tests (web 272, mock data 208, contracts 43, UI 34, server 25, API client 5) and 147 end-to-end tests in Chrome: the 135 demo-mode tests, and 12 against the real server. At the end of Phase 4: 541 and 135.

## Measured: restarting takes longer the longer the plant has run

Replaying the command log means moving the plant through every simulated minute since it started. Measured on this laptop, with one change a day:

| Simulated time since the database was created | Restart |
|---|---|
| 1 day | 0.7 s |
| 7 days | 6.9 s |
| 30 days | 99 s |

It grows faster than the simulated time, because **the alarm list only ever grows** (about 1,100 alarm records on day 1, 13,200 on day 16). Alarms that returned to normal but were never acknowledged are never removed, and nobody acknowledges them in an unattended demo; several parts of each minute's step look through every record, and the alarm history is re-sorted every minute. This is not new in Phase 5 (demo mode grows the same way), but replay makes it visible: at the top speed (3600×), 30 simulated days pass in 12 real minutes.

The fix is understood and contained: keep small indexes (alarms waiting to clear, shelved alarms, the active alarm per tag) instead of scanning every record, tidy up hourly instead of every minute, and, if needed, save a snapshot now and then so a restart replays only what came after it. It's listed first under "Gaps" for a decision.

**Fixed after the review** (chosen as the next step): the alarm engine keeps indexes of the alarms each minute needs (those waiting to clear, the shelved ones, the cleared ones due to be forgotten, the active one on each tag), sorts only what was added to the history since the last tidy-up, and works out each fault's limit crossings once instead of every minute. Re-measured: 0.4 s after 1 day, 5.6 s after 7, 27 s after 30, 49 s after 60, a steady 0.8–0.9 s per simulated day. The alarms are exactly the same: a 12-day busy run (acknowledgements, shelving, chaos, the storyline) gave identical alarms, summaries and analytics at all 48 checkpoints before and after. See [learning note 44](learning/44-making-it-scale-without-changing-it.md).

## Found and fixed during this review

| Finding | How it was found | Fix |
|---|---|---|
| **Dialogs broke the Content Security Policy.** Opening any dialog adds a small style to stop the page behind it scrolling (Radix → `react-remove-scroll`); the policy blocked it, so the page could scroll behind an open dialog, and the browser logged an error. | The new criterion C test against the server opened a dialog; the chunk 6 page tour had only loaded pages. | A fresh **nonce** with every copy of the page: in its policy (`style-src 'self' 'nonce-…'`) and in a `<meta>` tag the app hands to `get-nonce`. Still no `unsafe-inline`. A new test opens the copilot, the command palette and the shortcut sheet under the policy. |
| The server-mode tests ran into the **sign-in limit** (12 sign-ins a minute from one address). | The suite failed once the criteria tests were added. | `SIGN_IN_ATTEMPTS_PER_MINUTE` (default 10); the test configuration raises it. |
| **`npm audit`**: new advisories for `seroval` (inside the router: script injection when serialising data, which this app never does with untrusted data) and `undici` (inside `jsdom`, test tooling only; one high). | `npm audit` | Pinned to fixed versions old enough to trust: `seroval` 1.6.11 (13 days), `undici` 8.12.2 (16 days). |
| Criteria A, C, D and F had only been tested in demo mode. | The review's checklist | `e2e-server/criteria.spec.ts`, against the real server. |

Fixed earlier in Phase 5, while building (each in its chunk's commit and learning note):

- **Alarm changes reached only the first connection**: harmless in the worker, wrong with two browsers (chunk 2).
- A **dependency only hours old** (`ws` 8.22.1) came in indirectly; pinned to an established version (chunk 3).
- **Anyone who could see Reliability could edit RCAs**; now only roles that "use" it, on screen and on the server (chunk 3).
- **The alarm engine wasn't repeatable**: the same six simulated hours gave 293, 146 or 141 alarms depending on how often it was ticked, which would have broken replay and quietly changed alarms when the demo's speed changed (chunk 4).
- **Chart loads were written to the audit log** as changes (two long reads travel as POST) (chunk 4).
- The copilot offered questions the role couldn't ask (chunk 5).
- The sign-in page logged an error on every visit (a 401 for "nobody is signed in") (chunk 6).

## Gaps, and what was built differently

| Item | Notes |
|---|---|
| **Restart time grows with simulated time** | Fixed after the review: now in step with simulated time (about 0.85 s per simulated day). A month of running still means about half a minute to restart; snapshots would make it nearly instant. |
| **`npm audit` still lists 15 moderate findings** | All in `minimatch`/`glob`: in the lint tooling (developer machines only) and in `@fastify/static`, which uses `glob` once at start-up to list the built app's own files, not anything a request controls. The only "fixes" offered are major downgrades that would break those tools; to be re-checked when the tools release fixes. |
| **Demo sign-in** | Choose a person, no password (as decided). A real deployment needs the company's sign-in (OIDC/SAML) or passwords. |
| **Reads are open to anyone signed in** | By decision: pages share data across modules. Only the AI tools follow the module matrix. Live values and the alarm bar's counts aren't filtered by role either. Nothing is scoped by site (a technician sees every site). |
| **One shared plant** | Anyone signed in can change the simulation's speed, chaos mode and storyline for everyone. Fine for a demo; a real plant has no such panel. |
| **The daily briefing reads the simulation directly** | It only summarises the Command Center, which every role sees ([ADR-0016](adr/0016-ai-provider-and-role-filtered-tools.md)); a model's provider would use the toolbox. |
| **The copilot is still scripted** | By decision. Choosing a real model also means deciding cost limits, logging without personal data, and what happens when it's slow. |
| **No separate tables for people or the audit log** | A deliberate change from the plan's wording: with a command log they'd be second copies that could disagree ([ADR-0015](adr/0015-sqlite-command-log-and-replay.md)). |
| **Sign-ins and sign-outs aren't in the audit log** | Only changes to the plant are. |
| **If a logged change ever fails to replay, the server won't start** | By design (better than running a plant that isn't what people left), but there's no tool to inspect or repair the log yet. |
| **`node:sqlite` is a release candidate** | Past experimental in Node 24, not yet "stable". |
| **Map tiles come from a public service** | `tiles.openfreemap.org` sees which map areas are viewed; a company would host its own. |
| **From earlier phases, unchanged** | Turnarounds; rules don't raise live alarms; OEE is seeded; shift handover uses UTC shifts; reports aren't scheduled or emailed. |

## What a production deployment would still need

Phase 5 runs on this laptop by decision. Before real people use it over a network:

1. **HTTPS**, with `COOKIE_SECURE=true` and an HSTS header.
2. **Real identity**: the company's single sign-on, or passwords stored with a slow hash; a sign-in limiter shared between servers.
3. **Scoping by site** where people should see only their own plant.
4. **Fast restarts**: snapshots (the alarm engine indexes are done), or per-record tables (and perhaps PostgreSQL) once the data stops being a simulation.
5. **Backups** of the database file, and a tested restore.
6. **Monitoring**: something polling `/api/health`, collecting the JSON logs, and alerting a person.
7. **A process manager or container** that restarts the server, sends it SIGTERM to stop, and gives it its settings.
8. **Dependency care**: `npm audit` in an automated check, and the "nothing only hours old" rule this phase followed by hand.
9. **The map's own tile server**, and a decision on a real AI model.

See [learning note 43](learning/43-reviewing-a-backend.md) for what reviewing a backend involves.

## Phase 5, in one sentence

The app now has a real backend that checks who you are and what you may do, keeps what you did, and is ready for a real model, and getting there made the simulation genuinely repeatable and found three bugs that only show with more than one browser, a database, or a real browser's security rules.
