# Learning note 34: Models, rules, and "what if we wait?"

*This note goes with Phase 4 chunk 9. Choose the **Reliability Engineer** role and open **Predictive & AI**: there are three new tabs, **Models**, **Rules** and **What if**.*

## 1. Two kinds of early warning

- A **model** learns what "about to fail" looks like from many signals at once and past failures. It's subtle and can see trouble weeks ahead, but it's harder to explain.
- A **rule** is one line a person writes: "bearing vibration above 4.5 mm/s for 10 minutes → P2 alert". Easy to understand and trust, but it only knows what you told it.

Real plants use both: models for early, subtle warnings, rules for clear limits everyone agrees on.

## 2. The model registry

There's one model per kind of equipment (pump, gas turbine, inverter…). For each, the registry shows:

| Measure | Question it answers |
|---|---|
| **Precision** | Of the failures it predicted, how many really happened? Low precision means false alarms. |
| **Recall** | Of the failures that happened, how many did it predict in time? Low recall means missed failures. |
| **Warning** | How many days' notice it typically gives. |

**Backtest** scores come from running a version on past data before release. **Live** results come from the feedback loop: the technician's verdict at close-out (note 9). Live results are the real test, but they come slowly. This demo has only a handful of verdicts per model, so the page says "too few verdicts to judge" under 5 rather than show a misleading 100 %.

**Approving a new version is a judgement.** About half the models have a retrained candidate (2.5.0). Retrained isn't always better: some candidates gain recall but lose precision (more warnings, more of them false). The page shows each difference in words, "better" or "worse", so you can weigh it. Approve and new predictions carry the new version number; the old version is kept as "retired", so you can see the history. Only reliability engineers, analysts and the admin can decide.

## 3. The rule builder

A rule is: **equipment** · **signal** · **above/below** · **threshold** · **for at least N minutes** · **priority**.

**Why "for at least N minutes"?** One noisy reading shouldn't raise an alert. Requiring the condition to last filters out spikes. It's the same idea as an alarm's on-delay (note 16).

**Test before you save.** The builder checks the rule against the last 24 hours of real readings, every 5 minutes, and tells you how often it would have fired and on how many assets. If a new rule would have fired 300 times yesterday, it's not a warning, it's noise, and operators will learn to ignore it. The **Save** button stays off until you've tested the exact rule you're saving; change anything and it needs a new test.

In this demo, rules are tested on recorded readings but don't raise live alarms.

## 4. What if we wait?

Every prediction gives a **remaining life**: a 10 % chance of failing by day p10, 50 % by p50, 90 % by p90. The what-if turns that into a curve:

1. **Fit a log-normal.** Lives are skewed: most fail around the middle, a few last much longer. A log-normal is the usual shape for that. Its median is p50, and its spread comes from how far apart p10 and p90 are.
2. **Allow for time already passed.** If the estimate was made 5 days ago and it hasn't failed yet, what matters is the chance of failing in the *next* N days, *given* it survived so far.
3. **Weigh the costs.** Repair now costs the planned repair. Wait N days and there's a chance P the failure comes first:

   expected cost = P × failure cost + (1 − P) × repair cost

   The **extra** cost of waiting is P × (failure cost − repair cost).

Example: a $150K planned repair against a $2.6M failure. At an 84 % chance of failing first, waiting is expected to cost about $2.1M more (0.84 × $2.45M). Even a 5 % chance would cost $122K more, nearly the price of the repair itself. That's why predictive maintenance acts early on expensive equipment.

This is an **expected** cost: an average over many such decisions. On any one machine, either it fails or it doesn't.

## 5. Exercises

1. Find a candidate model that's better on recall but worse on precision. Would you approve it? What would operators notice?
2. Build a rule for pump bearing vibration above 3 mm/s for 5 minutes. How often would it have fired? Now try 60 minutes. Why the difference?
3. In What if, pick the top prediction and slide the delay. At how many days does the extra expected cost pass the cost of the repair itself?
4. Approve a candidate, then open one of that model's predictions. Which version does it show?
