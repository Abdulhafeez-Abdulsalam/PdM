# Phase 4 review

Phase 4 ("operations and governance") is complete for its ten building chunks: PM programs, inventory, HSE, ESG, financials, reports, data and integrations, administration, the predictive tools, and the copilot with the command palette. **Every module in the menu is now a real page**, and every role lands on its own home page. Everything runs in the browser on the simulated backend. This review checks what was built against the [plan](phase-4-plan.md), re-tests the acceptance criteria, and records what was found and fixed while reviewing.

*Reviewed 2026-10-28, at commit `a5bf310` plus the fixes listed under "Found and fixed during this review".*

## Acceptance criteria

| # | Criterion (as amended in [scope-decisions.md](scope-decisions.md)) | Status | Evidence |
|---|---|---|---|
| A | A new user finds the top 5 riskiest assets within 10 s of login | ✅ | Unchanged. Every role still lands on its home page in the end-to-end tests; HSE, Procurement, ESG and Admin now land on their own modules. |
| B | Any prediction traces to evidence, explanation, confidence and action within 2 clicks | ✅ | Unchanged. Phase 4 adds more routes to a prediction: copilot citations, the what-if simulator, Financials' value table. |
| C | An alarm becomes an assigned work order in under 30 s | ✅ | End-to-end journey still passes (two clicks). Raising and assigning the work needs no permit; starting it does (chunk 3). |
| D | A technician who loses connection keeps what they typed | ✅ | End-to-end journey still passes. |
| E | Dashboards stay responsive with 300 live tags at 1 update/s | ✅ | Re-measured (table below). All within budget. |
| F | Every screen passes automated accessibility checks in all three themes | ✅ | axe on all 86 screens in jsdom and all 75 screens × 3 themes in Chrome, plus the open copilot, command palette and shortcut sheet: **0 violations**. |
| G | No hard-coded strings, units or colours outside tokens and the text catalog | ✅ | A scan of the 31 screen files Phase 4 added or touched found no colour values and one literal string (a key label), moved to the text catalog in this review. A missing text key fails the tests. |

**Criterion E, re-measured** (production build, Chrome, 300 live tags, 20 s of real clicks):

| Machine (Chrome CPU) | Slowest tap | Longest freeze | Blocked per second | Budget for the slowest tap |
|---|---|---|---|---|
| This laptop (1×) | 56 ms | 61 ms | 1 ms | 100 ms |
| Older office PC (2× slower) | 96 ms | 86 ms | 19 ms | 200 ms |
| Low-end machine (4× slower) | 216 ms | 207 ms | 186 ms | 500 ms |

Much the same as at the [Phase 3 review](phase-3-review.md). Phase 4 added many pages but none touch the live-data path.

## What Phase 4 added

| Chunk | Highlights | Learning note |
|---|---|---|
| 1. PM programs | Plans from FMEA's strategies, PM compliance that counts planned-but-late work as missed, generating the next work orders; the Command Center tile is real | [26](learning/26-pm-programs-and-compliance.md) |
| 2. Inventory | Stock per site, reorder points from lead-time demand, a demand forecast from predictions and planned work, parts issued at close-out | [27](learning/27-spare-parts-and-stock-control.md) |
| 3. HSE | Safety-critical elements, permits to work that the server requires before hazardous work starts, incidents with API RP 754 tiers, management of change | [28](learning/28-hse-permits-incidents-moc.md) |
| 4. Energy and ESG | Emissions from the plant's own fuel, flaring and leak data; intensity and targets per site; the part poor equipment health adds | [29](learning/29-emissions-accounting.md) |
| 5. Financials | Value from predictions with the working shown, money at risk, cost of downtime, spend against budget; the Command Center's "value delivered" uses the same figure | [30](learning/30-maintenance-financials.md) |
| 6. Reports | Four ready-made reports and a builder, every figure with how it was worked out; the shift handover; printing and PDF through the browser | [31](learning/31-reports-and-shift-handover.md) |
| 7. Data and integrations | Data sources, 24-hour data quality (no data, flatline, bad quality, gaps), a tag browser | [32](learning/32-data-quality.md) |
| 8. Administration | Every page checks the role matrix; a server-written audit log of every change; alarm limits that really move the alarms; users, roles, hierarchy | [33](learning/33-administration-and-access.md) |
| 9. Predictive tools | Model registry with backtests, live verdicts and approvals; threshold rules tested on 24 h of readings before saving; the what-if simulator | [34](learning/34-models-rules-and-what-if.md) |
| 10. Copilot and palette | A scripted copilot that answers through the same API as the screens and cites everything; suggestions behind a confirm dialog; Ctrl/⌘ K and keyboard shortcuts | [35](learning/35-copilot-and-command-palette.md) |

**Size of the safety net:** 541 unit and component tests (web 271, mock data 200, UI 34, contracts 31, API client 5) and 135 end-to-end tests in Chrome (accessibility per screen and for the overlays, phone width, printing, journeys, performance), all passing. At the end of Phase 3: 407 and 86.

## Found and fixed during this review

| Finding | How it was found | Fix |
|---|---|---|
| **`npm run check` failed now and then on time limits**: three times in this phase a trivial test (one even just parses a date) ran past its limit. | A pattern across chunks 4, 5 and 10. The laptop has 4 processors; Turborepo ran up to 10 tasks at once, each test task with its own workers, so a test could wait seconds for a turn. | `--concurrency=50%` on `npm run check` (2 tasks at a time here, more on a bigger machine). A fresh run of everything takes the same time (8 min 53 s, against 7½–9 min before) but the packages stop starving each other: mock-data's tests went from 96 s to 40 s, api-client's from 25 s to 5.5 s, and the slowest test is a third of its limit. See [learning note 36](learning/36-slow-tests-and-busy-machines.md). |
| The search button's "Ctrl K" label was literal text in the code | The criterion G scan | Moved to the text catalog |

Fixed earlier in Phase 4, while building (each in its chunk's commit and learning note):

- PM compliance looked better after generating work, until planned-but-late work counted as missed.
- A peaker turbine showed as 100 % avoidable emissions; avoidable emissions now compare sample by sample while fuel is burning.
- Financials' monthly columns didn't add up to the total; a cache was shared between backends.
- Data quality flagged 93 % of tags for a single bad reading; issues now start at 1 %.
- **Built pages ignored the role matrix** (only the menu used it); every page now checks it.
- **Alarms from developing faults ignored the tags' limits**, so editing a limit wouldn't have moved them; they read the current limits now.
- Asking the copilot was recorded as a change in the audit log; asking is now a read.
- **Two new top-bar buttons made every page 58 px too wide on a phone**, caught by the phone-width test.
- The "no access" page had no heading; two signals on the same equipment looked identical in the rule builder.

## Planned for Phase 4 but not built, or built differently

| Item | Notes |
|---|---|
| **Turnarounds** | Left for later by decision when the plan was agreed. |
| **Rules don't raise live alarms** | They're tested on recorded readings (24 h) and listed with their hit counts. Wiring them into the alarm engine is the next step. |
| **The copilot is scripted** | As ADR-0010 decided: seven kinds of question, read by keywords. A real model needs a server holding the key; it can then use the same read endpoints as tools. |
| **Access control is on screen only** | Every page checks the role matrix, but the mock backend trusts the role it's told. A screen can hide, not protect ([ADR-0008](adr/0008-simple-role-based-views.md)): a real backend must refuse data per request. |
| **The access matrix is view-only** | Admin can change a person's role, not what a role may do; the matrix lives in code (`roles.ts`). |
| **Reports aren't scheduled or emailed** | Printed or saved as PDF on demand; there's no mail server in the mock. |
| **Shift handover uses UTC shifts** | A real plant would use each site's local shift times. |
| **Data sources are simulated** | Their figures come from the plant's own data, but nothing connects to a real historian, CMMS or lab. |
| **Live model results are thin** | A handful of technician verdicts per model, so most say "too few to judge". That's honest, and it fills up as people use the feedback loop. |
| **OEE** | Still a seeded number; it needs performance and quality modelled alongside availability. |
| Everything changed in the demo lives in memory | Permits, MoCs, stock, rules, approvals, notes, the audit log: gone after a reload, as the plan said. A real backend stores them. |

Still open from the earlier reviews: Storybook, the synchronised event-timeline canvas, virtualised tables, and a keyboard cursor on the vibration waterfall and orbit. **Closed this phase:** the command palette and keyboard shortcuts (chunk 10), and real PM compliance (chunk 1). Screen-reader and keyboard testing by a person is still needed: automated checks find only about a third of accessibility problems.

## Numbers worth watching

Production build:

| Chunk | Size | Gzipped | Since Phase 3 | Loaded |
|---|---|---|---|---|
| App start (`index`) | 459 kB | 148 kB | +57 kB (+19 kB gzipped) | always |
| Charts and prediction detail (ECharts) | 562 kB | 189 kB | — | only when a chart is shown |
| Mock backend (worker) | 380 kB | — | +79 kB | always (demo only; a real backend removes it) |

Every Phase 4 page loads only when opened. The start chunk grew mainly with the shared contracts (every new endpoint's schema) and the copilot and palette, which are part of the app frame. If first load matters, loading the contracts per page is the place to look.

The end-to-end suite now takes about 21 minutes, 17 of them for accessibility (75 screens × 3 themes, one after another). Running its files in parallel would shorten it, at the cost of a quiet machine for the performance test.

## Lessons worth keeping

1. **Measure before blaming.** The time-outs looked like slow tests; they were tests waiting for a processor. And the first timing after the fix was 42 seconds, because Turborepo replayed saved results ("FULL TURBO"). A forced run gave the real figure.
2. **Check a plan's promises against the code.** "Editing a limit changes the alarms" and "pages check the role" were both untrue at first, for reasons nobody would see in a demo.
3. **Work a number out once and have every screen ask.** The value tile, the reports and the copilot all ask the same endpoints the pages use, so they can't disagree.
4. **A threshold is a judgement, and it should say so.** Data quality at 1 %, "too few verdicts to judge" under 5: each page states its rule.
5. **Small changes can break every page.** Two buttons in the top bar broke the phone layout everywhere; only a test at a size nobody looks at caught it.

## Recommendation for what's next

The plan's phases are done: every module is built and checked. Sensible next steps, in rough order of value:

- **A hardening chunk:** rules that raise live alarms, a real OEE, a keyboard cursor for the waterfall and orbit, and a manual screen-reader and keyboard pass.
- **Toward a real backend:** a server that enforces roles on every request, stores what the demo keeps in memory, and can host a real AI model behind the copilot's interface.
