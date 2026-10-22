# Learning note 17: Comparing sister assets, and the last asset tabs

*This note goes with fleet comparison and the Documents, Related and Comments tabs. Switch role to **Reliability Engineer**, open **Assets → Compare**, and open any asset's new tabs.*

## 1. Why compare sister assets?

A pump vibrating at 6 mm/s: good or bad? On its own, hard to say. But if its 110 identical sisters all read about 2.8 mm/s, it's clearly worth a look. Comparing like with like is one of the most powerful tricks in condition monitoring, and it needs no model at all.

## 2. Finding outliers without being fooled by them

The obvious approach, "more than 3 standard deviations from the average", has a flaw: the outliers themselves drag the average and the spread toward them, so they hide.

The **modified z-score** (Iglewicz & Hoaglin) uses the **median** (the middle value) and the **MAD** (median absolute deviation, the middle distance from the median). Neither moves much when a few values are extreme:

```
score = 0.6745 × (value − median) / MAD          outlier if |score| > 3.5
```

Try it on `1, 2, 4, 5, 6, 7, 25`: median 5, MAD 2, so 25 scores 6.7 (an outlier) and 7 scores 0.67 (not). That exact example is a unit test in [comparison.test.ts](../../packages/mock-data/src/comparison.test.ts).

## 3. A comparison is only as good as what you compare

The first version flagged 15 pumps as "unusually low vibration… better than the fleet". They weren't better; they were **switched off** (standby or maintenance). A stopped pump reads about zero vibration.

So sensor measures now compare **running equipment only**, and the table says "Not running (Standby)" instead of a misleading number. Afterwards, only the 2 genuinely faulty pumps stood out.

Lesson: before you trust a statistic, ask whether the things you're comparing are really comparable.

## 4. A chart for 3 assets or 768

Classes range from 3 fired heaters to 768 PV strings. One bar per asset doesn't work for 768, so the page uses a **ranked dot plot**: assets sorted worst to best along the bottom, each dot at its value, a line for the median. The shape shows the spread at a glance; outliers are bigger and labelled.

When two outlier labels landed on top of each other, the dataviz rule applied: don't stack colliding labels. Skip the extra one, because the tooltip and the table still have it.

## 5. The asset tabs

- **Documents**: records from a document management system (manual, datasheet, P&ID, procedure, certificates for pressure equipment, maker's bulletins). The demo has records but no files, and says so.
- **Related**: what this asset is part of, its parts, its neighbours in the same area, and its **sisters**, with a link straight into the comparison with this asset highlighted.
- **Comments**: a discussion per asset. Mentions use the plain **@Full Name** text, with a picker to insert it; the server works out who's mentioned. A half-written comment survives a dropped connection or reload, reusing the field screens' draft helper (now moved to `shared/drafts.ts`, since two features use it).

## 6. Story consistency matters in demo data

The first seeded comments said "readings creeping up" on the demo gas turbine, which was healthy (97) until the storyline starts. Demo data that contradicts itself makes people distrust everything else on the screen. The discussion now goes only on assets with a real developing fault, and a test checks the healthy turbine has none.

## 7. Two tools that disagreed

The documents table scrolls sideways on narrow screens and contains no links, so keyboard users could never reach it to scroll. axe flagged this. The fix (make the scroll area focusable) then upset an ESLint rule that says only interactive elements should be focusable. Both are guidelines; the user need decides. The focusable, named region stays, with a comment explaining the exception.

## 8. Slow tests are information

Two Kanban tests started timing out. Timing each step showed:

| Step | Before | After |
|---|---|---|
| Find the "Triage" menu item | 1,145 ms | 13–31 ms |
| Click it | 2,207 ms | ~1,050 ms |

The time was mostly in the *test's own lookups*. "Find by role" works out the role of all 3,600 elements on the board, and each click first checks every parent element for `pointer-events: none`. On big pages, find things by their text and skip that check. Along the way the board cards were also memoised, so they no longer all re-render when the clock ticks: a real improvement for users.

## 9. Exercises

1. Compare **Inverters** on **Anomaly score**, then on an inverter temperature sensor. Do the same inverters stand out? Why might they not?
2. Open a faulty pump's **Related** tab and click **Compare with all of them**. Find the highlighted pump on the chart.
3. Post a comment mentioning someone, then switch role to that person and open the same comments. What's different?
4. Work out the modified z-score of 10 in `8, 9, 9, 10, 10, 11, 30` by hand. Is 30 an outlier?
