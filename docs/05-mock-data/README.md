# Step 5 — Mock Data Engine

## In plain words first

The **mock data engine** is a fake backend. It invents a whole energy company — sites, equipment, sensors, people — and simulates it running: sensors change through the day, equipment slowly wears out, alarms go off, people raise work orders.

It answers all 24 requests in the [data contracts](../04-data-contracts/README.md), so the app can't tell it apart from a real backend. In the app it runs in a **Web Worker** (a background thread), so all this simulation never slows the screen down.

Code: [`packages/mock-data/src/`](../../packages/mock-data/src/)

See it for yourself:

```bash
npm run inspect -w @pdm/mock-data
```

prints a tour: counts, top risks, KPIs, a day of turbine and solar data, and the AI briefing.

## 1. What it generates

| Thing | Amount | Notes |
|---|---|---|
| Regions | 3 | North America, Middle East, West Africa |
| Sites | 12 | 4 oil & gas, 4 gas-to-power, 4 solar — invented names, plausible locations |
| Assets | **1,870** | 26 equipment classes, from gas turbines to PV strings |
| Tags (sensors) | **9,938** | 2–18 per asset with realistic values, units and alert/alarm/trip limits |
| People | 44 | 4 per role |
| Developing faults at start | ~59 | 13 degradation patterns |
| Work orders | ~370 | 6 months of history + predictive work in the plan |
| Alarms | ~100 live | plus history, shelved, suppressed, chattering |

> **Spec difference:** the spec suggested ~2,000 assets and ~50,000 tags. Assets match. Tags are ~10,000 because we only modelled sensors that tell a story; 50,000 would mean ~25 tags per PV string, which adds load without adding meaning. The number is a setting, not a limit.

## 2. How a sensor value is made

Every value is calculated from **(seed, tag, time)** — nothing is stored. That's why a chart of last month and a live reading now always agree, and why the same seed always gives the same data.

```
value = idle ↔ running blend        how much the machine is running (stopped at night? starting up?)
      + load effect                 power follows demand / the sun
      + ambient effect              hotter afternoons, seasons
      + noise + slow drift          real sensors are never perfectly still
      + fault effect                degradation, growing as progress²
```

| Site profile | Behaviour |
|---|---|
| Baseload (oil & gas) | Runs flat out, small load swings |
| Dispatch (combined cycle) | Higher by day, lower at night |
| Peaker | Starts ~06:00 or ~16:00, stops at 22:00, with 30-minute ramps |
| Solar | Follows the sun and passing clouds; zero at night; batteries charge by day, discharge in the evening |

## 3. Faults: one story, told consistently

A fault has a start time and a would-fail time. Its **progress** runs 0 → 1. Everything else is derived from that single number, so every screen agrees:

| Progress | What you see |
|---|---|
| 0.0–0.3 | Small drift on charts; health starts slipping |
| **0.3** | **Model detects it → prediction** (before any alarm — that's the point of predictive maintenance) |
| ~0.55–0.65 | Tag crosses its **alert** limit → P3 alarm |
| ~0.75 | Crosses **alarm** limit → P2 alarm |
| ~0.98 | Crosses **trip** limit → P1 alarm |
| 1.0 | Asset trips |
| repaired | Values return to normal, alarms return to normal, prediction closes |

13 fault types: compressor fouling, bearing wear, surge margin erosion, heat-exchanger fouling, inverter cooling/derating, PV string underperformance, transformer gassing (DGA), wall loss, ESP motor overheating, valve stiction, fired-heater tube overheating, BESS cell imbalance, generator stator insulation.

## 4. Alarms

- **From faults** — exact crossing times are calculated, so alarms appear at the right moment.
- **Background noise** — ~170 nuisance alarms per day across the company, most low priority, clearing on their own.
- **Chattering bad actors** — 3 tags that keep re-alarming (watch their `occurrenceCount`).
- **Standing, shelved and suppressed** alarms — for realistic alarm-management screens.
- **ISA-18.2 lifecycle** — acknowledge, shelve (reason + ≤ 24 h), un-shelve, return to normal.

## 5. Demo controls

| Control | What it does |
|---|---|
| **Speed** 1× / 60× / 600× / 3600× | 3600× = one simulated hour per real second |
| **Chaos** on/off | Data gaps, bad-quality spikes, alarm floods — to test the UI's resilience |
| **Role** | Which of the 11 roles `me.get` returns |
| **Start storyline** | Plays the scripted demo (below) |

### The storyline: GT compressor fouling on `CBC-GT-101`

| Simulated day | Phase | What happens |
|---|---|---|
| 0.0 | started | Fouling begins, invisible at first |
| 0.9 | anomaly detected | Efficiency drifts measurably |
| 1.8 | prediction raised | Model predicts failure in ~4 days |
| 3.6 | alarm raised | Compressor efficiency crosses its alert limit (P3), then P2 at day 4.6 |
| 4.2 | work order created | Water wash planned — or uses yours if you raised one |
| 5.0 | repaired | Offline water wash; values recover |
| 6.0 | verified | Prediction closed as a true positive |

At 3600× the whole week plays in under 3 minutes.

## 6. Files

| File | Role |
|---|---|
| `random.ts` | Seeded random numbers (never `Math.random()`) |
| `clock.ts` | Simulated time with adjustable speed |
| `catalog/` | Sites, asset classes, sensor templates, fault types, people |
| `world.ts` | Builds the company from the catalog |
| `signals.ts` | Sensor values and aggregated history |
| `faults.ts` | Fault progress and limit-crossing maths |
| `snapshot.ts` | Health, status, RUL, predictions, risk at one moment |
| `alarms.ts` | Alarm engine |
| `work-orders.ts`, `kpis.ts`, `briefing.ts`, `events.ts` | The rest of the API data |
| `storyline.ts` | The scripted demo |
| `backend.ts` | Answers the 24 endpoints, validates input **and output** against the contracts |
| `live.ts` | Live subscriptions (≤ 300 tags, once per second, only changed values) |
| `worker.ts` | Web Worker wrapper |
| `backend.test.ts` | 16 tests, including the full storyline |
| `inspect.test.ts` | The printed tour |

## 7. Known simplifications

| Simplification | Why it's acceptable |
|---|---|
| Daylight saving time ignored | Sites use fixed UTC offsets; only affects local-hour patterns by 1 h |
| History min/max uses ≤ 6 samples per interval | Approximate band; real historians compute exact min/max |
| Alarms come from fault maths, not raw values | Avoids false alarms during start-ups (real plants suppress those too) |
| KPIs like MTBF/MTTR/OEE are seeded, not computed | They need years of history the simulation doesn't have |
| Asset "offline" keeps the last operating status | The contract has no "unknown" status |
