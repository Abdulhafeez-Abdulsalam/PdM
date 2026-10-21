# Learning note 14: Scheduling, and the schedule board

*This note goes with the maintenance calendar and schedule board. Switch role to **Maintenance Planner**, open **Maintenance**, and try **Calendar** and **Schedule board**.*

## 1. Two questions, two views

- **"What's happening this month?"** → the **calendar**. Work appears on the day it starts. It's good for spotting busy weeks, and no good for spotting busy *people*.
- **"Is anyone overloaded?"** → the **schedule board**, a kind of Gantt chart. People are the rows and days are the columns, and each job is a bar as long as it takes.

The spec asks for "calendar and Gantt views" in one breath, but each answers a different question.

## 2. A bar needs a length

A work order used to have a start time but no duration, and you can't draw a bar without one. So the contract gained `estimatedHours`. Planned data has to exist in the data model before the screen can show it: the screen is the last step, not the first.

## 3. The arithmetic lives on its own

[schedule.ts](../../apps/web/src/features/maintenance/schedule.ts) has no React in it. It works out:

- how many days a job covers (8 working hours a day: 20 h → 8 + 8 + 4)
- where its bar sits on the board, clipped at the edges
- which lane it goes in, so overlapping jobs stack instead of drawing over each other
- hours booked per person per day, and the days over 8 hours: the **conflicts**

Because it's plain functions, [schedule.test.ts](../../apps/web/src/features/maintenance/schedule.test.ts) can test every rule in milliseconds, without rendering a page. Keep logic like this out of components when you can.

## 4. A business rule in the backend: approval

Rescheduling *approved* work sends it back to "scheduled". The plant manager approved a particular time and person, not whatever comes next. The rule lives in the backend (`reschedule` in the mock), so it holds however the change is made: by dragging, through the dialog, or someday from another system. The screen just explains it: "It was approved for the old time, so it needs approving again."

## 5. Accessibility, again: name what you see

axe flagged every bar: what a screen reader announced didn't match what was on screen. Three attempts:

1. **Reorder `aria-label`** to start with the visible text. That fixed most bars, but not those whose status tag had been cut short with "…".
2. **Hide the status tag and say it at the end.** That failed for wide bars, because axe still counts hidden text that's visible on screen.
3. **Drop `aria-label` altogether.** The link's name comes from its own text, plus a screen-reader-only phrase for what the bar shows only by its position: ", Wed 21 Oct, 3 h". Zero problems.

The general lesson: **prefer real text over `aria-label`**. An `aria-label` is a second copy of the name, and copies drift apart from the original.

## 6. A safety net for missing text

A slip in a text edit put the new words in the wrong place in `en.json`, and the page showed raw keys like `schedule.title`. No test noticed, because i18next quietly shows the key when it can't find the text. Now [the test setup](../../apps/web/src/test/setup.ts) fails any test that renders a missing key and names it. That's criterion G ("no hard-coded strings") enforced, not just intended.

## 7. Exercises

1. As **Maintenance Planner**, open the schedule board and find someone overbooked. Drag one of their jobs to a free day. What happened to the conflict banner?
2. Open an *approved* job's **Reschedule…** dialog. What does it warn you about? Reschedule it, then switch to **Plant Manager** and find it on the Kanban board.
3. Switch the board to **2 weeks**. Why did we make **Week** the default? (Hint: how wide is a day column on your screen?)
4. In `schedule.ts`, `WORKDAY_HOURS` comes from the contracts. Change it to 10 in `packages/contracts/src/work-orders.ts` and run the tests. Which ones fail, and does that make sense? Undo it.
