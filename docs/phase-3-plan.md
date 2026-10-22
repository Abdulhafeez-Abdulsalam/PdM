# Phase 3 plan: domain depth

*Agreed 2026-10-22. Progress: chunks 1–3 done (2026-10-22): the industry views are complete.*

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

## Chunks, in order

Each chunk is reviewable on its own, like Phase 2. **Decided 2026-10-22: the industry views come first**, then the reliability suite.

| # | Chunk | What you'd see | Notes |
|---|---|---|---|
| 1 ✅ | **Gas-to-power operations** (`/operations/power`) | Plant output vs dispatch, availability, capacity factor; gas turbine heat rate and compressor efficiency vs an ambient-corrected baseline (the storyline's fouling and water-wash recovery shows up here); EOH counters and hot-gas-path inspection forecast; transformer gas analysis on a Duval triangle | The demo storyline lives on a gas turbine, so this makes it shine |
| 2 ✅ | **Solar operations** (`/operations/solar`) | Power vs expected, performance ratio, the loss waterfall (irradiance → soiling → temperature → inverter → clipping…); inverter heat map; underperforming strings; soiling and a cleaning recommender; BESS state of charge and health | The biggest fleet (768 strings) and the most visual |
| 3 ✅ | **Oil & gas operations** (`/operations/oil-gas`) | Upstream: ESP diagnostics and production vs decline curve. Midstream: pipeline wall thickness and corrosion rates, compressor stations. Downstream: exchanger fouling, PSV and inspection schedules (API 510/570/653) | Uses health and anomaly measures at first; gains MTBF/MTTR once chunk 4 exists |
| 4 | **Reliability KPIs** (`/reliability`) | MTBF, MTTR, availability per class and site; Pareto of failure modes; bad actors and repeat failures; Asset 360 *Failures* tab | Built from the ISO 14224 close-outs; becomes the Reliability Engineer's home page |
| 5 | **Weibull analysis and risk matrix** | Pick a failure mode and class: fitted Weibull curve with confidence band, β explained ("wearing out" vs "early failures"), reliability R(t) curve; a 5×5 risk matrix you can click into | Needs chunk 4's failure history |
| 6 | **FMEA and root-cause analysis** | FMEA table with severity × occurrence × detection (RPN) per failure mode, linked to PM tasks; an RCA workspace with 5-Whys, a fishbone diagram, timeline and corrective actions | Turns analysis into action; links to work orders |
| 7 | **Rotating-equipment diagnostics** | Asset 360 *Vibration* tab: frequency spectrum with fault-frequency markers (1×, 2×, bearing frequencies BPFO/BPFI), a waterfall (spectra over time), an orbit plot | The mock must generate spectra with real fault signatures |
| 8 | **Digital twin (2D)** (`/twin`) | A process diagram per unit with live values and alarm colours, clicking through to Asset 360; solar farm layout (block → inverter → string); pipeline route by distance with anomalies; a time slider to replay the last days | Ties everything together; needs the earlier chunks' data |
| 9 | **Phase 3 review** | Like the Phase 2 review: criteria re-tested, gaps listed, real-browser checks | |

**What chunk 1 added beyond the table:** a reusable line chart (also for solar's power vs expected); transformer gases come from monthly lab oil samples (the online monitor covers H₂, C₂H₂ and CO); three hand-placed plant conditions so the page always has something to show (a fouling turbine, one washed five days ago, a gassing transformer); and an air-temperature effect on gas turbine power and heat rate, so "ambient-corrected" means something. See [learning note 18](learning/18-gas-to-power-heat-rate-hours-and-oil.md).

**What chunk 2 added beyond the table:** the inverter, module-temperature and soiling tags now come from a PV model (sunlight, panel heat, dust, clipping), so the loss waterfall adds up exactly; strings are compared with their sister strings; a cleaning advisor works out the cheapest wash interval; three hand-placed solar conditions at Pecos. See [learning note 19](learning/19-solar-expected-power-and-losses.md).

**What chunk 3 added beyond the table:** well rates now decline (exponential, per well) and drop to zero when their pump fails, so lost oil is measurable; remaining life uses the worse of the long- and short-term corrosion rates; inspection intervals follow API 510/653/576 and pipeline in-line inspection rules with the half-life rule; a failed ESP, a hot ESP and a compressor near surge are hand-placed. Rod-pump dynamometer cards and API 570 process piping were left out (the data isn't in the simulation). See [learning note 20](learning/20-oil-and-gas-decline-corrosion-inspection.md).

Asset 360 gets its *Performance* tab in chunks 1–3 (each class shows its own measures), *Failures* in chunk 4 and *Twin* in chunk 8.

## Decisions (made 2026-10-22)

| Decision | Outcome |
|---|---|
| **3D plant model** (spec §6.8) | **Left out**, recorded in [scope decisions](scope-decisions.md). It needs a 3D library (~600 KB) and 3D models we don't have; the 2D diagrams cover most of the need |
| **Order** | **Industry views first** (gas-to-power, solar, oil & gas), then the reliability suite |
| **Depth of rotating diagnostics** | The core three: spectrum, waterfall, orbit. Bode, Nyquist, order tracking and envelope analysis are left for specialists with real vibration data |
| **Monte Carlo availability / reliability block diagrams** (§6.7) | Later, not in Phase 3 |

## Things to keep in mind

- **The budgets still hold.** No chart over 2,000 points per line (a spectrum is ≤ 2,000 frequency bins; waterfall = a heat map of ≤ 60 spectra). Live data ≤ 300 tags. Online only.
- **The mock grows a lot.** Multi-year failure history for Weibull (6 months of work orders isn't enough), ambient-corrected baselines, vibration spectra with fault frequencies, solar loss components, transformer dissolved-gas values, pipeline thickness surveys. All seeded and deterministic, as now.
- **Every new chart follows the dataviz rules** used for the alarm-rate and comparison charts: table view, keyboard tooltip, one y-axis, status colours reserved.
- **Every new screen joins the accessibility tests** (jsdom and real browser, all three themes) and the missing-text check.
- **Each chunk gets a learning note.** Phase 3 is heavier on engineering ideas (Weibull, heat rate, performance ratio, vibration spectra), so the notes explain those too.

## Not in Phase 3

Phase 4 holds inventory and spare parts (so "spare parts criticality and stocking" from §6.7 waits), HSE, ESG, financials, reports, admin, integrations and the AI copilot. The what-if simulator, rule builder and model registry (§6.4) aren't in any phase plan yet; they're listed in the Phase 2 review's gaps.
