# Learning note 26: PM programs and PM compliance

*This note goes with Phase 4 chunk 1. Open **Maintenance → PM programs** (`/maintenance/pm`). As **Maintenance Planner** you can also raise the work that's due.*

## 1. From "what should we do?" to "is it being done?"

In Phase 3, FMEA (note 23) recommended a **strategy** for each way a kind of equipment fails: replace it on a schedule, check it regularly, run it to failure, or fix the design. A recommendation does nothing on its own. A **PM program** is the recommendation turned into repeating, plannable work, and **PM compliance** measures whether that work actually happens.

## 2. Plans come from FMEA

Each plan covers one failure mode of one kind of equipment ([pm.ts](../../packages/mock-data/src/pm.ts)):

| FMEA strategy | Plan | How often |
|---|---|---|
| Time-based (wears out, β > 1) | **Planned replacement** of the parts that wear | The tidiest interval no longer than the mode's **B10 life**, the age by which 10 % would have failed. Replacing then prevents most failures without throwing away much useful life |
| Condition-based (can be seen coming) | **Condition check**: readings on a route | Every 30 days, or every 90 if a predictive model already watches the mode |
| Run to failure | *No plan* | Fixing it when it breaks is cheaper |
| Fix the design | *No plan* | A schedule can't fix a design or installation fault (note 23) |

The last two are listed on the page under "Failure modes with no PM", so a missing plan is a decision you can see, not an oversight.

**Running hours vs calendar.** A machine wears while it runs, not while it stands. Overhauls on rotating machines therefore count **running hours**: "every 26,500 running hours" comes round in about 3 years on a machine that runs all the time, and in about 12 on a peaker that runs 6 hours a day. Checks and static equipment use the calendar.

## 3. Compliance: "on time" needs a window

A PM is **due** on a date. Nobody does every job on exactly that day, so each PM has a **window**: a week either side, or a tenth of the interval if that's longer. A yearly overhaul has ±36 days.

| Outcome | Meaning |
|---|---|
| On time | Done within the window |
| Late | Done, but after the window |
| Missed | Never done, and the next one has already come due |
| Overdue | Past the window, not done, and no work order yet: **the list to act on** |

**PM compliance** = PMs done on time ÷ PMs due, over the last 90 days. The target here is 95 %. The Command Center's PM-compliance tile now shows this real figure; until this chunk it was a made-up number.

## 4. A trap the tests caught

The first version stopped counting a PM against compliance as soon as a work order was raised for it. Raising the work orders for 40 overdue PMs made compliance *jump*, before anyone had picked up a spanner.

That's the classic way a KPI gets "gamed" by accident: measuring the paperwork instead of the work. Now a PM past its window counts as not done on time until its work order is **closed out**, and then it counts as late. Raising work orders doesn't change compliance; doing the work does. A test closes one out and checks the numbers move the right way.

## 5. Where the history comes from

As with the failure history (note 21), the past year of PMs is **seeded**: each site has its own discipline (between about 72 % and 95 % on time), and each PM's outcome is fixed by a hash of its plan, asset and date. Everything is the same on every reload, but different between sites. On top of that, PM work raised and closed out in the app counts for real, the same way corrective work joins the failure history.

## 6. Design choices worth noticing

- **The page sends codes, the screen writes the words.** The server says `{ task: "planned_remedy", mode: "VIB" }` and the page writes "Planned replacement: Vibration" from `en.json`, so every word is in the text catalog.
- **Parts are named precisely where we know them.** The pump bearing plan uses 2 × "Ball bearing 6309-2RS", the same bearing the vibration tab's defect frequencies come from. The next chunk, inventory, will forecast demand for these parts.
- **Caching with an honest key.** An overview takes about 100 ms to work out, and the Command Center asks for it on every refresh. It's cached under a key that includes the hour and every PM work order's status, so the cache can never show stale results: when anything that matters changes, the key changes.
- **Generating is one button, and safe to press twice.** It raises work only where none exists yet; the second press creates nothing.

## 7. Exercises

1. Open the plan at the top of the list. Why is it there? (Look at its overdue count.)
2. Find a plan that counts running hours. How many days does it take on a machine that runs all the time? On one that runs a quarter of the day?
3. As Maintenance Planner, raise the work for a plan. What happened to its overdue count, and to its compliance? Why are they different?
4. Which failure modes have no plan? Pick one and explain from its FMEA row why that's the right call.
