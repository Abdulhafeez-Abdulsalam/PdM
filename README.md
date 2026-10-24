# PdM — Predictive Maintenance Platform (Frontend)

The web frontend of a Predictive Maintenance & Asset Performance platform for an energy company working in **oil & gas**, **gas-to-power** and **solar**.

It helps people spot equipment that is about to fail, before it fails, and organise the maintenance to fix it.

> **Status:** Phase 1 complete ([review](docs/phase-1-review.md)). Phase 2 complete ([review](docs/phase-2-review.md)): prediction console and feedback loop, work-order lifecycle with Kanban board and ISO 14224 close-out, field technician screens with safety-gated checklists; typed work survives a dropped connection. Quality chunk done ([report](docs/quality-report.md)): all acceptance criteria A–G met and tested; run `npm run e2e` for the real-browser tests. Filling in the Phase 2 pages not yet built: all 4 done (maintenance calendar and schedule board; fleet anomaly view; alarm performance; fleet comparison and the documents, related and comments tabs). Phase 3 complete ([plan](docs/phase-3-plan.md), [review](docs/phase-3-review.md)): gas-to-power, solar and oil & gas operations; reliability KPIs, Weibull analysis, the risk matrix, FMEA and root-cause analysis; vibration spectra, waterfall and orbit; the 2D digital twin with replay; every screen fits a phone.

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

## Repository layout

| Folder | What's inside |
|---|---|
| `apps/web` | The application (Vite + React) |
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
