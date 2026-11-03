# PdM — Predictive Maintenance Platform (Frontend)

[![CI](https://github.com/Abdulhafeez-Abdulsalam/PdM/actions/workflows/ci.yml/badge.svg)](https://github.com/Abdulhafeez-Abdulsalam/PdM/actions/workflows/ci.yml)

The web frontend of a Predictive Maintenance & Asset Performance platform for an energy company working in **oil & gas**, **gas-to-power** and **solar**.

It helps people spot equipment that is about to fail, before it fails, and organise the maintenance to fix it.

> **Status:** Phase 1 complete ([review](docs/phase-1-review.md)). Phase 2 complete ([review](docs/phase-2-review.md)): prediction console and feedback loop, work-order lifecycle with Kanban board and ISO 14224 close-out, field technician screens with safety-gated checklists; typed work survives a dropped connection. Quality chunk done ([report](docs/quality-report.md)): all acceptance criteria A–G met and tested; run `npm run e2e` for the real-browser tests. Filling in the Phase 2 pages not yet built: all 4 done (maintenance calendar and schedule board; fleet anomaly view; alarm performance; fleet comparison and the documents, related and comments tabs). Phase 3 complete ([plan](docs/phase-3-plan.md), [review](docs/phase-3-review.md)): gas-to-power, solar and oil & gas operations; reliability KPIs, Weibull analysis, the risk matrix, FMEA and root-cause analysis; vibration spectra, waterfall and orbit; the 2D digital twin with replay; every screen fits a phone. Phase 4 complete ([plan](docs/phase-4-plan.md), [review](docs/phase-4-review.md)): PM programs, inventory and spares, HSE and compliance, energy and ESG, financials, reports and shift handover, data and integrations, administration, predictive tools, and the AI copilot with the command palette; every module in the menu is built and every role has its own home page. Phase 5 complete ([plan](docs/phase-5-plan.md), [review](docs/phase-5-review.md)): a real backend beside the demo mode: a TypeScript server answering every request and streaming live values, demo sign-in with role checks on every request, what people do kept in SQLite and replayed on restart, the copilot behind an AI provider with role-filtered tools, and one command (`npm start`) to run it all. Phase 6 ([plan](docs/phase-6-plan.md)) under way: finishing the master prompt's delivery plan (CI, virtualised tables, the event timeline, Storybook, accessibility, documentation, a demo walkthrough).

## Getting started

Requires Node.js 22 or newer.

```bash
npm install      # download dependencies (also installs the git hooks)
npm run dev      # start the app → open http://localhost:5173
npm run check    # formatting, types, lint and tests for every package
npm run format   # auto-format every file with Prettier
npm run lint     # ESLint only
```

Every commit automatically lints and formats the files you changed, and checks the message follows [Conventional Commits](https://www.conventionalcommits.org/) (`feat(web): …`, `fix(mock-data): …`).

The app runs entirely in your browser on simulated data — no server or account needed. Use the **Simulation** panel at the bottom of the left menu to speed up time or start the demo storyline.

## How to run it with the server

The same app can talk to a real server instead of the in-browser simulation: you sign in as one of the demo people, the server checks every request against that person's role, and what people do is kept in a database and survives a restart.

**To use it** (one command builds the app and starts the server, which serves the app and the API together):

```bash
npm start               # → open http://127.0.0.1:4000
```

**To work on it** (two terminals; both reload when you change a file):

```bash
npm run dev:server      # the API on http://127.0.0.1:4000
npm run dev:connected   # the app in server mode → open http://localhost:5173
```

**Settings** are environment variables, checked at start-up (a wrong one stops the server and says which):

| Variable | Default | What it's for |
|---|---|---|
| `PORT` | `4000` | Where the server listens |
| `HOST` | `127.0.0.1` | Which network address; the default means only this computer can connect |
| `DB_FILE` | `apps/server/data/pdm.sqlite` | The database file. Stop the server and delete it to start afresh |
| `SEED` | `20261010` | Which simulated plant, for a new database |
| `WEB_DIST` | `apps/web/dist-server` | The built app to serve (built by `npm start`) |
| `LOG_LEVEL` | `info` | How much to log: `error`, `warn`, `info`, `debug`… |
| `COOKIE_SECURE` | `false` | Set to `true` when the site is served over HTTPS |
| `SIGN_IN_ATTEMPTS_PER_MINUTE` | `10` | Sign-ins allowed from one address per minute |

**Is it up?** `http://127.0.0.1:4000/api/health` answers `{"ok":true,"database":"ok",…}`. Logs are one JSON line per event. Stop it with Ctrl+C: it finishes what it's doing, saves where the simulated clock got to, and closes the database.

**Tests against the real server:** `npm run e2e:server` builds the app, starts the server with a fresh database and runs the main journeys in Chrome (about 30 seconds).

**Before putting it on the internet**, it would still need HTTPS (and `COOKIE_SECURE=true`), real accounts instead of demo sign-in, backups of the database file, and monitoring. See [ADR-0017](docs/adr/0017-running-the-server.md).

How it works: [ADR-0012](docs/adr/0012-fastify-server-and-http-format.md) (HTTP), [ADR-0013](docs/adr/0013-live-values-over-a-websocket.md) (live values), [ADR-0014](docs/adr/0014-sessions-and-server-role-checks.md) (sign-in and roles), [ADR-0015](docs/adr/0015-sqlite-command-log-and-replay.md) (the database), [ADR-0016](docs/adr/0016-ai-provider-and-role-filtered-tools.md) (the AI provider), [ADR-0017](docs/adr/0017-running-the-server.md) (running it).

## Repository layout

| Folder | What's inside |
|---|---|
| `apps/web` | The application (Vite + React) |
| `apps/server` | The server (Fastify): the same requests over HTTP, live values over a WebSocket (Phase 5) |
| `packages/contracts` | Data shapes shared by the app and any backend |
| `packages/api-client` | How the app requests data and receives live updates |
| `packages/mock-data` | The simulated backend (runs in a Web Worker) |
| `packages/ui` | Design tokens, themes and shared components |
| `packages/charts` | Chart components (ECharts), coloured from the design tokens |

## Where to start reading

| If you want to… | Read |
|---|---|
| See what we changed from the original spec, and why | [docs/scope-decisions.md](docs/scope-decisions.md) |
| Understand how the app is built | [docs/01-architecture/README.md](docs/01-architecture/README.md) |
| See why each technology was chosen | [docs/adr/](docs/adr/) |
| See colours, themes, and components | [docs/02-design-system/README.md](docs/02-design-system/README.md) |
| See the pages, menus, and who sees what | [docs/03-information-architecture/README.md](docs/03-information-architecture/README.md) |
| See the data shapes and API endpoints | [docs/04-data-contracts/README.md](docs/04-data-contracts/README.md) |
| See how the fake backend simulates the company | [docs/05-mock-data/README.md](docs/05-mock-data/README.md) — or run `npm run inspect -w @pdm/mock-data` |
| Learn the concepts behind all of it | [docs/learning/](docs/learning/) |
