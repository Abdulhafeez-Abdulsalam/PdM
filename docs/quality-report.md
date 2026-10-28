# Quality report

The quality chunk, done after the [Phase 2 review](phase-2-review.md), turns the two criteria that were only "partly" met (E and F) into automated tests, and adds end-to-end tests in a real browser. This page records how each is tested, what the tests found, and the measured numbers.

*Measured 2026-10-21 on the development laptop (Windows 11, Chrome), production build.*

## How to run

| Command | What it runs | When |
|---|---|---|
| `npm run check` | Formatting, types, lint, and all unit and component tests (including axe on every screen in jsdom, and the colour-contrast test). Runs at most half as many tasks at once as the machine has processors, so tests don't starve each other (Phase 4 review) | Before every commit |
| `npm run e2e` | Builds the app, serves it on port 4174, and runs Playwright in the installed Chrome: accessibility in all themes, user journeys, and the performance test (about 10 minutes on a quiet machine) | Before a release or after big changes |

`npm run e2e` writes a report to `apps/web/playwright-report/index.html`; the performance numbers are in each test's annotations.

## Criterion E: responsive with 300 live tags — ✅ met

`apps/web/e2e/perf.spec.ts` opens a diagnostics page (`/diagnostics/live-load`, not in the menu) showing 300 live tags with the same widget Asset 360 uses, then measures for 20 seconds while clicking a button with real mouse clicks. It runs at three speeds by slowing Chrome's CPU down.

| Machine (Chrome CPU) | Slowest tap, click to screen | Longest freeze | Blocked per second | Tiles changing per second |
|---|---|---|---|---|
| This laptop (1×) | 48–64 ms | none over 50 ms | 0 ms | ~250–280 |
| Older office PC (2× slower) | 56–136 ms | 86–93 ms | 20–32 ms | ~250 |
| Low-end machine (4× slower) | 160–304 ms | 225–237 ms | ~190 ms | ~240–280 |

(Ranges over several runs. Before the fixes below, the low-end row was: slowest tap 720 ms, longest freeze 1,017 ms.)

**Budgets** (the test fails above them): taps under 100 ms at full speed and under 200 ms on an older office PC ("good" on Google's scale), and under 500 ms on a low-end machine ("needs improvement"). An honest summary: on a weak machine, a screen full of 300 changing values costs real work, and the occasional tap there takes about a quarter of a second.

### What the test found, and the fixes

| Finding | Fix |
|---|---|
| All 300 changes were drawn in one go: on the low-end setting the page froze for up to **1 s** each second and a tap waited up to **0.72 s** | Changes are announced **50 tags per frame**, so the work arrives in small pieces and taps are handled in between (`packages/api-client/src/live.ts`, ADR-0005 update) |
| Every live value also re-rendered every second just to check whether it was stale | `useSimulationSelector`: a tile re-renders only when its stale/not-stale answer changes |
| Tiles scrolled out of view were still laid out and painted every second | `content-visibility: auto` on dense live grids |

Before trusting any number, four problems in the *measurement* were found and fixed: a competing browser tab, a tap button that re-rendered all 300 tiles, Playwright's trace recorder, and clicks that waited for the page to be idle. See [learning note 13](learning/13-measuring-performance-honestly.md).

## Criterion F: accessible in every theme — ✅ met

| Level | Test | Covers |
|---|---|---|
| Every colour | `packages/ui/src/tokens.test.ts` | Every text and health colour on every background, every theme, ≥ 4.5 : 1 |
| Every screen, every commit | `apps/web/src/test/a11y.test.tsx` | axe (WCAG 2.1 A + AA) on every screen (86 as of Phase 4 chunk 9), each as the role that uses it. jsdom can't see colours, so contrast is off here. Includes a self-check that axe really reports a known problem. |
| Every screen × theme, real browser | `apps/web/e2e/a11y.spec.ts` | axe including colour contrast on every screen × 3 themes (75 screens, plus the open copilot, command palette and shortcut sheet), one test per screen so a failure names the screen |
| Phone width, real browser | `apps/web/e2e/layout.spec.ts` | 42 screens and the open copilot at 375 px: the page never scrolls sideways (wide tables scroll inside their own box). Added in the [Phase 3 review](phase-3-review.md) |
| Printing, real browser | `apps/web/e2e/print.spec.ts` | A report and the shift handover in print mode: the bars, menu and buttons hide, the report stays, and Chrome makes a PDF. Added in Phase 4 chunk 6 |

**Result:** 0 violations on every screen in jsdom, and on all 25 screens × 3 themes in Chrome (re-run 2026-10-22, after the missing Phase 2 pages were added).

Automated checks find perhaps a third of accessibility problems. Keyboard order, sensible wording when read aloud, and screen-reader testing still need a person; that's a task for the final testing phase.

## End-to-end journeys

`apps/web/e2e/journeys.spec.ts`, all passing in Chrome on the production build:

| Journey | Checks |
|---|---|
| Criterion C: alarm → assigned work order | Two clicks, pre-filled form with assignee and readings snapshot, under 5 s of app time |
| Criterion D: typed work survives going offline | The browser's own offline switch (`context.setOffline`), the "kept" notice, submit disabled, reload, everything restored, then completed |
| Drag a card with the mouse | The plant manager drags a scheduled card to Approved |
| Every role's home page | 7 roles each land where the information architecture says |
| No console errors | Every end-to-end test fails if the browser console shows an error |

## Found by the end-to-end tests

| Finding | Severity | Fix |
|---|---|---|
| **The map was broken in the production build.** MapLibre looks for its worker file next to its own code; the build moves that code, so the worker was missing and the map stayed blank. Development mode was fine, which is why nobody saw it. | High: the Command Center map is the first screen for several roles | Vite copies the worker (`?url` import) and MapLibre is told where it is (`setWorkerUrl`) |
| An accessibility finding on `<html>` that couldn't be reproduced | Test noise | The browser check re-checks a finding a second later and reports only what persists |

The lesson is the same as in Phase 1: **testing the thing you ship finds what testing the thing you develop can't.**
