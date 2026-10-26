# Learning note 32: Data sources, tags, and data quality

*This note goes with Phase 4 chunk 7. Choose the **Condition Analyst** role and open **Data & Integrations** (`/data`). Then switch **Chaos mode** on in the simulation panel and watch the page change.*

## 1. Where the data comes from

A predictive-maintenance platform doesn't measure anything itself. It reads other systems:

| Source | What it sends | How, typically |
|---|---|---|
| **Plant historian** | Sensor readings (tags), every few seconds | **OPC UA**, the industry standard for reading from control systems |
| **CMMS** (maintenance system) | Work orders, as they change | A web API |
| **LIMS** (laboratory) | Oil and gas samples (e.g. transformer oil, note 18) | A daily file |
| **ERP** | Parts, stock and purchasing | A web API, hourly |
| **Weather service** | Forecasts, for solar and ambient temperature | A web API, hourly |

In this demo the sources are simulated, but their numbers come from the plant's own data: the historian's count is the readings that really arrived. When **chaos mode** is on, the historian shows as **degraded** with the reason.

## 2. Tags

A **tag** is one measured signal, named `<asset>.<signal>`, e.g. `CBC-GT-101.EXH_TEMP` (the exhaust temperature of gas turbine 101 at Coastal Bend). The tag browser lists all 9,938, each with its **limits** (alert, alarm, trip), its latest reading in your units, and its quality.

## 3. Data quality: four problems

Every prediction is only as good as the readings under it. The page looks at the last 24 hours in **5-minute windows**: the historian should have at least one reading per tag in each, 288 a day.

| Issue | What it means | Usually caused by |
|---|---|---|
| **No data** | Nothing in 24 hours | The asset is offline, or its link to the plant is down |
| **Flatline** | Exactly the same value for hours | A stuck sensor or transmitter. The most dangerous: a frozen reading **looks healthy** |
| **Bad quality** | The control system itself flags the reading as unreliable | A failing sensor, wiring fault, out-of-range signal |
| **Gaps** | Some windows have no reading | Network drop-outs, an overloaded historian |

**Completeness** is the share of expected readings that arrived.

**Why a 1 % threshold?** The first version flagged a tag for a single bad reading. After three hours of chaos mode, 93 % of all tags were "problems". That's useless: the odd dropped reading happens on every real plant. A tag is now flagged for gaps or bad quality when at least 1 % of its windows are affected (about 3 of 288). Choosing a threshold is a judgement: too low and the list is noise people learn to ignore; too high and real problems hide.

## 4. One rule, used twice

The simulation decides, for each tag and 5-minute window in chaos mode, whether the reading goes missing (about 3 %) or comes through flagged bad (about 4 %). Those decisions used to sit inside the function that makes a reading. They're now two small shared functions, `chaosGap` and `chaosBad` ([signals.ts](../../packages/mock-data/src/signals.ts)), called both by the readings and by the quality scan ([data.ts](../../packages/mock-data/src/data.ts)). The two can't drift apart, and a test checks one tag's scan against its actual readings, window by window.

It also makes the scan fast: outside chaos periods a tag either works or it doesn't (offline, stuck), so only the chaos windows need checking one by one. All 9,938 tags take about a tenth of a second.

## 5. Found in passing

The menu hides modules a role can't use, but a built page doesn't check the role itself: typing `/data` as an Executive opens it. In a real system the **server** must refuse the data anyway (the screen is only a convenience), but the page should say "no access" too. That's for chunk 8 (Administration), where roles and access live.

## 6. Exercises

1. How complete is the data now? Which site is least complete, and why? (Hint: look for an offline asset.)
2. Open the flatlined tags. Pick one and open its asset's Telemetry tab. What does the line look like?
3. Switch chaos mode on and wait a minute of simulated time. What happens to the historian's status, the completeness and the "gaps or bad quality" count?
4. Search for `CBC-GT-101.EXH_TEMP`, then switch units (top right) between SI and imperial. What happens to the limits?
