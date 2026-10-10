# ADR-0002: Monorepo with npm workspaces and Turborepo

- **Status:** Accepted
- **Date:** 2026-10-10

## Context
The spec asks for separate packages (app, UI kit, charts, API client, mock data). They change together often, so keeping them in one repository ("monorepo") is simpler than publishing each separately.

pnpm (the spec's implied package manager) is not installed on the development machine; Node 24 and npm 11 are.

## Options considered
1. **npm workspaces + Turborepo** — npm already installed; Turborepo runs tasks (build, test, lint) across packages in the right order and caches results.
2. **pnpm + Turborepo** — faster installs, stricter dependency rules; one extra tool to install and learn.
3. **Nx** — powerful, but much more to learn.
4. **Single package with folders** — simplest, but nothing enforces the boundaries between UI, data and app code.

## Decision
npm workspaces + Turborepo. Packages: `contracts`, `api-client`, `mock-data`, `ui`, `charts`, `config`, plus the app `apps/web`.

## Consequences
- ✅ Clear boundaries: `ui` cannot accidentally depend on energy-specific code.
- ✅ One `npm install`, one `npm run dev`.
- ❌ More configuration at the start (each package has its own `package.json` and `tsconfig.json`).
- Switching to pnpm later is easy if install speed becomes a problem.
