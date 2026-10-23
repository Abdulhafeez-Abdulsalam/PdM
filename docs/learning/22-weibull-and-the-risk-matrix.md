# Learning note 22: Weibull analysis and the risk matrix

*This note goes with Phase 3 chunk 5. As **Reliability Engineer**, open Reliability and use the new tabs: **Weibull analysis** and **Risk matrix**.*

## 1. The question Weibull answers

"Our pumps fail by vibration about every 1,000 days." Fine, but *how* does the risk change as a pump runs? Is a just-repaired pump safest, or most at risk? The answer decides the maintenance strategy:

| β (beta) | Pattern | Example | What to do |
|---|---|---|---|
| below 1 | **Infant mortality**: risk is highest early | electronics, poor installation | fix installation and quality; scheduled replacement *makes it worse* |
| about 1 | **Random**: age doesn't matter | control faults, instrument glitches | watch condition; scheduled replacement doesn't help |
| above 1 | **Wear-out**: risk grows with age | bearings, seals, fouling | replace or overhaul on a schedule (near B10), or monitor condition |

The other number, **η** (eta, the characteristic life), sets the time scale: by η, 63.2% of items have failed, whatever β is.

## 2. Fitting needs the survivors too

To fit, collect every **time between failures** of one mode across a fleet. But many items haven't failed again yet: a pump repaired 300 days ago and still running tells us its life is *at least* 300 days. These are **suspensions** (or "censored" data). Leaving them out is a classic mistake. You'd only count the short lives, and the fleet would look far less reliable than it is. A test shows this: the fit without suspensions comes out at least 15% short ([weibull.test.ts](../../packages/mock-data/src/weibull.test.ts)).

**Maximum likelihood** handles both naturally. For each candidate (β, η) it asks how probable the observed data would be: failures at exactly those times, survivors lasting at least those times. Then it picks the (β, η) that makes the data most probable. In [weibull.ts](../../packages/mock-data/src/weibull.ts), `fitWeibull` uses one shortcut: for any β, the best η has a formula, so only β needs searching, and a simple bisection finds it.

## 3. How sure are we? The 90% bounds

The likelihood is a hill with the best (β, η) at the top. A **sharp** peak means the data pins the answer down; a **flat** one means many values fit almost as well. The curvature at the top (a matrix of second derivatives, the *Hessian*) turns into standard errors, and ±1.645 standard errors gives 90% bounds. More failures make a sharper peak and narrower bounds. Try a type with few failures (gas turbines) against one with many (PV strings).

The reliability curve's band comes from the same uncertainty, carried through the curve's formula (the *delta method*).

## 4. Testing a fit: use a known answer

How do you know a statistics routine is right? **Feed it data where you know the answer.** The tests generate 800 Weibull lives with β = 0.7, 1 and 2.5, cut some short at random "inspection" times, and check the fit lands within 10%. Then they fit the five-year history from chunk 4, which was *generated* from known lives, and check it comes back close.

It comes back close, but β is often a little **low** (pump vibration: 1.77 against a true 2.2). That isn't a bug. Real fleets aren't uniform: each pump's life varies ±20%, and a few bad actors fail three times as fast. A **mixture** of wear-out populations looks less wear-out-like than any one of them. Real reliability engineers meet exactly this. It's why the probability plot exists.

## 5. Reading Weibull paper

The probability plot uses special axes: time on a log scale, and the share failed on a "Weibull scale" (ln(−ln(1 − F))). On this paper a Weibull distribution is a **straight line** with slope β. So:

- dots hugging the line: one Weibull describes the data well
- a bend, or two slopes: probably two failure causes mixed together, or a mixed population. Split the data (by site, by model) and fit again

Each dot's height is a **median rank**: the best estimate of the share failed by that time, adjusted for suspensions (Johnson's method with Bernard's approximation, `medianRanks`).

## 6. B10 and MTTF

- **B10**: the age by which 10% have failed. A natural replacement or inspection interval for wear-out items: "replace at B10" accepts that about 1 in 10 fails first.
- **MTTF**, the mean time to failure, η × Γ(1 + 1/β). The Γ function (gamma) generalises the factorial; Γ(5) = 4! = 24 is one of the tests.

## 7. The risk matrix

Risk has two parts: **how likely** something is to go wrong, and **how bad** it would be. The matrix crosses them:

- **Likelihood (1–5)**: the chance of failing within a year. From the asset's own five-year failure rate λ, it's 1 − e^(−λ). If an open prediction says more, the prediction wins (its chance within its horizon is first turned into a chance within a year).
- **Consequence (1–5)**: the asset's **criticality**, already on every asset.
- **Risk = likelihood × consequence**: 1–4 low, 5–9 medium, 10–14 high, 15+ extreme.

Work starts at the **top right**. Cells use status colours (green → red) because risk *is* a status, so each cell also says its level in words; colour is never the only cue.

One accessibility detail: each cell is a button whose visible text is "20 Medium". At first it had a separate spoken label starting "20 Medium:…", but the visible text was really "20Medium" (no space), so the spoken name didn't match what a voice-control user would say. The fix: no separate label, a real space, and hidden text for the coordinates.

## 8. Exercises

1. On Weibull analysis, compare **Inverter → Breakdown** with **Pump → Vibration**. What does each β tell a maintenance planner?
2. Find a type and mode with few failures. How wide are its 90% bounds compared with PV strings?
3. In [weibull.test.ts](../../packages/mock-data/src/weibull.test.ts), change the sample size from 800 to 50. Do the "known answer" tests still pass? What does that say about small fleets?
4. On the risk matrix, pick the top-right cell. How many of its assets are there because of an open prediction rather than their history?
