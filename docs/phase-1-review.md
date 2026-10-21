# Phase 1 review

Phase 1 ("Foundation") is complete: shell, role-based views, design system, asset hierarchy, Command Center, Asset 360 and Alarms — running in the browser on the simulated backend.

## Acceptance criteria

| # | Criterion (as amended in [scope-decisions.md](scope-decisions.md)) | Status | How it was verified |
|---|---|---|---|
| A | A new user finds the top 5 riskiest assets within 10 s of login | ✅ | Top risks visible **~1.1 s** after page load (measured in the browser, development build). Test checks the table matches the backend ranking. |
| B | Any prediction traces to evidence, explanation, confidence and action within 2 clicks | ✅ | **1 click** from a top-risk row opens the prediction panel with all four. Automated test. |
| C | An alarm becomes an assigned work order in under 30 s | ✅ | **2 clicks**, all fields pre-filled including assignee and a readings snapshot. App time **~1.1 s** (0.7 s open + pre-fill, 0.35 s create), measured in the browser. Automated test. |
| D | A technician who loses connection keeps what they typed | ✅ Phase 2, chunk 3 | Field task page keeps every entry in the tab through a dropped connection or reload; submit waits for the connection. Tested in `Field.test.tsx`. |
| E | Dashboards stay responsive with 300 live tags at 1 update/s | 🟡 Partly | Budget enforced in contracts, mock and client. A dedicated performance test comes with the Phase 2 test plan. |
| F | Every screen passes automated accessibility checks in all three themes | 🟡 Partly | Built to WCAG patterns (labels, roles, keyboard, table views, colour + shape). Automated axe checks not yet wired in. |
| G | No hard-coded strings, units or colours outside tokens and the text catalog | ✅ | All text in `en.json`; all colours via tokens (scanned); all units via `units.ts`. |

## What exists

| Area | Highlights |
|---|---|
| Shell | Top bar (scope picker, time range, role, display preferences, connection), live alarm bar, role-filtered menu, simulation panel, toasts, error pages |
| Command Center | Role-specific KPIs, top risks, AI daily briefing with citations, themed site map |
| Assets | Registry (search, filter, paging), Asset 360 with five tabs, live values with limits and staleness, charts with min/max band and limit lines, table views |
| Predictions | Side panel on any page via `?prediction=`; action and costs, remaining-life range, explanation, data quality, evidence charts |
| Alarms | ISA-18.2 list, filters in the URL, grouping, chattering and standing markers, flood warning, acknowledge (optimistic), shelve with reason and expiry, alarm → work order, keyboard shortcuts, event timeline |
| Units | SI / Imperial / Oilfield everywhere, including temperature differences |

## Deferred (and why)

| Item | Planned for |
|---|---|
| Storybook component catalogue | Phase 2 test & quality step |
| ESLint + Prettier + pre-commit hooks | Before Phase 2 coding starts — the codebase is now big enough to need it |
| Playwright end-to-end tests and automated axe checks | Phase 2 test plan |
| Virtualised tables (TanStack Virtual) | When a list can exceed a few hundred rows (alarm floods, registry > 500 per page) |
| Real-backend HTTP transport | When a backend exists |
| Command palette (Ctrl/Cmd + K) and global shortcuts (`g a`, `?` cheat sheet) | Phase 2 |
| Synchronised event-timeline canvas | Phase 2 |

## Lessons worth keeping

Most bugs in Phase 1 were found by **using the app**, not by tests: the map worker path, layout overflow, the temperature-difference conversion, an empty readings snapshot on fast clicks. Tests protect what's known; looking finds what isn't. Both are needed.
