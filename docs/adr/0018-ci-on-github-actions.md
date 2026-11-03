# ADR-0018: Continuous integration on GitHub Actions

- **Status:** Accepted
- **Date:** 2026-11-03

## Context
Until now every check ran on the laptop: `npm run check` before each commit (by habit and the git hooks), the browser suites by hand. The repository is now public on GitHub ([Phase 6 plan](../phase-6-plan.md)), and the master prompt asks for "a CI pipeline definition" (§10). A check that runs by itself on every push catches what a busy person skips, and shows visitors the state of the code at a glance.

## Options considered
1. **GitHub Actions**: built into GitHub, configured by files in the repository, free on standard runners for public repositories.
2. **Another CI service**: another account and another place to look, for nothing this project needs.

For what runs when (decided with the user): everything on every push (~40 minutes), only the fast checks (no browsers), or the fast checks plus the quick server-mode browser tests on every push and the long demo-mode suite on a schedule.

## Decision
- **GitHub Actions**, two workflows in `.github/workflows/`:
  - `ci.yml`, on every push to `main` and every pull request: `npm run check` (formatting, types, lint, all unit and server tests) and, in parallel on a second machine, `npm run e2e:server` (the browser tests against the real server).
  - `e2e-demo.yml`: the full demo-mode browser suite (accessibility on every screen, phone width, printing, journeys, performance) every Monday at 03:00 UTC and on demand from the Actions tab.
- **Exactly the same commands as on the laptop**, so a red cross means the same thing in both places.
- **`ubuntu-24.04`, named exactly** (not "latest", which moves). It has Google Chrome, which the browser tests use as they do here, so no browser is downloaded; and Node 24, as on the laptop.
- **Least privilege**: `permissions: contents: read`; no secrets exist or are used.
- **Actions pinned to exact commits** (`actions/checkout`, `setup-node`, `upload-artifact`, each release at least three weeks old), with the version in a comment: a tag can be moved to other code; a commit can't.
- **Time limits** on every job; a newer push cancels an older run of the same branch; a failing browser test's trace and screenshots are kept for 14 days.

## Consequences
- Every commit on GitHub shows a green tick or a red cross; the README shows the latest result.
- The demo-mode performance test runs on GitHub's machines, which differ from the laptop; its budgets were set for office hardware, so a slow runner could fail it. If it does, the threshold question is decided then, with the measurements.
- `npm ci` installs exactly the lockfile; the lockfile, made on Windows, includes the Linux builds of the native tools (esbuild, rolldown, Tailwind, Turbo, lightningcss).
- Not done: caching Turborepo results between runs, and running on Windows and macOS too.
