# Phase 8 plan: getting data out

Chosen on 2026-11-04 from the "Open" column of the [Phase 7 review](phase-7-review.md): Excel and CSV export, and scheduled reports. Today a report can only be printed, and a table can't leave the screen at all.

## Chunks, in order

| # | Chunk | What you get | Notes |
| --- | --- | --- | --- |
| 1 ✅ | **CSV export** | An **Export** button on the main tables (alarms, assets, work orders, tags, audit log, and each table in a report), giving every matching row, not just the page on screen, with units in the headings. Each export goes in the audit log | Spec §6.13: "with row limits and audit logging". Opens cleanly in Excel, including non-English characters. Protected against formula injection |
| 2 ✅ | **Excel export** | The same tables as `.xlsx`, with real numbers and dates so they sort and add up; a whole report as a workbook with one sheet per section | Uses `write-excel-file` 4.1.1 (MIT, one small dependency, loaded only when someone exports, so the app stays as fast) |
| 3 | **Scheduled reports** | Choose a report, how often (daily, weekly, monthly), and the scope; see, pause and delete your schedules; when one comes due, your bell says it's ready, with a history of runs. Works in both modes and survives a restart | Runs on simulated time, so a week can be demonstrated in a minute |
| 4 | **Review** | Full suites, criteria, screenshots and the demo script | |

## Decisions

- **Which Excel library?** `write-excel-file`: it's small and only writes, which is all we need. `exceljs` is over ten times bigger with nine dependencies, and hasn't been published since 2024. The `xlsx` package on npm is old, and its current versions are published elsewhere.
- **Delivery of scheduled reports** is the bell only. Email needs a mail service and an account, so "distribution lists" stay open.
- **What is a scheduled run?** (a) A notification linking to the report, showing the plant's figures **as they are when opened**; simple. (b) A **frozen copy** of the figures from the moment it ran, so last Monday's report still says what it said on Monday. That's what a real report archive does, but it needs the reports reworked so the backend can produce them. **Decided 2026-11-04: (a); (b) stays open.**

## Things to keep in mind

- **Both backends**, through the contracts first; every commit pushed after `npm run check`.
- Ask before starting each chunk.
- Run the complete browser suite before the review is signed off.
- Exports contain the same data the person can already see: no new access.

**What chunk 1 added:** one **Export CSV** button (`shared/export`) on the alarm list, asset registry, work-order list, tag browser, audit log and every table in a report. It gives every row matching the filters on screen, fetched page by page up to 10,000, and says so if it stopped short. Values are in the units the person has chosen, with the unit in its own column. The file opens cleanly in Excel: a byte-order mark keeps "°C" intact, and text starting with `=`, `+`, `-` or `@` can't run as a formula. Each export goes in the audit log, saying what, how many rows and who. See [learning note 57](learning/57-getting-data-out-safely.md).

**What chunk 2 added:** every export now offers **CSV** or **Excel**. Excel files hold real numbers and dates, so they sort and add up, with bold headings, sensible column widths and a frozen top row. A report gets one more button that exports the whole thing as a workbook, one sheet per section. Report tables are read from the page, so plain numbers like `1,234` become numbers, and formatted ones like `$1.2M` or `87 %` stay as shown. The library, `write-excel-file` 4.1.1, sits in its own 20 KB download (gzipped), loaded only when someone exports. See [learning note 58](learning/58-a-spreadsheet-is-not-text.md).
