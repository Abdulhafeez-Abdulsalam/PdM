# Phase 6 review

Phase 6 finished what the master prompt's delivery plan still asked for: a CI pipeline, fast long lists, the synchronised event timeline, a component catalogue, the last keyboard cursors with a screen-reader script, documentation for visitors, and a demo walkthrough. With it, **all of the delivery plan's deliverables (§11) exist**, and every acceptance criterion (§12) is met as amended.

This review re-tests the criteria, records what was found and fixed, and goes through the master prompt one last time: what's built, what was changed on purpose, and what's still open. It's an honest list: the master prompt describes years of product, and a good part of it remains open.

*Reviewed 2026-11-04, at commit `6398d0a` plus the fix under "Found and fixed during this phase".*

## Acceptance criteria

| # | Criterion (as amended in [scope-decisions.md](scope-decisions.md)) | Demo mode | Server mode | Evidence, re-run for this review |
|---|---|---|---|---|
| A | A new user finds the top 5 riskiest assets within 10 s of login | ✅ | ✅ | Every role's home-page test; server test under 3 s from sign-in |
| B | Any prediction traces to evidence, explanation, confidence and action within 2 clicks | ✅ | ✅ | Unit and browser tests; the walkthrough's scene 3 does it on screen |
| C | An alarm becomes an assigned work order in under 30 s | ✅ | ✅ | Two clicks in both suites, and in the walkthrough |
| D | A technician who loses connection keeps what they typed | ✅ | ✅ | Both suites; the walkthrough's scene 6 |
| E | Dashboards stay responsive with 300 live tags at 1 update/s | ✅ | ✅ | Table below |
| F | Every screen passes automated accessibility checks in all three themes | ✅ | ✅ | axe on every screen in every theme: 0 violations. New: every story in every theme: 0 |
| G | No hard-coded strings, units or colours outside tokens and the text catalog | ✅ | ✅ | New screens use the catalog; a missing key fails the tests |

**Criterion E, re-measured** (production build, Chrome, 300 live tags, 20 s of real clicks):

| Machine (Chrome CPU) | Slowest tap | Longest freeze | Budget for the slowest tap | At the end of Phase 5 (slowest tap) |
|---|---|---|---|---|
| This laptop (1×) | 56 ms | 53 ms | 100 ms | 64 / 56 ms |
| Older office PC (2× slower) | 104 ms | 81 ms | 200 ms | 104 / 96 ms |
| Low-end machine (4× slower) | 208 ms | 227 ms | 500 ms | 144 / 216 ms |

Taps are as before and inside their budgets. The longest freeze at 4× is about twice Phase 5's (227 ms against 103–110 ms). It's a single run on a laptop, and the test passes, but it's worth watching.

**Size of the safety net:** 591 unit, component and server tests (web 275, mock data 209, contracts 43, UI 34, server 25, API client 5), 152 end-to-end tests in Chrome (140 demo-mode, 12 against the real server), and 43 stories checked in three themes, with 129 saved screenshots. At the end of Phase 5: 587 and 147. GitHub runs the checks, the server tests and the stories' accessibility on every push.

**One suite hasn't yet run on GitHub:** the weekly demo-mode workflow (`e2e-demo.yml`) first runs on the coming Monday, or on demand from the Actions tab. Its performance test was set for office hardware and may need its limits looked at on GitHub's machines.

## What Phase 6 added

| Chunk | Highlights | Decision | Learning note |
|---|---|---|---|
| 1. CI | Checks on every push, in parallel; weekly demo suite; pinned actions, read-only rights | [ADR-0018](adr/0018-ci-on-github-actions.md) | [45](learning/45-continuous-integration.md) |
| 2. Long lists | Measured first: only the alarm list needed it. Above 60 rows it draws what's on screen; 52–106 ms freezes every second are gone | | [46](learning/46-drawing-only-what-shows.md) |
| 3. Event timeline | Five lanes on one time axis with the sensor charts; zoom any, all follow; on Asset 360 and the alarms page | | [47](learning/47-one-time-axis.md) |
| 4. Catalogue | Storybook: 43 stories in every state and theme; axe and screenshots on each | [ADR-0019](adr/0019-component-catalogue.md) | [48](learning/48-a-catalogue-of-parts.md) |
| 5. Accessibility | Keyboard cursors on the waterfall and orbit; an [NVDA script](testing/nvda-script.md) | | [49](learning/49-listening-to-the-app.md) |
| 6. Documentation | README for visitors, contribution guide, docs index, MIT licence | | [50](learning/50-writing-for-visitors.md) |
| 7. Walkthrough | An [eight-scene demo script](demo-walkthrough.md), acted out by a browser test that takes the README's screenshots | | [51](learning/51-rehearsing-the-demo.md) |

The plan's promise held: the app changed only for the timeline and the keyboard cursors, plus the bugs below.

## Found and fixed during this phase

| Found by | Problem | Fix |
|---|---|---|
| CI's first run | A server test failed when the alarm it acknowledged had already returned to normal | The test asks for both outcomes |
| CI, after virtualising | Two server tests assumed every alarm row was on the page; one had been passing without proving anything | Both use the unacknowledged list |
| Browser checks of the timeline | Charts forgot their zoom on redraw; a chart added while zoomed started zoomed out | Zoom is kept, and shared with late arrivals |
| Screenshots | Dark-theme charts in the catalogue drew in the previous theme's colours | The theme is set before a story draws |
| Installing Storybook | Playwright moved up a version against a pinned dependency, crashing every browser test | Lock file restored; both apps share 1.63.0 |
| Rehearsing the demo | Five finished modules still shown greyed out as "Phase 4" | `CURRENT_PHASE` corrected |
| Rehearsing the demo | Changing **Viewing as** left data from the previous role, so the Field page showed the wrong person | Cached data refreshes on a role change (with a test) |
| This review | Moving through the search palette lost the time range and scope | The palette keeps them, as the menu does (with a test) |

## The master prompt, one last time

**Built** means working in the app and tested. **Changed** gives the number of the recorded [scope decision](scope-decisions.md), or the reason. **Open** lists what was searched for in the code and isn't there; rows are a summary, not every line of the prompt.

| § | Area | Built | Changed on purpose | Open |
|---|---|---|---|---|
| 1 | Goal and API abstraction | One switch point: the same app runs on the simulation or a real server | | |
| 2 | Tech stack | React, strict TypeScript, TanStack Query, Router and Virtual, Zustand, Radix, Tailwind, ECharts, MapLibre, React Hook Form + Zod, Vitest, Playwright, Storybook, axe, Turborepo | Vite instead of Next.js (1); English only (6); Playwright instead of Chromatic (9); no PWA (4); no Three.js (11). Hand-written tables and SVG charts instead of TanStack Table and D3: nothing needed them. Zod contracts shared directly instead of a generated OpenAPI client | deck.gl |
| 3 | Personas | All 11 roles with home pages and permissions; role switcher in demo; role checks on the server on every request | No attribute rules or field-level permissions (5) | |
| 4 | Design system | Three themes, health tokens with icons, tabular numbers, unit toggle, time zones, time ranges, responsive layouts, keyboard, reduced motion, skeletons, empty states, error boundaries, command palette, shortcut sheet | | Custom ranges and compare-to-previous; undo; drag-and-drop widget layouts; kiosk mode; a screen-reader pass by a person ([script ready](testing/nvda-script.md)) |
| 5 | Navigation | All 16 modules, hierarchy scope selector, alarm bar, palette, copilot panel, connection status | | Notification centre; multi-window workspaces |
| 6.1 | Command Center | Health score, KPI strip, map, risk list, daily briefing with citations | OEE is a seeded number | Weather overlays; crew availability |
| 6.2 | Assets | Registry, Asset 360 with its tabs, health breakdown, RUL, synchronised sensor charts and events, sister and fleet comparison | | Bulk actions on assets; a working watchlist |
| 6.3 | Industry views | Oil & gas, gas-to-power and solar dashboards; vibration spectrum, waterfall, orbit; inspection codes; Duval triangle; BESS; loss waterfall | Advanced vibration (Bode, Nyquist, envelope) left out: needs real data | I-V curves; curtailment; tracker stow; drone imagery; warranty claims |
| 6.4 | Predictive | Console, anomaly views, explanations, feedback loop, model registry, rule builder (tested on history), what-if simulator, copilot | Copilot scripted, behind a provider (7) | Counterfactuals; alert correlation grouping; notebook; voice input |
| 6.5 | Alarms | ISA-18.2 states, priorities, acknowledge, shelve, flood and chatter detection, KPIs, the event timeline | | First-out; escalation chains and on-call; audible alerts and do-not-disturb |
| 6.6 | Maintenance | Lifecycle, Kanban, list, calendar, schedule board, PM programmes, costs, ISO 14224 close-out, permits | | Turnarounds and critical path; contractors; strategy optimiser; e-signature |
| 6.7 | Reliability | MTBF, MTTR, Pareto, Weibull, FMEA, RCA, risk matrix | | Reliability block diagrams and Monte Carlo; RCM workflow |
| 6.8 | Digital twin | 2D process diagrams, solar layout, pipeline route, replay | No 3D (11); schematics, not real P&IDs | AR hooks; simulation overlay |
| 6.9 | Inventory | Catalog, stock, reorder, demand from predictions, vendors | | Obsolescence; camera barcode scanning |
| 6.10 | HSE | Safety-critical equipment, permits, incidents, MoC, inspections, audit trail | | Proof-test tracking; bypass register; tamper-evident audit log |
| 6.11 | ESG | Emissions, flaring, LDAR, intensity, links to degraded equipment | | Satellite feeds; RECs; generated GRI/SASB/TCFD reports |
| 6.12 | Financials | Value from predictions, money at risk, spend against budget | | Repair-vs-replace; scenario planning |
| 6.13 | Reports | Library, builder, print to PDF, shift handover | | Scheduled reports; Excel, CSV and PowerPoint export; chart annotations |
| 6.14 | Field | Mobile-first jobs, checklists gated on safety, readings with validation, typed work survives dropped connections | Online-only with a safety net (4) | Photos, voice notes, e-signature, push |
| 6.15 | Data | Sources, connection health, tag browser, data quality | All simulated | Formula editor for virtual tags; edge gateways; webhooks and API keys |
| 6.16 | Administration | Users and roles, hierarchy browser, audit log, access matrix view | | SSO screens; versioned policies; tenant branding; retention settings |
| 7 | Cross-cutting | Comments, deep links in the URL, lineage tooltips, freshness and stale-data badges, print views, audit of every change | | Case files, tours and glossary, feedback widget |
| 8 | Non-functional | Virtual lists, code splitting, batching and scoped subscriptions, CSP, HttpOnly cookies, CSRF defences, an error boundary per widget | 300 tags, 2,000 points a line (2, 3); English only (6) | SBOM; re-authentication for critical actions; field masking; Web Vitals and error telemetry; testing in Firefox and Safari |
| 9 | Mock data | Deterministic seeds, realistic signals and injected faults, predictions, alarms, work orders, the storyline, speed, chaos mode | | |
| 10 | Code quality | Domain folders, reusable components, shared contracts, stories with states, unit, E2E, accessibility and performance tests, CI, README, ADRs, contribution guide, design-token docs | | Feature flags (no rollout audience yet) |
| 11 | Delivery plan | All the deliverables, in order | Phases grew to six; Phase 5 added a real backend | |
| 12 | Acceptance criteria | All seven | Two amended | |

## Known, small, left as they are

| Item | Notes |
|---|---|
| **Alarms pile up as time runs in demo mode** | About 33 an hour with nobody working them, so about 3,300 active alarms after four simulated days. Realistic for an unattended system, and the demo script covers it, but simulated operators clearing some would look better |
| **"Not in the last 30 days" beside a score of 0.50 at a 0.50 threshold** | The prediction page shows the score rounded. True, but it reads oddly |
| **The storyline runs once** per page load | Reload to start again |
| **NVDA results pending** | A person still has to listen. The checkable half now runs as `e2e/screen-reader.spec.ts`; see the [Phase 7 plan](phase-7-plan.md) |

## What we learned in Phase 6

1. **Measure before optimising.** The plan said four lists; three needed nothing. The cost was also somewhere unexpected: not scrolling, but standing still.
2. **Changing how something draws can break a test's assumptions, not just the app.** Virtualising was invisible to users, yet it broke one test and quietly emptied another.
3. **Rehearse.** Acting out the whole demo found two bugs that hundreds of narrower tests had walked past.
4. **Pictures are tests.** The catalogue's screenshots caught a colour bug no assertion would have.

## Next, if the project continues

A choice for its owner, from the "Open" column above. The most valuable next steps are probably: run the [NVDA script](testing/nvda-script.md) and fix what it finds; the alarm items (notifications, escalation, first-out), which an operator would miss first; then the real integrations ([deployment list](phase-5-review.md)).
