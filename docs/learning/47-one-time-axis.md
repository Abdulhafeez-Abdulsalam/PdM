# Learning note 47: One time axis (the synchronised event timeline)

_This note goes with Phase 6 chunk 3. Open an asset (try PBU-PMP-106), pick **Last 30 days** at the top, go to the **Telemetry** tab, and scroll to "Events on the same time axis"._

## 1. Why put events under the charts

An engineer looking at a vibration chart asks "what happened just before it went up?" Before this chunk the answer was on another page: the alarms were on the alarms page, the work orders on the maintenance page. Now the events sit right under the sensor charts, on **the same time axis**: a dot directly below a jump in the line happened at the same moment. Seeing cause and effect together is what the spec means by "a single synchronized canvas".

## 2. Lanes

Each kind of event gets its own row, or **lane**: alarms, operator actions, maintenance, process events, predictions. Lanes keep different kinds from piling on top of each other, and the dot's colour says how serious it was (the same health colours used everywhere else). The lanes are a new chart type, `EventLanesChart`, in the `@pdm/charts` package, next to the line chart.

## 3. Making several charts move together

"Zoom one and the others follow" needed three things to line up:

- **The same range.** Each chart used to fit its axis to its own data, so two charts could start at different times. Now they're all given the same start and end (`xRange`).
- **The same left margin.** A chart's plot starts after its labels, and labels differ in width ("4.5" against "Operator actions"). A fixed margin (`gridLeft`, 112 px) makes every plot start at the same pixel, so the axes line up exactly.
- **One group.** ECharts' `connect` repeats every zoom or pan made in one chart on all the others in its group. It works in percent of the axis ("show 40 % to 60 %"), which is why the ranges have to match.

Then two bugs showed up while testing in the browser, and both are fixed:

- When new data arrived, a chart redrew and **forgot its zoom**, but only that chart, so the group went out of step. Each chart now remembers its zoom and keeps it when it redraws (`useKeepZoom` in `zoom.ts`).
- A sensor **ticked while zoomed in** started fully zoomed out. A chart joining a group now starts at the group's zoom.

## 4. Keyboard and screen readers

A canvas is one picture: it has no buttons inside it to tab to. So the whole chart is one keyboard stop, and it handles the keys itself: ← → step from event to event, + − zoom, Shift+← → pan, and 0 shows everything. Its role is `application`, which tells a screen reader to pass the arrow keys through instead of using them to read. What you pick is described in a box below the chart, which the screen reader announces. On the alarms page the full list is still there, and it now keeps to the part of the time in view.

## 5. Testing it

Most of this happens in a canvas, which tests can't read. So the browser test checks what a person would see: it zooms a **sensor chart** with Ctrl + the mouse wheel, then checks that the heading under the **lanes** now says "Events, and the charts above, from … to …". That heading only changes if the zoom crossed from one chart to the other. To prove the test can fail, it was run once with the charts disconnected, and it failed.

## 6. Exercises

1. On the Telemetry tab, tick a third sensor, then zoom in with Ctrl + scroll. Tick a fourth. Does the new chart start zoomed?
2. Focus the lanes (click them or press Tab), press → a few times, and read the box below. Where does its link take you for an alarm? And for a work order?
3. On **Alarms & Events → Timeline**, press + twice with the lanes focused. What happens to the heading above the list, and to the list?
4. Why must every chart in the group have the same `xRange`? What would you see if one chart's range were a day longer?
