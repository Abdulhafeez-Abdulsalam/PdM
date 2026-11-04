# Phase 8 review

Phase 8 lets data leave the app. Any main table exports to CSV or Excel, a whole report becomes a workbook, and reports can be scheduled, with the bell saying when one is ready.

*Reviewed 2026-11-05, at commit `fe295a2` plus the walkthrough and documentation changes in this review's commit.*

## Acceptance criteria

| # | Criterion (as amended in [scope-decisions.md](scope-decisions.md)) | Demo mode | Server mode | Evidence, re-run for this review |
|---|---|---|---|---|
| A | A new user finds the top 5 riskiest assets within 10 s of login | ✅ | ✅ | Every role's home-page test; server test |
| B | Any prediction traces to evidence, explanation, confidence and action within 2 clicks | ✅ | ✅ | Unit and browser tests; the walkthrough |
| C | An alarm becomes an assigned work order in under 30 s | ✅ | ✅ | Two clicks in both suites and the walkthrough |
| D | A technician who loses connection keeps what they typed | ✅ | ✅ | Both suites; the walkthrough |
| E | Dashboards stay responsive with 300 live tags at 1 update/s | ✅ | ✅ | Table below |
| F | Every screen passes automated accessibility checks in all three themes | ✅ | ✅ | axe on every screen, including the new page: 0 violations |
| G | No hard-coded strings, units or colours outside tokens and the text catalog | ✅ | ✅ | New screens use the catalog; column headings in exports too |

**Criterion E, re-measured**, one run of the full suite: slowest tap 64 ms (budget 100), 80 ms at 2× slower (budget 200) and 312 ms at 4× slower (budget 500). Longest freeze 63, 76 and 220 ms. The whole suite passed first time, with no re-runs.

**Size of the safety net:** 621 unit, component and server tests (web 284, mock data 229, contracts 44, UI 34, server 25, API client 5), 170 end-to-end tests in Chrome (158 demo-mode, 12 against the real server), and 43 stories in three themes. At the end of Phase 7: 607 and 165.

**Bundle:** the app's start-up file is 467 kB (150 kB gzipped). The Excel code is a separate 71 kB (20 kB gzipped), loaded only when someone exports.

## What Phase 8 added

| Chunk | Highlights | Learning note |
|---|---|---|
| 1. CSV export | Every matching row up to 10,000; units as chosen; safe to open in Excel; audited | [57](learning/57-getting-data-out-safely.md) |
| 2. Excel export | Real numbers and dates; a whole report as a workbook; loaded only when used | [58](learning/58-a-spreadsheet-is-not-text.md) |
| 3. Scheduled reports | Daily, weekly or every 30 days; pause, resume, delete; the bell links to the report; survives a restart | [59](learning/59-things-that-happen-by-themselves.md) |

## Found and fixed

| Found by | Problem | Fix |
|---|---|---|
| The type check | The date check told TypeScript that any other value couldn't be text | Corrected, with cells converted one type at a time |
| The schedule tests | Report titles in the bell did not match those on the page | The same titles in both |

## Known, and left as they are

| Item | Notes |
|---|---|
| **A scheduled report shows today's figures** | By decision: it's a link, not a frozen copy. Opening last Monday's run shows the plant now |
| **Email and distribution lists** | Need a mail service |
| **Custom reports can't be scheduled** | Only the four ready-made ones |
| **"Monthly" is every 30 days** | Not the same date each month |
| **Exports are recorded by the browser** | A record, not a lock. The protection is that they hold only what the person can already see |
| **Formatted report figures stay text** | `$1.2M` and `87 %` don't become numbers in Excel, to avoid guessing |
| **A 10,000-row limit** | The app says so when it stops short |
| **PowerPoint and Parquet** | Named in the master prompt; not built |

## Still needs a person

**The [NVDA script](testing/nvda-script.md)**, and starting the weekly demo-mode workflow on GitHub once.

## What we learned

1. **Choosing the right format can remove a problem.** CSV needs protecting from formula injection; `.xlsx` states that a cell is text, so nothing can run.
2. **Don't guess at numbers.** Turning `$1.2M` into 1,200,000 would have looked helpful, and could have been wrong in someone's sums.
3. **The pattern held.** Schedules reused the bell, the command log and the audit log, so a new feature needed little new machinery.
