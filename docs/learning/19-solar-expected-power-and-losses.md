# Learning note 19: Solar — expected power, performance ratio and where the energy goes

*This note goes with Phase 3 chunk 2. Switch role to **Plant Manager**, open **Operations** and pick the **Solar** tab (`/operations/solar`). Then pick an inverter tile, a lagging string or a battery for its Asset 360 **Performance** tab.*

## 1. The solar question: "how much are we losing, and where?"

A solar plant can't choose how much to make: the sun decides. So "we made 75 MW" says nothing on its own. Was it a cloudy day, or is something broken? Every solar screen compares what was made with what the **sunlight should have given**. The gap is what the plant manager can do something about.

## 2. A PV model in four lines

[signals.ts](../../packages/mock-data/src/signals.ts) (`pvBreakdown`) turns sunlight into AC power, the same way real "expected power" models do, just simpler:

```
sunlight     = DC rating × (sunlight on the panels ÷ 1000 W/m²)
after heat   = sunlight × (1 − 0.4 % for every °C the panels are above 25 °C)
after dust   = after heat × (1 − soiling)
AC           = min(inverter rating, after dust × 98.2 % inverter efficiency)
```

Things worth knowing:

- **Panels hate heat.** In full sun they run about 30 °C hotter than the air, so in a 30 °C desert they're near 60 °C and lose about 14%. That's why "hot panels" is the biggest loss on every plant.
- **The array is bigger than the inverter** (here 1.3×, the *DC/AC ratio*). That's deliberate: it makes more energy in mornings, evenings and cloudy hours, at the cost of **clipping** the top off clear, cool noons. Pecos (cooler) clips more than the desert plants.
- **Dust** builds up a little each day (0.1–0.3% a day here) and drops to almost nothing when the panels are washed or it rains: a saw-tooth.

Before this chunk, inverter power was just "sunlight × rating". Now the inverter tags *are* this model, plus noise and faults, so the page's numbers and the telemetry charts agree.

## 3. Performance ratio (PR)

```
PR = energy delivered ÷ (panel rating × sunlight that fell on the panels ÷ 1000 W/m²)
```

PR takes the weather out: a cloudy week lowers both the top and the bottom of the fraction. So you can compare a plant with itself last month, or Pecos with Sahra. Typical values are 75–85%; ours land between 80% and 88%. The standard behind it is IEC 61724.

## 4. The loss waterfall

The waterfall breaks the week's energy into steps: the sunlight × panel rating at the top, each loss taking its slice, and what was delivered at the bottom. The steps add up **exactly** (a test checks it), because each one is computed from the same model:

| Step | Comes from | Can the plant fix it? |
|---|---|---|
| Hot panels | the temperature factor | Not really (it's physics) |
| Dust | soiling | Yes: wash the panels |
| Inverter conversion | the 98.2% efficiency | No |
| Clipping | the inverter limit | No (a design choice) |
| Inverters down or derated | trips, maintenance, faults like failing cooling | Yes |
| Weak strings | strings with faults | Yes |
| Other | whatever the model doesn't explain | Investigate if it's big |

A real plant's "other" is never zero (wiring, mismatch, shading, meter error). Ours is under 0.1% because the model *is* the plant. If "other" ever grows large in a real system, the model is missing something.

**A bug the numbers caught:** the first version showed a Pecos inverter "making" 3.5 MW at night. It was a *stuck sensor*: the simulation sometimes freezes a tag at one value with "uncertain" quality. Energy accounting now skips readings that aren't good quality. Lesson: **always check data quality before adding things up.**

## 5. Comparing like with like, again

Two comparisons find problems without any model at all, the same idea as fleet comparison in note 17:

- **Inverters** against their own expected power, shown as a heat map. One hue, stronger as the shortfall grows (a *sequential* scale: it means "how much", not a status colour). The number is in every tile, so colour is never the only cue.
- **Strings** against their **sisters**: the other strings on the same inverter see the same sun at the same temperature. A string making 83% of its sisters' median has a problem of its own (often a failed bypass diode). The median, not the average, so one bad string doesn't drag the yardstick down.

## 6. When to wash: a small optimisation

Dust costs a little more each day; a wash costs the same each time. If dust adds a loss of *r* per day, and a day's revenue is *R*, then over a cycle of *T* days you lose about *R × r × T² ÷ 2*. Add the wash cost *C*, divide by *T* for the cost per day, and find the *T* where that's smallest:

```
best interval T* = √(2 × C ÷ (R × r))
```

Sahra (fast desert dust, cheap robot washing) should wash about every month; Pecos (slow dust, expensive water) about every 100 days, so rain usually does it first. The card says "wash now", "within N days" or "not yet", from how long it's been since the last wash.

## 7. Batteries in one paragraph

A battery (BESS) beside a solar plant charges at midday and sells in the evening peak. Three numbers matter: **charge** (state of charge, %), **health** (capacity left compared with new; batteries fade with use and heat), and the **spread between cell voltages**: healthy cells stay within a few millivolts of each other, and a growing spread means cells are drifting apart (PCS-BESS-102, a hand-placed condition this chunk).

## 8. What else changed

- `/operations` now has **Gas-to-power | Solar** tabs (`OperationsNav`).
- Asset 360's Performance tab now covers inverters, strings and batteries.
- Three hand-placed conditions at Pecos (`PLANT_SCENERY` in [world.ts](../../packages/mock-data/src/world.ts)): an inverter with failing cooling (PCS-INV-117), a weak string (PCS-STR-150), and the drifting battery.
- The week's waterfall samples every 2 hours and is kept for 3 simulated hours, because a week × 40 inverters is a lot of maths for one request.

## 9. Exercises

1. On the Solar page, compare the waterfalls of **Pecos** and **Wadi Shams**. Which loss explains most of the difference in their performance ratios?
2. In [signals.ts](../../packages/mock-data/src/signals.ts), change `DC_AC_RATIO` to 1.1 and run `npm run check`. What happens to clipping? Which test notices? Undo it.
3. Work out the best wash interval for a 100 MWp plant making 500 MWh a day at $30/MWh, with dust adding 0.2% a day and washes costing $500 per MWp. (Answer: about 58 days.)
4. Open PCS-STR-150's Performance tab. Why compare it with its sisters' **median** rather than with the inverter's expected power?
