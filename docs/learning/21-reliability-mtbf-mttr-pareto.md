# Learning note 21: Reliability — MTBF, MTTR, Pareto and bad actors

*This note goes with Phase 3 chunk 4. Switch role to **Reliability Engineer**: Reliability is now your home page (`/reliability`). Every asset also has a new **Failures** tab in Asset 360.*

## 1. Where the numbers come from

Reliability starts with **failure records**: every time something broke, a technician closed the work order with ISO 14224 codes (note 10). The code says what was observed (the *mode*, e.g. VIB vibration), why (the *cause*, e.g. 2.4 wear) and what was done (the *remedy*, e.g. replace). Coded records can be counted and compared across sites; free text can't.

The simulation now holds **five years** of these records for all 1,870 assets ([reliability.ts](../../packages/mock-data/src/reliability.ts)), as a maintenance system would. Corrective work orders you close out in the app are added on top, so your own close-outs show up in the numbers.

## 2. The four numbers everyone uses

| Number | Formula | Better is |
|---|---|---|
| **Failures** | count in the period | fewer |
| **MTBF**, mean time between failures | operating hours ÷ failures | higher |
| **MTTR**, mean time to repair | average hands-on repair hours | lower |
| **Availability** | time in service ÷ calendar time | higher |

Three subtleties:

- **MTBF uses operating hours**, not calendar hours: time spent broken doesn't count as "time between failures".
- **MTTR is the hands-on repair only.** The record also has *downtime*: repair plus waiting for people, parts and permits. Downtime is usually much longer, and it's what availability loses. The gap is often the cheapest thing to fix (better spares, faster permits).
- **For a group, MTBF pools everything:** 111 pumps × 1 year ÷ 104 failures ≈ 390 days. That doesn't mean each pump lasts 390 days. It's the fleet's average gap between failures, per pump. That's why the class table also shows **failures per asset per year**, which compares big and small fleets fairly.

A test in [reliability.test.ts](../../packages/mock-data/src/reliability.test.ts) recomputes MTBF and availability from their definitions and checks the page agrees.

## 3. Pareto: fix the few that matter

Vilfredo Pareto noticed that 80% of Italy's land belonged to 20% of the people. In maintenance the same shape turns up: **a few failure modes cause most of the failures**. The Pareto chart sorts modes from biggest to smallest, with a running total. Where the running total crosses 80%, everything to its left is where effort pays most.

Our chart shows each bar as a % of the total, so the bars and the running total share **one axis** (0–100%). Many Pareto charts use two y-axes (counts on the left, % on the right), and the dataviz rules forbid that because it invites false comparisons.

Ranking by **downtime** instead of count often changes the order: a breakdown that happens rarely but takes days to fix can matter more than a frequent five-minute reset.

## 4. Bad actors and repeat failures

A **bad actor** is an asset failing far more often than its sisters. Here, at least 3× its type's average rate, with at least 3 failures in the period (so one unlucky failure isn't enough). It's the same "compare with the sisters" idea as fleet comparison (note 17), now on failure history. A handful of bad actors often causes a big share of the work, and each deserves a **root-cause analysis** (chunk 6).

A **repeat failure** is the same mode on the same asset within 90 days. It usually means the first repair treated the symptom, not the cause.

## 5. How the history is generated (and why it's set up for next chunk)

Each failure mode of each class has its own **Weibull life**, two numbers:

- **η (eta)**, the "characteristic life": about 63% of items have failed by then
- **β (beta)**, the shape:
  - **β < 1:** infant mortality. Failures come early after a repair (electronics, poor installation).
  - **β ≈ 1:** random. Failures don't depend on age (control faults, instrument glitches).
  - **β > 1:** wear-out. The longer it runs, the likelier it fails (bearings, seals, fouling).

After each repair the clock for that mode restarts, so the time between failures of one mode follows that Weibull distribution exactly. Chunk 5 will do the reverse: take the history, *fit* β and η, and see whether we get back the numbers we put in. That makes a good test, because we know the right answer.

About one asset in 30 is a hand-picked bad actor whose η is cut to 30%, so it fails about three times as often. The bad-actor table finds them without being told which they are.

## 6. Things worth noticing in the code

- **The history is generated once per world and cached** (`seededHistory`). Five years for 1,870 assets is about 3,700 records, generated in about 0.1 s on the first request.
- **Each asset gets its own random stream** (`Rng.for(asset.seed, "failures")`). Changing one class's table doesn't reshuffle every other asset's history, so tests stay stable.
- **The month chart's first and last columns are part-months.** A 12-month window from the 23rd to the 23rd cuts two months in half. The page says so under the chart.
- **A new shared `ColumnChart`** draws both the monthly chart and the Pareto, and solar or alarms can reuse it.

## 7. Exercises

1. Pick **Last 5 years** and **Pump**. Which failure mode tops the Pareto by count? Switch to **Downtime**: does the order change? Why might it?
2. Open a bad actor's **Failures** tab. Compare its MTBF with its type's. Are its failures mostly one mode?
3. Close out a corrective work order in the app (Field → a job → complete it with ISO codes). Then find it on the asset's Failures tab: what does the record link to?
4. In [reliability.ts](../../packages/mock-data/src/reliability.ts), find the ESP's failure modes. Why is its MTTR (about 60 h) so much higher than a surface pump's?
