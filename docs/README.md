# Documentation

Everything written about PdM, in the order you'd read it. New here? Start with the [README](../README.md), then the architecture.

## How it's designed

The design documents, written before the code and kept up to date with it.

| Document | What it covers |
| --- | --- |
| [Architecture](01-architecture/README.md) | How the parts fit together, the package rules, the two backends, performance budgets |
| [Design system](02-design-system/README.md) · [components](02-design-system/components.md) | Colours and tokens, the three themes, type, spacing, and every shared component |
| [Information architecture](03-information-architecture/README.md) | The pages, the menus, and which role sees what |
| [Data contracts](04-data-contracts/README.md) | Every data shape and request between the app and a backend |
| [The simulated plant](05-mock-data/README.md) | How the mock backend simulates the company, its faults and its people |
| [Scope decisions](scope-decisions.md) | What changed from the original brief, and why |
| [Decision records (ADRs)](adr/README.md) | One page per technical decision: the options and why one was chosen |

## How it was built

The project went in phases, each planned with a list of chunks and closed with a review.

| Phase | Plan | Review |
| --- | --- | --- |
| 1. Foundations, the shell and the first modules | | [Review](phase-1-review.md) |
| 2. Predictions, work orders and field work | | [Review](phase-2-review.md) · [Quality report](quality-report.md) |
| 3. Industry views, reliability and vibration | [Plan](phase-3-plan.md) | [Review](phase-3-review.md) |
| 4. Every remaining module, and the copilot | [Plan](phase-4-plan.md) | [Review](phase-4-review.md) |
| 5. A real backend | [Plan](phase-5-plan.md) | [Review](phase-5-review.md) |
| 6. Finishing the delivery plan | [Plan](phase-6-plan.md) | [Review](phase-6-review.md) |
| 7. What an operator would miss | [Plan](phase-7-plan.md) | [Review](phase-7-review.md) |
| 8. Getting data out | [Plan](phase-8-plan.md) | |

## Showing it

- [Demo walkthrough](demo-walkthrough.md): a 15–20 minute script for stakeholders, one fault from its first warning to a verified repair, with what to click and what to say.

## Testing by hand

- [Screen-reader test script (NVDA)](testing/nvda-script.md): eight journeys to listen to, about 45 minutes.

## Learning notes

One note per step of the build, in plain language: the idea, how it's used here, and exercises to try. They were written for someone learning full-stack development through this project.

### Getting started: the frontend and its tools

- [01 · The big picture](learning/01-the-big-picture.md)
- [02 · Types, schemas and tests](learning/02-types-schemas-and-tests.md)
- [03 · Simulation, determinism and classes](learning/03-simulation-and-determinism.md)
- [04 · React and the app shell](learning/04-react-and-the-app-shell.md)
- [05 · Getting data on screen, and debugging layout](learning/05-data-on-screen-and-debugging-layout.md)
- [06 · Charts, units, and earning trust](learning/06-charts-units-and-trust.md)
- [07 · Forms, actions, and race conditions](learning/07-forms-actions-and-race-conditions.md)
- [08 · Code quality tools](learning/08-code-quality-tools.md)

### Predictions, alarms and maintenance work

- [09 · Feedback loops, and trusting your cache](learning/09-feedback-loops-and-caches.md)
- [10 · State machines and the work-order board](learning/10-state-machines-and-the-work-order-board.md)
- [11 · Field screens, and not losing someone's work](learning/11-field-screens-and-not-losing-work.md)
- [14 · Scheduling, and the schedule board](learning/14-scheduling-and-the-schedule-board.md)
- [15 · Anomalies across the fleet](learning/15-anomalies-across-the-fleet.md)
- [16 · Alarm performance and ISA-18.2](learning/16-alarm-performance-isa-18-2.md)
- [17 · Comparing sister assets, and the last asset tabs](learning/17-comparing-sisters-and-the-asset-tabs.md)
- [47 · One time axis (the synchronised event timeline)](learning/47-one-time-axis.md)

### Industry views and reliability engineering

- [18 · Gas-to-power — heat rate, operating hours and transformer oil](learning/18-gas-to-power-heat-rate-hours-and-oil.md)
- [19 · Solar — expected power, performance ratio and where the energy goes](learning/19-solar-expected-power-and-losses.md)
- [20 · Oil & gas — decline curves, corrosion and inspection codes](learning/20-oil-and-gas-decline-corrosion-inspection.md)
- [21 · Reliability — MTBF, MTTR, Pareto and bad actors](learning/21-reliability-mtbf-mttr-pareto.md)
- [22 · Weibull analysis and the risk matrix](learning/22-weibull-and-the-risk-matrix.md)
- [23 · FMEA and root-cause analysis](learning/23-fmea-and-root-cause-analysis.md)
- [24 · Vibration spectra, waterfalls and orbits](learning/24-vibration-spectrum-waterfall-orbit.md)
- [25 · The 2D digital twin](learning/25-digital-twin-2d.md)

### Running the rest of maintenance

- [26 · PM programs and PM compliance](learning/26-pm-programs-and-compliance.md)
- [27 · Spare parts and stock control](learning/27-spare-parts-and-stock-control.md)
- [28 · Safety-critical equipment, permits, incidents and management of change](learning/28-hse-permits-incidents-moc.md)
- [29 · Emissions accounting, and where maintenance meets ESG](learning/29-emissions-accounting.md)
- [30 · Maintenance financials, and the value of a prediction](learning/30-maintenance-financials.md)
- [31 · Reports, printing, and the shift handover](learning/31-reports-and-shift-handover.md)
- [32 · Data sources, tags, and data quality](learning/32-data-quality.md)
- [33 · Administration, access control and the audit log](learning/33-administration-and-access.md)
- [34 · Models, rules, and "what if we wait?"](learning/34-models-rules-and-what-if.md)
- [35 · The copilot, citations, and the command palette](learning/35-copilot-and-command-palette.md)

### The backend

- [37 · HTTP, REST, and the first server](learning/37-http-and-the-first-server.md)
- [38 · WebSockets, and one plant for everyone](learning/38-websockets-and-a-shared-plant.md)
- [39 · Signing in, sessions, and who may do what](learning/39-sign-in-sessions-and-role-checks.md)
- [40 · Databases, migrations, and a command log](learning/40-databases-migrations-and-the-command-log.md)
- [41 · AI providers, tools, and least privilege](learning/41-ai-providers-and-tools.md)
- [42 · Running a service](learning/42-running-a-service.md)
- [43 · Reviewing a backend](learning/43-reviewing-a-backend.md)

### Quality, testing and performance

- [12 · Reviewing your own work](learning/12-reviewing-your-own-work.md)
- [13 · Measuring performance honestly](learning/13-measuring-performance-honestly.md)
- [36 · Slow tests, busy machines, and timings you can trust](learning/36-slow-tests-and-busy-machines.md)
- [44 · Making it scale, without changing what it does](learning/44-making-it-scale-without-changing-it.md)
- [45 · Continuous integration](learning/45-continuous-integration.md)
- [46 · Drawing only what shows (virtualised lists)](learning/46-drawing-only-what-shows.md)
- [48 · A catalogue of parts (Storybook)](learning/48-a-catalogue-of-parts.md)
- [49 · Listening to the app (keyboard cursors and a screen-reader script)](learning/49-listening-to-the-app.md)
- [50 · Writing for visitors (README, contribution guide, licence)](learning/50-writing-for-visitors.md)
- [51 · Rehearsing the demo with a robot](learning/51-rehearsing-the-demo.md)
- [52 · Reviewing against the whole brief](learning/52-reviewing-against-the-brief.md)
- [53 · What a screen reader is given](learning/53-what-a-screen-reader-is-given.md)
- [54 · Telling people what needs them](learning/54-telling-people-what-needs-them.md)
- [55 · Nobody answered: escalation](learning/55-nobody-answered.md)
- [56 · What came first](learning/56-what-came-first.md)
