# Learning note 59: Things that happen by themselves

_This note goes with Phase 8 chunk 3. Go to **Reports → Scheduled**, schedule a report for every day, set **Speed** to 3600× and watch the bell._

## 1. A schedule is just a next time

It sounds as if a schedule needs a clock ticking somewhere. All it needs is one field: `nextRunAt`. Each tick asks "has that time passed?". If so, it notes a run and moves `nextRunAt` on by a day, a week or 30 days.

## 2. Why it's a loop

The check is a `while`, not an `if`. If the server was stopped for three days, or the simulation jumps forward, a daily report owes three runs. A `while` catches up; an `if` would quietly lose two.

## 3. Moving on from the due time, not from now

The next run is `nextRunAt + interval`, not `now + interval`. Suppose a tick lands a few minutes late. Counting from "now" would make every run slightly later than the one before, drifting forever. Counting from the due time keeps it exact, and it means a restart that replays the day gets exactly the same runs.

Resuming a paused schedule is the one case that counts from now: nobody wants a burst of everything that was missed while it was paused.

## 4. Whose is it?

A schedule belongs to one person, and the backend checks that on every change, not just the page. Asking to delete someone else's schedule answers "not found", not "forbidden": there's no need to tell anyone what exists.

## 5. What it doesn't do yet

The bell links to the report, which shows the figures **as they are when opened**. That was a deliberate choice for now. A real archive would freeze the figures at each run, which needs the backend to build the reports itself.

## 6. Exercises

1. Change the `while` in `report-schedules.ts` to an `if`. Which test notices, if any? What real problem would it cause?
2. Pause a schedule, wait a simulated day, and resume it. When is the next run, and why?
3. Why does the bell keep report notifications for seven days only?
4. What would you need to change to schedule a report from the builder?
