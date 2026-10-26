# Learning note 31: Reports, printing, and the shift handover

*This note goes with Phase 4 chunk 6. Open **Reports** (`/reports`) as any role except Field Technician; try the **Control Room Operator** for the shift handover.*

## 1. A report is a list of sections

Each ready-made report is just a title and a list of section names ([report-defs.ts](../../apps/web/src/features/reports/report-defs.ts)):

| Report | Sections |
|---|---|
| Weekly reliability | Key measures, top risks, reliability, PM, alarm load |
| Monthly ESG | Emissions, safety |
| Monthly financials | Financials, PM, spare parts |
| Management summary | Key measures, top risks, financials, emissions, safety |

Each section asks the server for data the app **already serves** (the same endpoints the Command Center, Reliability, ESG and Financials pages use), so a report can never disagree with the screen it summarises. The **builder** is the same idea with checkboxes: tick sections and the report appears underneath.

**Why keep the choice in the address?** The builder writes your choice into the URL (`/reports/build?sections=risks,inventory`). Copy that link and anyone opening it gets the same report, for whatever scope they're looking at. No "save" button or database is needed. It's the same rule the app uses for scope and time range: if it can be shared, put it in the URL.

## 2. Showing the working, on paper

On screen, a KPI tile hides "how it was worked out" behind a hover. Paper can't hover. So every report section is a table with three columns: **measure · value · how it's worked out**. "MTBF 22k h: running hours ÷ failures, last 12 months". A reader can check a number without opening the app.

## 3. Printing without a PDF library

We agreed to use the browser's own **Print → Save as PDF** rather than add a PDF library. Two things make the page print well:

- **Print styles.** CSS can apply rules only when printing (`@media print`). Tailwind writes these as `print:` classes: `print:hidden` on the top bar, alarm bar, menu, page header and buttons, `print:h-auto` and `print:overflow-visible` so the page isn't cut off at one screen's height, and `break-inside-avoid-page` so a section doesn't split across two sheets of paper.
- **Light theme on paper.** Dark and control-room themes use light text. Browsers leave out background colours when printing, which would leave pale text on white paper. The browser fires `beforeprint` and `afterprint` events, so the app switches to the light theme just before printing and back afterwards ([providers.tsx](../../apps/web/src/app/providers.tsx)).

A real-browser test switches Chrome into print mode, checks that only the report shows, and has Chrome make a PDF of it ([print.spec.ts](../../apps/web/e2e/print.spec.ts)).

## 4. The shift handover

Plants run around the clock in **shifts**, here 12 hours, 06:00–18:00 and 18:00–06:00 (UTC, to keep it simple; a real plant uses its own local time). The **handover** is where one crew tells the next what they need to know. Poor handovers have caused serious accidents: on Piper Alpha in 1988, a pump's pressure safety valve had been removed for maintenance, and the night shift didn't know when they started that pump.

The page answers four questions:

1. **What happened this shift?** Counts (alarms raised and cleared, work raised and finished, new predictions, operator actions) and the most serious events, worst first.
2. **What's still urgent?** P1 and P2 alarms still active, and whether anyone has acknowledged them.
3. **What's in progress?** Work orders being worked on, and by whom.
4. **What should I watch?** Notes the crew leaves for the next shift. Notes from this shift and the one before are shown, so nothing written at 05:55 disappears at 06:00.

The previous shift's notes are **seeded from what is really going on** (an urgent alarm still active, a prediction with no work order yet), so they make sense next to the rest of the page. A note written while looking at one site is about that site; looking at everything, it's for all sites.

## 5. Design choices worth noticing

- **Headings in order.** The page is `h1` "Reports", the report title is `h2`, each section `h3`. Screen-reader users jump between headings, so skipping a level is like a book with a missing chapter number.
- **Who can write.** Anyone with Reports access can read the handover; writing a note is for the operators, planners, engineers, plant manager and HSE officer, the people who work shifts or follow them.
- **Not built:** scheduled or emailed reports. The mock has no mail server; a real backend would add them.
- **The placeholder moved again.** The "module still to come" accessibility check now uses `/data` (chunk 7).

## 6. Exercises

1. Open the weekly reliability report, then press Ctrl+P. What's missing from the preview, and why?
2. Switch to the dark theme and print again. Which colour is the text on paper?
3. Build a report with only "Top risks" and "Spare parts", copy its address, and open it in a new tab with a different scope.
4. As the Control Room Operator, scope to one site and leave a note. Then scope to another site: is your note there? And for the whole enterprise?
