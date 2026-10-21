# Learning note 16: Alarm performance and ISA-18.2

*This note goes with the alarm performance page. Switch role to **Control Room Operator**, open **Alarms & Events**, and choose **Performance**.*

## 1. Why measure the alarm system itself?

An alarm is meant to say "a person must act now". When a control room gets hundreds of alarms an hour, operators stop reading them, and the one that matters gets lost. This has caused real accidents: at the 1994 Milford Haven refinery explosion, operators faced alarms every few seconds in the final minutes.

**ISA-18.2** is the industry standard for managing alarms. It gives targets you can measure:

| Measure | Target | What it tells you |
|---|---|---|
| Alarms per 10 minutes, per control room | about 1 (2 at most) | Is the load humanly manageable? |
| Time in flood (over 10 alarms in 10 min) | under 1 % | How often are operators swamped? |
| Share from the top 10 alarms | 5 % or less | Is the noise from a few fixable sources? |
| Chattering alarms | none | Alarms that keep going off and clearing |
| Standing alarms (over 24 h) | 5 or fewer | Alarms everyone has learned to ignore |
| Priority mix | ~80 % low, 15 % medium, 5 % high, ~1 % urgent | Do urgent alarms still stand out? |

The targets live in the contracts (`ISA_TARGETS`), so the server and the screen judge "good" by the same numbers.

## 2. History needs to be recorded on purpose

The alarm *list* answers "what's wrong now?" and forgets cleared alarms after a week. Analytics need something else: **every time an alarm sounded**. That's a different record, so the alarm engine now keeps an **activation log**, one line per sounding.

A chattering alarm that sounds 300 times is *one* alarm in the list but 300 lines in the log. ISA-18.2 counts every sounding, because every one interrupts the operator.

**Lesson:** decide what questions you'll ask before deciding what to store. The list and the log hold the same events, but they're shaped for different questions.

## 3. A bug in old code, found by new code

The first numbers looked odd: about 900 alarms a day for the earlier days, but only 203 in the last 24 hours. The cause was an old shortcut. When the simulation starts, it replays the first day in one go and only lets alarms clear at the end, so a chattering alarm looked "still active" all day and never sounded again.

The fix: the log follows the real rule ("sounds again once it has cleared, 2 minutes after its last trigger") on its own, whatever the alarm list is doing. Now every day has about 1,100 alarms. A test checks that no day differs from the average by more than 25 %.

## 4. Draw the chart to a spec

This page has the app's first column chart, built to the project's data-visualisation rules:

- **One series, so no legend.** The heading already says what's plotted.
- Columns at most 24 px wide, with a 2 px gap and **rounded tops but square feet** on the baseline.
- Hairline gridlines at clean numbers (0, 5, 10, 15).
- The theme's series colour for the columns; **text in text colours, never the data colour**.
- Hover *or* arrow keys show a tooltip, and **Show as table** gives the same numbers as a table, so nothing depends on seeing the chart.

## 5. Two test-environment lessons

- **A contrast "failure" that wasn't one.** axe flagged a button's text in the dark themes. The button animates its colour when the theme changes, and the scan ran mid-animation. With animations switched off, it was clean. Before fixing a finding, check that it's really there.
- **Timeouts under load.** A simulation test that takes 0.5 s alone took 5.8 s when every package's tests ran at once, just over Vitest's 5-second default. Its limit is now 20 s, with a comment saying why.

## 6. Exercises

1. Which control room is "Overloaded"? Open **Top 10 alarms** and find the alarm causing most of it. What would you do about a chattering alarm in real life? (Hint: deadband, delay timers, or fixing the instrument.)
2. Switch **Last 7 days** on, then **Show as table**. Find the busiest hour.
3. Turn on **Chaos mode** in the simulation panel at 600× speed, wait a minute, and reload this page. What happened to **Time in flood**?
4. Read `ISA_TARGETS` in `packages/contracts/src/alarms.ts`. Why might a plant set *stricter* targets than the standard? Who should own that decision?
