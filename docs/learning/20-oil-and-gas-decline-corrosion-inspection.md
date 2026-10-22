# Learning note 20: Oil & gas — decline curves, corrosion and inspection codes

*This note goes with Phase 3 chunk 3. Open **Operations → Oil & gas** (`/operations/oil-gas`). The three cards at the top are the three parts of the industry and switch the page between them.*

## 1. Three businesses in one

| Part | What it does | The question | Our sites |
|---|---|---|---|
| **Upstream** | gets oil and gas out of the ground | Are wells making what the reservoir allows? | Permian Basin, Delta Offshore |
| **Midstream** | moves it (pipelines, compressor stations) | Is the steel still thick enough? Is gas moving? | Gulf Coast Midstream |
| **Downstream** | processes it (refineries) | What's fouling, and what's due for inspection? | Ras Kharma Refinery (+ facilities) |

The tab is in the URL (`?part=midstream`), so a link opens the right view.

## 2. Upstream: decline curves

A reservoir is a sponge of rock under pressure. As oil comes out, the pressure drops, and each well makes a little less every month. The classic way to describe it is **Arps' decline curve**. The simplest form is exponential:

```
q(t) = qᵢ · e^(−D·t)        q = rate, qᵢ = starting rate, D = decline rate
```

Taking the logarithm turns it into a straight line, `ln q = ln qᵢ − D·t`, so an ordinary straight-line fit (least squares) on `ln q` finds qᵢ and D. That's `fitExponential` in [oil-gas.ts](../../packages/mock-data/src/oil-gas.ts), and a test checks it recovers a known curve exactly. **r²** says how well the line fits (1 = perfectly).

The page reports the *effective* decline, `1 − e^(−D)`: "the field makes about 25% less a year from now". Then the curve is extended 180 days as a forecast. That's how production is planned and reserves are estimated.

**Days below the curve are oil lost to something else.** Each well's rate in the simulation is `rate at start × decline × pump state` (`wellFactor` in [signals.ts](../../packages/mock-data/src/signals.ts)). When a well's pump fails, the well is *shut in* (makes nothing) until the pump is pulled and replaced (a *workover*). The **lost oil** column is what the well would make with a healthy pump, minus what it makes.

## 3. ESPs: reading a pump you can't see

An **electric submersible pump** sits a kilometre or more down the well. You can't look at it, so you read its sensors. The page checks them in order, and the first that applies wins:

| Reading | Means |
|---|---|
| Motor temperature high | Insulation cooking: not enough fluid flowing past to cool it, or a failing motor |
| Intake pressure low | "Pumping off": drawing the well down faster than it refills, or gas getting in |
| Motor current high | Working harder: wear, sand, heavier fluid |

"High" and "low" mean past the sensor's *alert limit*, the same limits the alarms use, so the diagnosis and the alarms never disagree.

## 4. Midstream: will the pipe hold?

Steel corrodes. The questions are how thick the wall is now, how thick it needs to be, and how fast it's thinning.

- **How thick it needs to be:** Barlow's formula, `t = P·D ÷ (2·S·F)`. For our 610 mm pipe at 72 bar, made of steel with a 448 MPa yield strength and a 0.72 safety (design) factor, that's 6.8 mm. It's `barlowThicknessMm` in the contracts, with the arithmetic in a test.
- **How fast:** two rates, and you use **the worse one** (as API 570 asks):
  - *long-term*: metal lost since it was new ÷ its age (steady, but slow to notice change)
  - *short-term*: today's corrosion probe (quick to react, but noisy)
- **Remaining life** = (wall now − wall required) ÷ rate.

**Cathodic protection** keeps buried steel from corroding by holding it at a small negative voltage against the soil. The usual criterion is at least −0.85 V.

**Compressors** push the gas along. Below-design efficiency wastes fuel. A small **surge margin** is dangerous: at surge the gas flow reverses violently through the machine.

## 5. Downstream: fouling and the inspection codes

**Exchanger fouling:** deposits on the tubes insulate them, so less heat gets through and the furnace downstream burns more fuel. *Effectiveness* compares the heat transferred with a clean exchanger. A straight-line fit over the last 30 days gives the trend, and from that, the days until it reaches the cleaning point (85%). It's the same "fit a line, extend it" idea as the decline curve, at a different scale.

**Inspection codes** say how often steel that holds pressure or product must be looked at:

| Code | Equipment | Interval |
|---|---|---|
| API 510 | pressure vessels | at most 10 years, or half the remaining life |
| API 653 | storage tanks | at most 20 years, or half the remaining life |
| API 576 | relief valves | bench test every 3 years (dirty service) or 5, sooner if leaking |
| In-line inspection | pipelines | at most 7 years, or half the remaining life |

"Half the remaining life" is the clever part: steel that corrodes fast gets inspected more often, automatically. The schedule shows what's overdue or due within 90 days first. Tick "Show all" to see every item.

## 6. Two design choices worth noticing

- **Surveyed vs live values.** Wall thickness comes from inspections and effectiveness from a heat balance, so the page uses the *model plus fault effects without sensor noise* (`survey()`). A live sensor reading would jitter. Pump diagnostics, on the other hand, use live readings, because that's what an operator watches.
- **The seed matters.** The app runs seed 20261010 and the tests run seed 42, so the randomly placed corrosion lands on different segments in each. The hand-placed conditions (`PLANT_SCENERY`: a failed ESP, a hot ESP, a compressor near surge) appear in both, because they're placed by asset name.

## 7. Exercises

1. In the Upstream view, find the well whose pump failed. Open its Performance tab: where does its own production leave the decline curve?
2. Work out the remaining life of a pipe with 10.0 mm of wall, a 6.8 mm minimum, a long-term rate of 0.06 mm/yr and a probe reading of 0.15 mm/yr. (Answer: 21 years, because the probe rate is worse.) Which inspection interval does API 570-style "half life" give it?
3. In [oil-gas.ts](../../packages/mock-data/src/oil-gas.ts), why does `fitExponential` skip days with zero production? What would `Math.log(0)` do to the fit?
4. Switch units to **Oilfield** (settings) and look at the oil rate. What unit does it use, and where does the conversion happen?
