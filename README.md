# PdM — Predictive Maintenance Platform (Frontend)

The web frontend of a Predictive Maintenance & Asset Performance platform for an energy company working in **oil & gas**, **gas-to-power** and **solar**.

It helps people spot equipment that is about to fail, before it fails, and organise the maintenance to fix it.

> **Status:** Steps 1–5 done (architecture, design system, information architecture, data contracts, mock data engine). Next: Phase 1 — the app itself.

## Getting started

Requires Node.js 22 or newer.

```bash
npm install      # download dependencies
npm run check    # type-check and test every package
```

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
