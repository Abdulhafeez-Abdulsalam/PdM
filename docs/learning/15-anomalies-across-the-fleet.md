# Learning note 15: Anomalies across the fleet

*This note goes with the fleet anomaly view. Switch role to **Condition Monitoring Analyst** and open **Predictive & AI → Anomalies**.*

## 1. Anomaly vs prediction

They sound alike but answer different questions:

- An **anomaly score** says "this asset's sensors look *unusual* compared with its normal behaviour". It's a symptom, from 0 (normal) to 1 (very unusual).
- A **prediction** says "this will *fail*, roughly when, and here's what to do". It's a diagnosis.

In our system a prediction is raised when the anomaly score crosses its threshold (0.5). The analyst's job sits *before* that: spotting what looks odd before the model is sure.

## 2. Four groups, and the early warning

Every asset falls in exactly one group:

| Group | Rule |
|---|---|
| Anomalous | score ≥ 0.5 |
| Rising | below 0.5, but ≥ 0.3, or up by 0.1 in 24 hours |
| Normal | anything else |
| No data | offline: no sensors, no score |

**Rising** is the valuable one: these assets have no prediction yet, so this is the only place they show up. The rules live in the contracts (`ANOMALY_WATCH_LEVEL`, `ANOMALY_RISE_PER_DAY`), so the server and screen can't disagree about them.

## 3. Contribution analysis: which sensors?

"Pump 106 is unusual" isn't something you can act on; "bearing vibration (67%) and bearing temperature (33%)" is. Each row lists the sensors driving the score, with their share as both a number and a small bar, never the bar alone.

These shares come from **the same function** the predictions use (`faultContributions` in the mock). Before, that calculation lived inside the prediction code; moving it into its own function means the anomaly row and its prediction can't name different sensors. A test checks exactly that.

## 4. A test that found a real-world subtlety

The first version of that test said "every anomalous asset has a prediction", and it failed for CBC-PMP-109: score 0.509, no prediction. Not a bug. The score wobbles a little, and this asset's fault is just short of the detection point, so the wobble pushed it over an hour ago.

Real systems do the same thing: a model waits for an anomaly to *persist* before raising a prediction. So the screen says so honestly ("No prediction yet: the model waits to see if it lasts"), and the test's rule became "…or crossed less than a day ago".

When a test fails, ask first: *is the code wrong, or was my rule too simple?*

## 5. Small honesty details

- **"Since 30 days ago" was a lie.** It was just how far back the calculation looked. Long-running anomalies are now dated from when their fault reached the detection point.
- **"Showing the 200 most relevant of 1,837."** A list that quietly stops at 200 looks complete when it isn't. Say so, and point to the search box.
- **The trend line uses a fixed 0–1 scale**, with the threshold dashed. A line that rescales itself makes a flat 0.08 look as dramatic as a climb to 0.7.

## 6. Exercises

1. Sort by **Fastest rising first**. Pick a *rising* asset with no prediction, and open its asset page. Can you see the climb in its sensors?
2. Switch on **Normal** and search for `CBC-GT-101`. Then start the demo storyline (side menu → Simulation) at 600× speed, and watch CBC-GT-101 move from Normal to Rising to Anomalous. When does its prediction appear?
3. In `packages/contracts/src/anomalies.ts`, change `ANOMALY_WATCH_LEVEL` to `0.2`. How many assets are rising now? Why might a real team tune this number, and who should decide it? Undo it.
4. Why does the contribution bar always have a percentage next to it?
