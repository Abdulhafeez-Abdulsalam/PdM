# PdM — Predictive Maintenance Platform (Frontend)

The web frontend of a Predictive Maintenance & Asset Performance platform for an energy company working in **oil & gas**, **gas-to-power** and **solar**.

It helps people spot equipment that is about to fail, before it fails, and organise the maintenance to fix it.

> **Status:** Phase 1 complete — see [docs/phase-1-review.md](docs/phase-1-review.md) for the acceptance-criteria results and what's deferred. Next: Phase 2 (prediction console, work-order lifecycle, field technician screens).

## Getting started

Requires Node.js 22 or newer.

```bash
npm install      # download dependencies
npm run dev      # start the app → open http://localhost:5173
npm run check    # type-check and test every package
```

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
