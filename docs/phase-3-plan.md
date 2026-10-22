# Phase 3 plan: domain depth

*Draft for review, 2026-10-22. Nothing here is built yet.*

Phase 1 built the foundation and Phase 2 the predictive core. Phase 3 ("domain depth" in the spec, §6.3, §6.7, §6.8) is where the app starts to speak each industry's language: a gas turbine engineer, a solar plant manager and a pipeline integrity engineer each get screens built around *their* questions, and the reliability engineer gets real analysis tools.

## What's in Phase 3

| Area | Spec | The question it answers | Who |
|---|---|---|---|
| Reliability suite | §6.7 | "Which equipment fails most, how often, and what should we do about it?" | Reliability Engineer |
| Gas-to-power operations | §6.3 | "Is the plant producing what it should, and what's eating efficiency?" | Plant Manager, Reliability Engineer |
| Solar operations | §6.3 | "How much energy are we losing, and where?" | Plant Manager |
| Oil & gas operations | §6.3 | "Are wells, pipelines and process equipment healthy and producing?" | Plant Manager, Reliability Engineer |
| Rotating-equipment diagnostics | §6.3 | "What exactly is wrong with this machine's vibration?" | Condition Monitoring Analyst |
| Digital twin (2D) | §6.8 | "Where is it, what's around it, and what happened when?" | Control Room Operator, everyone |
| Asset 360: failures, performance, twin tabs | §6.2 | The same, for one asset | Everyone |

## Proposed chunks, in order

Each chunk is reviewable on its own, like Phase 2. The order puts the highest value and lowest risk first, and builds data the later chunks reuse.

| # | Chunk | What you'd see | Why this order |
|---|---|---|---|
| 1 | **Reliability KPIs** (`/reliability`) | MTBF, MTTR, availability per class and site; Pareto of failure modes; bad actors and repeat failures; Asset 360 *Failures* tab | Built from data we already have (ISO 14224 close-outs). Becomes the Reliability Engineer's home page |
| 2 | **Weibull analysis and risk matrix** | Pick a failure mode and class: fitted Weibull curve with confidence band, β explained ("wearing out" vs "early failures"), reliability R(t) curve; a 5×5 risk matrix you can click into | The signature reliability tool; needs chunk 1's failure history |
| 3 | **FMEA and root-cause analysis** | FMEA table with severity × occurrence × detection (RPN) per failure mode, linked to PM tasks; an RCA workspace with 5-Whys, a fishbone diagram, timeline and corrective actions | Turns analysis into action; links to work orders |
| 4 | **Gas-to-power operations** (`/operations/power`) | Plant output vs dispatch, availability, capacity factor; gas turbine heat rate and compressor efficiency vs an ambient-corrected baseline (the storyline's fouling and water-wash recovery shows up here); EOH counters and hot-gas-path inspection forecast; transformer gas analysis on a Duval triangle | The demo storyline lives on a gas turbine, so this makes it shine |
| 5 | **Solar operations** (`/operations/solar`) | Power vs expected, performance ratio, the loss waterfall (irradiance → soiling → temperature → inverter → clipping…); inverter heat map; underperforming strings; soiling and a cleaning recommender; BESS state of charge and health | The biggest fleet (768 strings) and the most visual |
| 6 | **Oil & gas operations** (`/operations/oil-gas`) | Upstream: ESP diagnostics and production vs decline curve. Midstream: pipeline wall thickness and corrosion rates, compressor stations. Downstream: exchanger fouling, PSV and inspection schedules (API 510/570/653) | Broadest area; reuses chunk 1's KPIs and the documents tab's certificates |
| 7 | **Rotating-equipment diagnostics** | Asset 360 *Vibration* tab: frequency spectrum with fault-frequency markers (1×, 2×, bearing frequencies BPFO/BPFI), a waterfall (spectra over time), an orbit plot | Specialist; the mock must generate spectra with real fault signatures |
| 8 | **Digital twin (2D)** (`/twin`) | A process diagram per unit with live values and alarm colours, clicking through to Asset 360; solar farm layout (block → inverter → string); pipeline route by distance with anomalies; a time slider to replay the last days | Ties everything together; needs the earlier chunks' data |
| 9 | **Phase 3 review** | Like the Phase 2 review: criteria re-tested, gaps listed, real-browser checks | |

Asset 360 gets its *Failures* tab in chunk 1, *Performance* in chunks 4–6 (each class shows its own measures) and *Twin* in chunk 8.

## Decisions to make before starting

| Decision | Options | Recommendation |
|---|---|---|
| **3D plant model** (spec §6.8) | (a) build it with three.js; (b) leave it out; (c) a placeholder | **(b) leave it out.** It needs a 3D library (~600 KB), 3D models we don't have, and a lot of work for something a 2D diagram mostly covers. Record it in scope decisions like offline mode |
| **Order** | The order above, or industry views first | **The order above.** Reliability first: it uses data that already exists and helps every industry |
| **Depth of rotating diagnostics** | Full suite (waterfall, orbit, Bode, Nyquist, order tracking, envelope) or the core (spectrum, waterfall, orbit) | **The core three.** The rest are for specialists with real vibration data |
| **Monte Carlo availability / reliability block diagrams** (§6.7) | In Phase 3 or later | **Later.** Valuable but a project of its own |

## Things to keep in mind

- **The budgets still hold.** No chart over 2,000 points per line (a spectrum is ≤ 2,000 frequency bins; waterfall = a heat map of ≤ 60 spectra). Live data ≤ 300 tags. Online only.
- **The mock grows a lot.** Multi-year failure history for Weibull (6 months of work orders isn't enough), ambient-corrected baselines, vibration spectra with fault frequencies, solar loss components, transformer dissolved-gas values, pipeline thickness surveys. All seeded and deterministic, as now.
- **Every new chart follows the dataviz rules** used for the alarm-rate and comparison charts: table view, keyboard tooltip, one y-axis, status colours reserved.
- **Every new screen joins the accessibility tests** (jsdom and real browser, all three themes) and the missing-text check.
- **Each chunk gets a learning note.** Phase 3 is heavier on engineering ideas (Weibull, heat rate, performance ratio, vibration spectra), so the notes explain those too.

## Not in Phase 3

Phase 4 holds inventory and spare parts (so "spare parts criticality and stocking" from §6.7 waits), HSE, ESG, financials, reports, admin, integrations and the AI copilot. The what-if simulator, rule builder and model registry (§6.4) aren't in any phase plan yet; they're listed in the Phase 2 review's gaps.
