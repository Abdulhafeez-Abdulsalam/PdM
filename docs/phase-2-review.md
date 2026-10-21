# Phase 2 review

Phase 2 ("Predict and act") is complete for its three planned chunks: the prediction console, the work-order lifecycle and the field technician screens. They run in the browser on the simulated backend. The review below checks what was built against the plan, re-tests the acceptance criteria, and records what was found and fixed while reviewing.

*Reviewed 2026-10-21, at commit `021d785` plus the fixes listed under "Found and fixed during this review".*

## Acceptance criteria

| # | Criterion (as amended in [scope-decisions.md](scope-decisions.md)) | Status | Evidence |
|---|---|---|---|
| A | A new user finds the top 5 riskiest assets within 10 s of login | ✅ | Unchanged since Phase 1 (~1.1 s, measured). Automated test still passes. |
| B | Any prediction traces to evidence, explanation, confidence and action within 2 clicks | ✅ | Still 1 click (side panel). Phase 2 adds a full prediction page with anomaly history and the "was the model right?" feedback. |
| C | An alarm becomes an assigned work order in under 30 s | ✅ | Still 2 clicks, ~1.1 s app time. Automated test still passes. |
| D | A technician who loses connection keeps what they typed | ✅ **new** | Field task page keeps every entry through a dropped connection *and* a page reload; submitting waits for the connection and nothing is sent automatically. Automated test (`Field.test.tsx`) and checked by hand in the browser. |
| E | Dashboards stay responsive with 300 live tags at 1 update/s | 🟡 Partly | Unchanged: the budget is enforced in contracts, mock and client, but there is still **no performance test** that proves it. |
| F | Every screen passes automated accessibility checks in all three themes | 🟡 Better | axe-core run on all 7 Phase 2 screens × 3 themes, including a form showing its errors: **0 violations after the fixes below**. Colour contrast of every token is now an automated test. Still missing: axe running inside the test suite (it was run by hand in the browser), and a full re-scan of the Phase 1 screens (only their shared shell was covered). |
| G | No hard-coded strings, units or colours outside tokens and the text catalog | ✅ | All new text in `en.json`, all colours via tokens, typed readings converted with the new `fromDisplay()`. |

## What Phase 2 added

| Chunk | Highlights |
|---|---|
| 1. Prediction console | Ranked by money at risk, filters and sorting in the URL, prediction page with anomaly-score history, feedback loop (model precision), triage and dismiss with reasons |
| 2. Work-order lifecycle | State machine shared by UI and server, Kanban board (drag, keyboard drag, "Move to…" menu), list view, schedule and cancel dialogs, work-order page with history and evidence, role-limited moves |
| 3. Field technician | "My jobs" (phone-first, 48 px targets), safety checks that gate the start (enforced by the server too), steps and readings in the user's units with expected ranges, ISO 14224 close-out, typed work kept through a dropped connection |
| Tooling (between phases) | ESLint, Prettier, Husky pre-commit and commit-message checks, TypeScript 6, Turborepo cache fix |

**Size of the safety net:** 157 automated tests (web 61, UI 34, mock data 31, contracts 27, API client 4), all passing.

## Found and fixed during this review

| Finding | How it was found | Fix |
|---|---|---|
| **Control-room theme: critical red unreadable** (2.6–3.7 : 1, needs 4.5). It's used for form errors, danger buttons and P1 alarms. | axe in the browser, then a contrast audit of every token | Red lightened to `#FF9093` |
| **Eight more colours below 4.5 : 1**: control-room offline, maintenance, warning and secondary text; light-theme healthy, degraded and offline (on the "sunken" background) | The token audit. axe missed them because those states weren't on the scanned pages. | New values in `tokens.css` and the design-system table. Control-room offline became a warm grey so it stays distinct from the grey of "normal". |
| No guard against this happening again | — | **New test** `packages/ui/src/tokens.test.ts` checks every text and health colour against every background in every theme |
| Alarm-bar links and the scope button: what a screen reader announces didn't contain the visible text (WCAG 2.5.3, "label in name"), so "click P1 0" fails for voice-control users | axe | Names now start with the visible text. The scope button's name also regains the health status, which its old label hid. |
| Toast list used a role that a list can't have | axe | Live region now wraps the list |
| At phone width the logo text slid under the scope picker | Seen at the end of chunk 3, cause found with the browser's layout data | Logo no longer shrinks |

## Planned for Phase 2 but not built

The information architecture listed more Phase 2 pages than the three chunks covered. They're not forgotten, just not built:

| Item | Notes |
|---|---|
| Anomaly views (`/predictive/anomalies`) | Anomaly *history* exists on each prediction page; a fleet-wide anomaly view doesn't |
| Maintenance calendar, Gantt and schedule board (`/maintenance/schedule`) | Board and list exist |
| Alarm analytics (`/alarms/analytics`): alarm KPIs, bad actors, floods | — |
| Fleet comparison (`/assets/compare`) | — |
| Asset tabs: documents, related, comments | — |

Still open from the Phase 1 review: Storybook, Playwright end-to-end tests with automated axe checks, the command palette and keyboard shortcuts, the synchronised event-timeline canvas, virtualised tables, and the criterion E performance test.

Field features in the spec that the online-only scope (ADR-0007) or this phase left out: QR/NFC scanning, photos and voice notes, map routes, e-signature, parts consumption, lone-worker SOS, push notifications, glove and high-sunlight modes.

## Numbers worth watching

Production build (`npm run build`):

| Chunk | Size | Gzipped | Loaded |
|---|---|---|---|
| App start (`index`) | 347 kB | 111 kB | always |
| Map (MapLibre) | 1,050 kB | 284 kB | only when a map is shown |
| Charts and prediction detail (ECharts) | 562 kB | 189 kB | only when a chart is shown |
| Mock backend (worker) | 208 kB | — | always (demo only; a real backend removes it) |

The two big chunks are libraries, and they're already loaded only when needed. They trigger Vite's "larger than 500 kB" warning. That's acceptable for now; if first-load speed on a weak connection becomes a goal, load ECharts' individual modules instead of the whole package.

## Lessons worth keeping

1. **Scanning a page only checks what's on the page.** axe found the red problem; the audit of the *tokens* found eight more that no scanned page happened to show. Where something can be checked at the source (here, the colour list), check it there.
2. **A rule that matters belongs in a test.** The colours had been "validated" when they were chosen, but nothing stopped later edits from breaking that. Now a test does.
3. **Honest status beats a green table.** E and F stay 🟡 because the evidence isn't complete, even though nothing is known to be broken.

## Recommendation for what's next

Before Phase 3, a short **quality chunk** would close the two 🟡 criteria while the codebase is still small:

- run axe inside the automated tests for every screen and theme (criterion F)
- a performance test with 300 live tags (criterion E)
- Playwright for a few end-to-end journeys

Then Phase 3, or the missing Phase 2 pages above, depending on which matters more to you.
