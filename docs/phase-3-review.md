# Phase 3 review

Phase 3 ("domain depth") is complete for its eight building chunks: the three industry views, the reliability suite, vibration diagnostics and the 2D digital twin. Everything runs in the browser on the simulated backend. This review checks what was built against the [plan](phase-3-plan.md), re-tests the acceptance criteria, and records what was found and fixed while reviewing.

*Reviewed 2026-10-24, at commit `29c810f` plus the fixes listed under "Found and fixed during this review".*

## Acceptance criteria

| # | Criterion (as amended in [scope-decisions.md](scope-decisions.md)) | Status | Evidence |
|---|---|---|---|
| A | A new user finds the top 5 riskiest assets within 10 s of login | ✅ | Unchanged since Phase 1. Every role still lands on its home page in the end-to-end tests. |
| B | Any prediction traces to evidence, explanation, confidence and action within 2 clicks | ✅ | Unchanged. Phase 3 adds more evidence one click further on: the Vibration tab names the fault frequency behind a bearing prediction. |
| C | An alarm becomes an assigned work order in under 30 s | ✅ | End-to-end journey still passes (two clicks). |
| D | A technician who loses connection keeps what they typed | ✅ | End-to-end journey still passes (browser offline, reload, everything restored). |
| E | Dashboards stay responsive with 300 live tags at 1 update/s | ✅ | Re-measured (table below). All within budget. |
| F | Every screen passes automated accessibility checks in all three themes | ✅ | axe on all 55 screens in jsdom and all 52 screens × 3 themes in Chrome: **0 violations**, re-run after this review's fixes. |
| G | No hard-coded strings, units or colours outside tokens and the text catalog | ✅ | A scan of the 35 screen files Phase 3 touched found no colour values and no literal text; a missing text key fails the tests. Values are shown in the user's units (mm/s ↔ in/s, km, bar). |

**Criterion E, re-measured** (production build, Chrome, 300 live tags, 20 s of real clicks):

| Machine (Chrome CPU) | Slowest tap | Longest freeze | Blocked per second | Budget for the slowest tap |
|---|---|---|---|---|
| This laptop (1×) | 72 ms | 52 ms | 0 ms | 100 ms |
| Older office PC (2× slower) | 80 ms | 157 ms | 24 ms | 200 ms |
| Low-end machine (4× slower) | 248 ms | 306 ms | 170 ms | 500 ms |

Much the same as in the [quality report](quality-report.md). Phase 3 added a lot of screens but didn't touch the live-data path.

## What Phase 3 added

| Chunk | Highlights | Learning note |
|---|---|---|
| 1. Gas-to-power | Output vs dispatch, heat rate and compressor efficiency against an ambient-corrected baseline, hours-based inspection forecast, transformer oil analysis on a Duval triangle | [18](learning/18-gas-to-power-heat-rate-hours-and-oil.md) |
| 2. Solar | A PV model behind the tags, the loss waterfall that adds up exactly, strings against their sister strings, a cleaning advisor, batteries | [19](learning/19-solar-expected-power-and-losses.md) |
| 3. Oil & gas | Well decline and lost oil, ESP diagnostics, pipeline corrosion with remaining life, compressor stations, exchanger fouling, API inspection schedules | [20](learning/20-oil-and-gas-decline-corrosion-inspection.md) |
| 4. Reliability KPIs | Five years of ISO 14224 failure history, MTBF/MTTR/availability, Pareto, bad actors, Asset 360 *Failures* tab | [21](learning/21-reliability-mtbf-mttr-pareto.md) |
| 5. Weibull and risk matrix | Maximum-likelihood fit with suspensions and bounds, Weibull paper, R(t), a 5×5 risk matrix you can click into | [22](learning/22-weibull-and-the-risk-matrix.md) |
| 6. FMEA and RCA | RPN from the real history and the models, an RCM strategy per mode; investigations with 5 Whys, fishbone, timeline and actions that raise work orders | [23](learning/23-fmea-and-root-cause-analysis.md) |
| 7. Vibration | Spectra with real fault signatures that add up to the vibration tag, a 12-week waterfall, shaft orbits for oil-film bearings, findings before the overall level alarms | [24](learning/24-vibration-spectrum-waterfall-orbit.md) |
| 8. Digital twin (2D) | Process flows, solar blocks and pipeline routes with live health, values and limits; a 72-hour replay with an activity strip; Asset 360 *Twin* tab | [25](learning/25-digital-twin-2d.md) |

**Size of the safety net:** 407 unit and component tests (web 190, mock data 147, UI 34, contracts 31, API client 5) and 86 end-to-end tests in Chrome (accessibility per screen, journeys, performance, and the new phone-width check), all passing. At the end of Phase 2 there were 157 unit tests and no end-to-end tests.

## Found and fixed during this review

| Finding | How it was found | Fix |
|---|---|---|
| **Seven screens were too wide for a phone** (up to 850 px at 375 px wide): power, solar, oil & gas, reliability, Weibull, risk matrix, root-cause list. Three separate causes, below. | A measuring script at phone width, then a new end-to-end test in real Chrome | All three fixed; **new test** `e2e/layout.spec.ts` checks 21 screens at 375 px |
| ① Charts start at 800 px and measure their box to shrink. In a grid without a minimum width, the 800 px chart widened its own box, so it measured 800 and stayed there. | Same | Charts can't exceed their box (`max-w-full`), and single-column grids use `grid-cols-1`, so a column can shrink below its content. Two-column grids use `minmax(0, …)` for the same reason |
| ② Hidden screen-reader text in table cells is absolutely positioned. A scrolling box only clips absolute children if it's *positioned* itself, so the text escaped the table's scroll box and widened the page. | The test's "widest element" report | `relative` on the 23 scrolling wrappers around tables and charts |
| ③ The header's "Viewing as" picker was a few pixels too wide on every page | Same | The shared `Select` can now shrink; its label can't |
| **The Command Center's MTBF and MTTR tiles were invented numbers**, different from the Reliability page's | Listed as a follow-up in chunk 4 | Worked out from the failure history exactly as the Reliability page does; **new test** checks they match |

Fixed earlier in Phase 3, while building (recorded in each chunk's commit): stopped machines counting as tripped in the twin; a healthy pump flagged with a bearing defect because BPFO (3.04×) sits next to 3×; and corrective actions showing the internal work-order id instead of its number.

## Planned for Phase 3 but not built, or built differently

| Item | Notes |
|---|---|
| **3D plant model** (§6.8) | Left out by decision ([scope decision 11](scope-decisions.md)). The twin is 2D. |
| **Process diagrams are schematics, not P&IDs** | The flow is generated from each class's place in the process. Real P&IDs need drawings we don't have. |
| **Waterfall drawn as stacked spectra, not a heat map** | The plan said "a heat map of ≤ 60 spectra". With 13 weekly measurements, stacked lines show a growing peak more clearly. |
| **Waterfall and orbit have no keyboard cursor** | Unlike the other charts. The waterfall has a table view instead; the orbit has a summary and its peak-to-peak values in text. |
| **Orbit shows only 1×, 2× and oil whirl** | Flow noise near surge shows in the spectrum but not in the orbit. |
| **Advanced vibration views**: Bode, Nyquist, order tracking, envelope analysis | Left out by decision; they need real vibration data. |
| **FMEA doesn't generate PM tasks** | It recommends a strategy and counts open preventive work; creating the tasks is left for later. |
| **Root-cause investigations live in memory** | Like everything in the mock, they're gone after a reload. A real backend would store them. |
| **Rod-pump dynamometer cards, API 570 process piping** | Left out in chunk 3: the data isn't in the simulation. |
| **OEE and PM compliance tiles** | Still seeded numbers; the simulation doesn't model them yet. MTBF and MTTR are now real (above). |
| Monte Carlo availability, reliability block diagrams (§6.7) | Later, by decision. |

Still open from the earlier reviews: Storybook, the command palette and keyboard shortcuts, the synchronised event-timeline canvas and virtualised tables. Screen-reader and keyboard testing by a person is still needed, because automated checks find only about a third of accessibility problems.

## Numbers worth watching

Production build:

| Chunk | Size | Gzipped | Since Phase 2 | Loaded |
|---|---|---|---|---|
| App start (`index`) | 402 kB | 129 kB | +55 kB (+18 kB gzipped) | always |
| Map (MapLibre) | 1,050 kB | 280 kB | — | only when a map is shown |
| Charts and prediction detail (ECharts) | 562 kB | 187 kB | — | only when a chart is shown |
| Mock backend (worker) | 301 kB | 90 kB | +93 kB | always (demo only; a real backend removes it) |

Every Phase 3 page loads only when you open it, so the start chunk grew less than the features did. Most of its growth is the shared contracts (every new endpoint's schema). If first load matters later, that's the place to look. The worker grew with the simulation (failure history, PV model, spectra), and a real backend would remove it.

The twin's server side works out an area's 72-hour activity on every request: under 80 ms for the biggest areas in the mock. A real backend would keep that history rather than recompute it.

## Lessons worth keeping

1. **Layout bugs hide at sizes nobody looks at.** Every Phase 3 screen was checked in three themes, but none at phone width. Seven were broken there. Now a test checks.
2. **A test environment can lie, in both directions.** The browser pane used for checks runs no animation frames while hidden, so charts never measured themselves there and looked broken when they weren't. jsdom can't measure at all. The phone-width check therefore lives in Playwright's real Chrome.
3. **Compute it from the source, once.** The MTBF tile and the Reliability page now share one function. Two numbers for the same thing, from different places, will eventually disagree, and that costs trust in both.
4. **The mock's rules should match the real system's rules.** The twin briefly said stopped engines had tripped, because it judged limits differently from the alarm system. Shared rules ("limits count only while running") keep screens consistent.

## Recommendation for what's next

Phase 3 is done. Before Phase 4 ("operations and governance": inventory and spare parts, HSE, ESG, financials, reports, admin, integrations, the AI copilot), two options:

- **Go straight to planning Phase 4.** It's the largest remaining phase, so a plan with chunks first, as for Phase 3.
- **A short hardening chunk first**: a keyboard cursor for the waterfall and orbit, real OEE and PM compliance figures, and a manual screen-reader and keyboard pass over the Phase 3 screens.

Either is reasonable. The hardening chunk is smaller and closes the loose ends this review lists; Phase 4 delivers new capability.
