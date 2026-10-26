# Phase 4 plan: operations and governance

*Agreed 2026-10-24. Progress: chunks 1–6 done (2026-10-26): PM programs, inventory and spares, HSE and compliance, energy and ESG, financials, reports.*

Phases 1–3 answered "what's happening, what will fail, and why?". Phase 4 fills in the rest of the menu: the modules that turn predictions into **parts, permits, money, reports and compliance**, the screens that run the platform itself, and the AI copilot. Every remaining placeholder in the menu becomes a real page, and every role gets its own home page (today HSE, Procurement, ESG and Admin still land on the Command Center).

## What's in Phase 4

| Area | Route | The question it answers | Who |
|---|---|---|---|
| PM programs | `/maintenance/pm` | "Is every machine on the right preventive plan, and is it being done?" | Maintenance Planner, Reliability Engineer |
| Inventory and spares | `/inventory` | "Do we have the parts we'll need?" | Procurement, Maintenance Planner |
| HSE and compliance | `/hse` | "Is anything safety-critical at risk?" | HSE Officer |
| Energy and ESG | `/esg` | "Are we on track for emissions targets?" | ESG Lead |
| Financials | `/financials` | "What is maintenance costing, and what is prediction saving?" | Executive, Plant Manager |
| Reports | `/reports` | "Can I hand this over, print it, send it?" | Everyone |
| Data and integrations | `/data` | "Is the data trustworthy and arriving?" | Condition Monitoring Analyst, Admin |
| Administration | `/admin` | "Who can do what, and who changed what?" | System Admin |
| Predictive tools | `/predictive/models`, `/rules`, `/what-if` | "Which models do we trust, what rules fire, what if we wait?" | Reliability Engineer, Analyst |
| AI copilot | panel on every page | "Ask the data a question in plain words" | Everyone |

## Chunks, in order

**Decided 2026-10-24: dependencies first**, so each chunk can use what the previous ones built: preventive plans and predictions create demand for parts; parts and permits feed money; money feeds reports; the copilot comes last so it can answer questions about everything.

| # | Chunk | What you'd see | Notes |
|---|---|---|---|
| 1 ✅ | **PM programs** (`/maintenance/pm`) | Preventive maintenance plans per class (task, interval by time or running hours, parts, crew hours), built from FMEA's recommended strategies; which assets each plan covers; PM compliance (done on time, late, missed), which replaces the Command Center's seeded PM-compliance tile; generating the next work orders | Closes the gap from chunk 6 of Phase 3 ("FMEA doesn't generate PM tasks"). Turnarounds stay for later |
| 2 ✅ | **Inventory and spares** (`/inventory`) | Stock per site with min/max and criticality; **demand forecast from predictions and planned work** ("PMP-106's bearing will need a 6309 in ~20 days; 2 in stock"); reorder suggestions; parts on work orders and in the field close-out; Procurement's home page | Spec §6.7 "spare parts criticality and stocking" was deferred to here |
| 3 ✅ | **HSE and compliance** (`/hse`) | Safety-critical elements and their health; permits to work linked to work orders (and a permit check before field work starts); incidents and near misses; management of change (MoC) with an approval flow; HSE Officer's home page | Builds on the field safety checks from Phase 2 |
| 4 ✅ | **Energy and ESG** (`/esg`) | CO₂ from fuel burned (gas turbines, engines, heaters), flaring, methane from compressors and pipelines; intensity per MWh or barrel; progress against targets; the assets that emit most and how their health affects it; ESG Lead's home page | Needs new emission tags in the mock, from the same physics as heat rate |
| 5 ✅ | **Financials** (`/financials`) | Value realised by predictions (avoided downtime, from the work orders), cost of downtime per site, maintenance spend vs budget by month and category, cost per work order type | Turns the Command Center's "value delivered" tile into a page with its workings shown |
| 6 ✅ | **Reports** (`/reports`) | A report library (weekly reliability, monthly ESG, …), **shift handover** (what happened this shift, open alarms, work in progress, notes), and a simple report builder from existing widgets; print or save as PDF through the browser | Uses chunks 1–5 |
| 7 | **Data and integrations** (`/data`) | Data sources and their connection status (simulated historian, CMMS, lab), tag browser with limits, data-quality dashboard (gaps, flatlines, stale values the mock already produces) | |
| 8 | **Administration** (`/admin`) | Users and roles (the access matrix), hierarchy browser, **threshold editing that changes the simulation's limits**, and an audit log of every change made in the app; Admin's home page | Threshold edits are guarded by the existing `threshold.edit` permission |
| 9 | **Predictive tools** | Model registry (each model's precision from the feedback loop, versions, approve/retire), a rule builder ("BRG1_VIB > 4.5 mm/s for 10 min → P2 alarm"), and a what-if simulator ("what if we defer this repair 30 days?") | Listed as Phase 4 in the information architecture; never planned before |
| 10 | **AI copilot and command palette** | A chat panel that answers anticipated questions from the data with citations and suggested actions (always confirmed, never automatic), as ADR-0010 decided; `Ctrl+K` command palette and the keyboard shortcuts from the information architecture | Scripted provider, no API key in the browser |
| 11 | **Phase 4 review** | Like the Phase 3 review: criteria re-tested, gaps listed, real-browser checks | |

**What chunk 1 added beyond the table:** 56 plans from FMEA (planned replacements at B10 for wear-out modes, condition checks every 30 or 90 days), running hours for rotating machines' overhauls; a seeded year of PM outcomes with a different discipline per site, plus PM work raised and closed out in the app; compliance counts a PM against you until its work is closed out, not merely raised (a test caught the first version rewarding paperwork); the Command Center's PM-compliance tile is now real. See [learning note 26](learning/26-pm-programs-and-compliance.md).

**What chunk 2 added beyond the table:** one part per kind of equipment × failure mode (the PM plans' parts), stocked at every site with that equipment; reorder points from lead-time demand plus safety stock by VED criticality; a 90-day forecast from PM work coming due and from open predictions (bearings have no PM plan: their demand is all predicted); a "will run short" check that walks needs against arrivals by date; purchase orders that arrive after the lead time; a work order's page shows its parts and the site's stock, and closed-out replacements leave stock. Parts aren't entered on the field close-out form yet: they're issued from the plan or failure mode. See [learning note 27](learning/27-spare-parts-and-stock-control.md).

**What chunk 3 added beyond the table:** permits to work follow the work orders (requested when hazardous work is scheduled, issued by the HSE officer, required by the server before work starts, closed at close-out); the work-order store gained a status listener and a start check so HSE plugs in without the work-order code knowing about permits; safety-critical elements are impaired by poor health, an overdue PM or a P1 alarm; process safety events come from leaks in the failure history (tier 1 only on the most critical equipment), alongside reported near misses; MoC with a server-enforced review order. Four earlier tests now issue a permit before starting work. See [learning note 28](learning/28-hse-permits-incidents-moc.md).

**What chunk 4 added beyond the table:** no new tags were needed: combustion comes from the existing fuel meters (engines from output ÷ 42 % efficiency), flaring from separator gas and compressor downtime, methane from seals, pipeline leak index, gas-driven valves and wellheads, × GWP 29.8 (IPCC AR6); intensity per MWh or boe; solar credited with avoided grid emissions; "avoidable" emissions from fouling (heat rate above its clean value, sample by sample while burning fuel, ignoring under 1 %), corrosion leaks and flaring during compressor downtime. Targets are a seeded figure per site; the projection is the 90-day rate. See [learning note 29](learning/29-emissions-accounting.md).

**What chunk 5 added beyond the table:** the last 12 calendar months. Value from predictions = for each finished predictive job, the failure it prevented (the same failure cost its prediction showed) − labour at $95 an hour − parts at stores prices; a job closed out as a false alarm prevented nothing and counts only as cost. Money at risk = open predictions × probability × failure cost. Downtime = the failure history's hours × the cost of an hour per business ($18,000 oil & gas, $12,000 gas-to-power, $900 solar). Spend = corrective repairs from the failure history, PM jobs done and predictive jobs; the budget is a seeded figure per kind of work. The Command Center's "Value delivered" tile now shows the same figure as this page, replacing its old estimate. See [learning note 30](learning/30-maintenance-financials.md).

**What chunk 6 added beyond the table:** a report is a title plus a list of sections (key measures, top risks, reliability, PM, alarm load, spare parts, HSE, emissions, financials), each a table of figures with how each was worked out, so the working survives on paper. Four ready-made reports (weekly reliability, monthly ESG, monthly financials, management summary); the builder keeps its choice in the address (`/reports/build?sections=…`), so a custom report can be bookmarked or sent. The shift handover (12-hour shifts from 06:00 and 18:00 UTC) counts what happened this shift, lists urgent alarms still open, work in progress and the most serious events, and keeps notes for the next shift; the previous shift's notes are seeded from real alarms and predictions. Printing hides the app around the page and switches dark themes to light. No scheduled or emailed reports (no mail server in the mock). See [learning note 31](learning/31-reports-and-shift-handover.md).

## Decisions (made 2026-10-24)

| Decision | Outcome |
|---|---|
| **Order** | **Dependencies first**, so the copilot can answer questions about everything |
| **Predictive tools** | **All three**: model registry, rule builder, what-if simulator (chunk 9) |
| **PM programs and turnarounds** | **PM programs** get a chunk (chunk 1). **Turnarounds** (`/maintenance/turnarounds`, big planned shutdowns with critical paths) are left for later |
| **Reports output** | **Browser print / save as PDF**: a print-friendly layout, no new library |

## Things to keep in mind

- **The budgets still hold:** ≤ 2,000 points per chart line, ≤ 300 live tags, online only.
- **Changes are in memory.** Admin edits, permits, MoCs and stock movements live in the mock backend and reset on reload, like work orders today. A real backend would keep them.
- **Every new screen joins the accessibility tests** (jsdom and real browser, three themes), **the phone-width test**, and the missing-text check.
- **Each chunk gets a learning note.** The engineering ideas this time are stock control (min/max, lead time, criticality), permits and MoC, emissions accounting, and how a report or copilot answer can show where every number came from.

## After Phase 4

The [architecture's delivery plan](01-architecture/README.md) ends with a final step: testing and quality, documentation, and a demo walkthrough script. Turnaround planning also waits. Still open from earlier reviews: Storybook, virtualised tables, the synchronised event-timeline canvas, and a manual screen-reader pass. A real backend (server, database, authentication, real AI calls) is outside this project's plan.
