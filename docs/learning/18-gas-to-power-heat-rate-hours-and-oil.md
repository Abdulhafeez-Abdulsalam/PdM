# Learning note 18: Gas-to-power — heat rate, operating hours and transformer oil

*This note goes with Phase 3 chunk 1. Switch role to **Plant Manager** and open **Operations** in the menu (it goes to `/operations/power`). Then open any gas turbine or transformer and pick its new **Performance** tab.*

## 1. The plant manager's questions

A power plant is paid to deliver what the grid operator asks for (**dispatch**), and its biggest cost is fuel. So the page answers, top to bottom:

| Question | Where on the page |
|---|---|
| Is each plant making what it was asked for? | Plant cards: output "of … asked for", output vs dispatch chart |
| Could it run when needed? | **Availability**: share of time the units could run (planned outages count against it) |
| How much did it actually make? | **Capacity factor**: energy made ÷ what full power all month would make |
| How well does it use its fuel? | **Heat rate** (plant and per turbine) |
| What's wearing it down? | Turbine efficiency vs baseline, inspection hours, transformer oil |

Availability and capacity factor are different on purpose: a peaking plant is available almost all the time but only asked to run in the evening, so its capacity factor is low (about 45% here) and that's fine.

## 2. Heat rate: fuel in per kWh out

**Heat rate** = fuel energy burned ÷ electricity made, in kJ/kWh. Lower is better. Since one kWh is 3,600 kJ, efficiency = 3,600 ÷ heat rate:

| | Heat rate | Efficiency |
|---|---|---|
| Gas turbine on its own (Sahel peaker) | ~9,750 kJ/kWh | ~37% |
| Combined-cycle plant (Coastal Bend) | ~7,600 kJ/kWh | ~47% |

Why is combined cycle better? The gas turbine's exhaust is still about 585 °C. A heat-recovery boiler turns that into steam for a **steam turbine**, which makes extra power from fuel already burned. The plant heat rate in [operations.ts](../../packages/mock-data/src/operations.ts) (`plantHeatRate`) divides the gas turbines' fuel by *all* the output, steam turbine included, and a test checks that combined cycle beats a gas turbine alone.

## 3. Why "ambient-corrected"? The baseline idea

A gas turbine is an air pump. Hot air is thin, so on a hot afternoon the same machine makes less power and burns more fuel per kWh. If you compared today's heat rate with a fixed number, every hot day would look like the machine was wearing out.

So each turbine is compared with its **baseline**: what a *clean* machine would show **at this hour's air temperature and load**. Real plants build that baseline by fitting months of clean data (or from the manufacturer's correction curves). In the simulation we know the true model, so `expectedValue()` in [signals.ts](../../packages/mock-data/src/signals.ts) is simply the model without noise and without faults. That's also why the simulation gained an air-temperature effect on gas turbine power (−5%) and heat rate (+1.2%) in this chunk: without it, there'd be nothing to correct for.

```
deviation (%) = (actual − baseline) ÷ baseline × 100
```

Deviations are averaged over an hour (6 readings): one reading is too noisy to judge efficiency by.

## 4. Fouling and water washes

Dust, salt and oil mist stick to the compressor blades. The compressor gets less efficient, the turbine burns more fuel for the same power, and output drops. The fix is a **water wash**: spraying cleaning fluid through the compressor (offline, so the unit is stopped). The page advises a wash at **+1.5% heat rate or −1 point compressor efficiency**; real plants pick their trigger from fuel price and lost output.

On the trend chart this looks like a slow climb, then a sudden drop back to zero at the wash. Three hand-placed conditions in [world.ts](../../packages/mock-data/src/world.ts) (`PLANT_SCENERY`) make sure there's always something to see:

- **EBC-GT-101** is fouling now (wash advised)
- **ANP-GT-102** was washed five days ago (the climb and the drop are on its chart)
- **ANP-TX-104** has a growing hot spot (see section 6)

The demo storyline (fouling on CBC-GT-101) plays the same story live.

## 5. Equivalent operating hours (EOH)

The hottest parts of a gas turbine (combustors, first turbine blades) wear out with time *and* with every start: heating up and cooling down stresses metal more than hours of steady running. So the counter is:

```
EOH = fired hours + 10 × starts        (a common simple form; OEM rules differ)
```

Every 24,000 EOH the turbine is opened for a **hot-gas-path inspection**; every second one is a **major overhaul**. The forecast date is just the hours left ÷ hours added per day. A base-load unit adds about 25 EOH a day, mostly hours. A daily-start peaker running 6 hours adds 16.5, of which 10 come from its one start. That's why peakers collect starts so fast (a test checks this). An inspection due within 90 days is flagged, because outages are planned months ahead.

## 6. Transformer oil: dissolved gas analysis (DGA)

Faults inside a transformer break down its oil and paper insulation into gases, which dissolve in the oil. A lab measures them in an oil sample (here monthly; three of the gases also have an online monitor, which are the H2, C2H2 and CO tags).

**How much gas → the condition.** IEEE C57.104 (2008) gives limits per gas. The worst single gas, or the total combustible gas, sets condition 1 (normal) to 4 (act now). Acetylene is strict: anything over 1 ppm is condition 2, because it needs arcing or a very hot spot to form.

**Which gases → the kind of fault: the Duval triangle.** Take only methane, ethylene and acetylene, turn them into percentages of their total, and plot the point in a triangle. Each zone is a fault type:

| Zone | Meaning |
|---|---|
| PD | partial discharge (tiny sparks in gas bubbles) |
| T1 / T2 / T3 | hot spot below 300 °C / 300–700 °C / above 700 °C |
| D1 / D2 | sparking / arcing |
| DT | heat and discharge mixed |

A developing hot spot makes more and more ethylene as it gets hotter, so ANP-TX-104's samples walk across the triangle from T1 towards T3. Its Performance tab joins the samples oldest to newest so you can see where it's heading.

Important: healthy oil always lands *somewhere*, usually T1 or T2. **The zone only matters once the condition says there's enough gas.**

## 7. Drawing the triangle so it can't disagree with the maths

The zone rules (`duvalZone`) and the zone outlines (`DUVAL_ZONE_SHAPES`) both live in [contracts/operations.ts](../../packages/contracts/src/operations.ts). A test checks a grid of over 2,000 points across the triangle: each point must sit inside exactly one drawn zone, and it must be the zone the rules give. If someone edits one and not the other, the test fails. This is a good habit whenever the same knowledge is written twice: **write a test that makes the two copies agree.**

The triangle's corners turn percentages into screen positions with simple weighted averages (`at()` in [DuvalTriangle.tsx](../../apps/web/src/features/operations/DuvalTriangle.tsx)): each gas pulls the point towards its own corner in proportion to its share.

## 8. A reusable line chart

[LineChart.tsx](../../apps/web/src/shared/widgets/LineChart.tsx) is new and shared: output vs dispatch here, and solar "power vs expected" in the next chunk. It follows the same rules as the earlier charts: one y-axis (so heat rate and compressor efficiency get **two** charts, not one chart with two scales), a legend plus labels at the line ends when there are two lines, dashed threshold lines, event markers, arrow-key tooltip and "Show as table".

## 9. Exercises

1. On the page, pick **Ebute Combined Cycle** and read EBC-GT-101's heat rate and baseline. Work out the deviation by hand and compare with the table.
2. In [operations.ts](../../packages/mock-data/src/operations.ts), change `EOH_PER_START` in the contracts to 20 (and run `npm run check`). Which turbines' inspection dates move most, and why?
3. Using the table under the Duval triangle in section 6, classify a sample with CH₄ 40 ppm, C₂H₄ 50 ppm, C₂H₂ 10 ppm. (Percentages first!) Check your answer with `duvalZone(40, 50, 10)` in a test.
4. Start the demo storyline at 3600× speed and watch CBC-GT-101's trend on its Performance tab. When does it cross the wash trigger, compared with when the alarm fires?
