# Learning note 29: Emissions accounting, and where maintenance meets ESG

*This note goes with Phase 4 chunk 4. Choose the **ESG Lead** role: it now lands on **Energy & ESG** (`/esg`).*

## 1. Where the numbers come from

A company reports its greenhouse-gas emissions in **tonnes of CO₂-equivalent (CO₂e)**. For a plant's own operations ("Scope 1"), there are three sources here, each worked out from measurements the simulation already makes ([esg.ts](../../packages/mock-data/src/esg.ts)):

| Source | How | Factor |
|---|---|---|
| **Combustion** | Fuel gas burned, from turbine and heater fuel meters. Engines have no meter, so their fuel comes from output ÷ efficiency (42 %) | 1.98 kg CO₂ per Sm³ of natural gas |
| **Flaring** | A pilot and purge (0.5 % of the gas the site separates), plus the gas that compressors that are down would have moved | 98 % burns to CO₂; 2 % escapes unburned as methane |
| **Methane** | Compressor seals (while running), pipelines (by their leak index), gas-driven valves and wellheads at oil & gas sites | × 29.8 |

**Why × 29.8?** Methane traps far more heat than CO₂ while it lasts. Its **global warming potential (GWP)** over 100 years is 29.8 for fossil methane (IPCC's sixth assessment). A tonne of leaked methane counts as almost 30 tonnes of CO₂. That's why small leaks matter: at the midstream site (Gulf Coast), methane is *all* of the footprint.

"Sm³" is a *standard* cubic metre: gas measured at a fixed temperature and pressure, so volumes can be compared.

## 2. Intensity: emissions per thing produced

Absolute emissions rise and fall with output. **Intensity** divides by what was produced:

- **Power plants: t CO₂e per MWh.** The gas-fired plants here come out at about 0.40–0.45 t/MWh. Combined-cycle plants are at the low end, because their steam turbine makes extra power from the same fuel.
- **Oil & gas: kg CO₂e per barrel of oil equivalent (boe).** One boe is a barrel of oil, or the gas with the same energy (about 170 Sm³).

## 3. Targets, and "on course for"

Each site has this year's target. The page projects where the current rate would end the year (last 90 days × 365 ÷ 90) and says whether that's on track or over. It's a simple projection; real reporting would use the year to date plus a forecast.

## 4. Avoided, and avoidable

Two different ideas that are easy to mix up:

- **Avoided:** solar output × the grid's emission factor (0.37–0.55 t/MWh by region). Emissions the *grid* didn't make because the solar parks produced instead. A credit, not part of the company's own footprint.
- **Avoidable:** emissions caused by **poor equipment condition**:
  - a **fouled turbine** needs more fuel for each MWh: its heat rate above its clean, ambient-corrected value (note 18) is extra fuel burned;
  - a **corroding pipeline** leaks more methane;
  - **flaring while compressors were down**: gas that would have been moved went up the flare instead.

The second is where this whole project meets ESG: predictive maintenance doesn't only prevent failures; washing that compressor or fixing that pipeline cuts emissions too. The "Biggest emitters" table shows each asset's health next to what it adds.

## 5. Getting the details right

The first version claimed a peaker turbine's emissions were *100 %* avoidable. It compared a midday reading with the "clean" heat rate at midday, but the peaker is off at midday, so its clean heat rate was zero. Healthy turbines also showed a few hundred tonnes "avoidable" from sensor noise piling up. The fix compares sample by sample, only while fuel is burning, and ignores anything under 1 % (noise, not fouling). Tests now check that avoidable emissions appear only on turbines that actually had fouling.

## 6. Design choices worth noticing

- **Past days never change.** Each asset's day is worked out once and kept, and the whole overview is kept per scope per day; only equipment health is refreshed. The first view takes under a second, later ones a millisecond.
- **Units come from the text catalog** ("t CO₂e"), like every other word on screen.
- **The ESG Lead's home page** became `/esg` automatically, as the information architecture planned.

## 7. Exercises

1. Which site emits most, and what's its intensity? Why would a combined-cycle plant beat a peaker?
2. Scope to Gulf Coast Midstream. What share is methane, and why?
3. Find the fouled turbine in "Biggest emitters". How much is avoidable, and what would remove it? (Look at its Performance tab.)
4. Scope to a solar park. What does it emit directly, and what does it avoid?
