# Learning note 56: What came first

_This note goes with Phase 7 chunk 4. On Alarms & Events, look for a **first out** label, then tick **Hide follow-on alarms**._

## 1. One cause, many alarms

When something goes wrong on a machine, one problem sets off another: a bearing heats up, then vibration rises, then flow drops. Each sensor alarms in turn, and by the time the operator looks, there's a pile. The natural instinct is to start at the most recent or the loudest, which is often a consequence and not the cause.

**First-out** is an old idea from plant control panels: of the alarms in a burst, mark the one that came first. It's the best clue to what started it.

## 2. What counts as a burst

Here, alarms on one asset within 10 minutes of each other are one burst. Each new alarm either joins the asset's current burst or starts a new one. The earliest is the first out, and the others record which alarm they followed. One detail: alarms can arrive slightly out of order, so the code picks the earliest by time and not by arrival, and re-marks the whole burst each time.

## 3. Saying only what you know

"First" doesn't always mean "cause". Two unrelated things can happen within ten minutes, and a slow sensor can report late. So the app says "first out", not "root cause". A label that claims more than the data supports costs trust the first time it's wrong.

## 4. A filter that doesn't hide anything dangerous

**Hide follow-on alarms** could be risky: what if a follow-on is the serious one? So it hides only from that view. They still count in the alarm bar, still escalate, and still appear in the list with the box unticked.

## 5. A simulation that behaves

The feature was useless until the simulation produced real bursts, so the plant now has occasional cascades. They use the same repeatable hashes as everything else, so a restart gives the same cascades.

## 6. Exercises

1. Find a first-out alarm and the alarms that followed it. Do they make sense together?
2. Press the timeline view and find a first-out alarm in the lanes. What do its details say?
3. Change `BURST_MINUTES` to 2. What changes in the alarm list?
4. Why does the code re-mark every member of a burst, when only the first alarm seems to change?
