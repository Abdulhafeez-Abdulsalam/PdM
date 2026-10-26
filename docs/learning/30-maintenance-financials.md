# Learning note 30: Maintenance financials, and the value of a prediction

*This note goes with Phase 4 chunk 5. Choose the **Executive** role and open **Financials** (`/financials`).*

## 1. The question finance asks

"We pay for sensors, software and analysts. What do we get back?" A maintenance team that can't answer in money tends to lose its budget. This page answers it for the last 12 calendar months, and **shows how every figure was worked out**, so a finance team can check the sums themselves ([financials.ts](../../packages/mock-data/src/financials.ts)).

## 2. Value from a prediction

For each **finished predictive job** (a work order raised from a prediction and closed out):

| Part | How |
|---|---|
| **Failure prevented** | What that failure would have cost: the repair plus the lost production. The same figure the prediction showed when it was raised |
| **Labour** | Hours on the close-out × $95 an hour |
| **Parts** | The parts that kind of failure needs, at stores prices (the inventory catalogue from chunk 2) |
| **Value** | Failure prevented − labour − parts |

**False alarms count against you.** If the technician's close-out verdict was "false positive" (they found nothing wrong), the job prevented nothing: it shows as cost only. That keeps the figure honest: a model that raises lots of alarms can't look good just by being busy.

A real finance team would argue about "failure prevented": would it really have failed, and that badly? That's why the page shows the working rather than one big number.

## 3. Money at risk

The same idea looking forward: each **open** prediction's probability × what its failure would cost. A 70 % chance of a $2M failure is $1.4M at risk. Added up, this is the case for acting on predictions now.

## 4. The cost of downtime

The failure history's hours of lost production × what an hour costs in that business:

- **Oil & gas: $18,000 an hour** (lost barrels and gas sales);
- **Gas-to-power: $12,000 an hour** (lost electricity sales and capacity payments);
- **Solar: $900 an hour** (one inverter's output).

That's why an hour at a refinery matters far more than an hour at a solar park, and why the table is sorted by cost, not hours.

## 5. Spend against budget

Three kinds of maintenance work, each priced as labour + parts:

- **Corrective**: repairs after failures (from the failure history);
- **Preventive**: PM jobs done (from the PM programs in chunk 1);
- **Predictive**: the jobs in section 2.

The **planned work** share is preventive + predictive as a share of spend. The "kind of work" table shows why it matters: an average repair costs about ten times an average PM job. Industry rules of thumb aim for 80 % or more of work being planned.

The **budget** is a figure set at the start of the year for each kind of work, spread evenly over the months; the chart's line shows it against what was spent.

## 6. One number, one place

The Command Center's **"Value delivered"** tile used to be a rough estimate (24 to 120 hours avoided per job, counted forever, false alarms included). An executive could have seen two different "value" figures on two screens. Now the tile asks the Financials code for its number, so both always agree. It's a general rule: **work a figure out in one place, and have every screen ask that place.**

## 7. Getting the details right

- **Calendar months.** The first version took "the last 365 days" but drew 12 calendar-month columns. Spend from 10–31 October last year was counted in the total but sat in no column, so the columns didn't add up to the total. A test that checked the sum caught it; the period now starts on the first day of the oldest month.
- **One cache per backend.** The first cache was shared by everything in the program. Two tests each made their own backend, did the same number of jobs, and got each other's results. Every other module already kept one cache per simulated world; this one now does too.

## 8. Exercises

1. Which predictive job delivered the most value? Open it: what did the technician find?
2. How many false alarms were there, and what did they cost?
3. Scope to a solar park, then to a refinery. Compare the cost of downtime. Why so different?
4. On the Command Center, check that "Value delivered" matches "Failures prevented" in this page's first tile.
