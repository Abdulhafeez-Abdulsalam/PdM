# Learning note 25: The 2D digital twin

*This note goes with Phase 3 chunk 8. Open **Digital Twin** in the menu, or the new **Twin** tab on any asset in Asset 360. Good places to start: Gulf Coast Midstream → Compressor Station 3, Pipeline Section A, and Pecos Solar Farm → Block B.*

## 1. What a "digital twin" means here

A digital twin is a live model of the plant that mirrors the real one. Ours answers three questions (spec §6.8):

- **Where is it?** Each asset drawn in its area, the way the area works.
- **What's around it?** Its neighbours upstream and downstream, all with their health.
- **What happened when?** A time slider replays any hour of the last three days.

We decided early on to keep it **2D** (scope decision 11). A 3D model needs a large 3D library and 3D drawings of plants we don't have. Most of what operators need is in the 2D views.

## 2. Three kinds of drawing for three kinds of area

The server looks at what's in an area and picks the drawing ([twin.ts](../../packages/mock-data/src/twin.ts)):

| Area contains | Drawing | Why it's laid out that way |
|---|---|---|
| Solar strings | Inverters, each with the strings that feed it | A string's problem shows against its sister strings on the same inverter |
| Pipeline segments | A route by distance (km), then a table | Pipelines are managed by location along the line ("km 30–37") |
| Anything else | A flow from left to right | Supply → drive → process → power → electrical |

The process flow is **generated** from each kind of equipment's place in the process (`STAGE_OF` in [contracts/twin.ts](../../packages/contracts/src/twin.ts)): a pump *drives*, a heat exchanger *processes*, a transformer is on the *electrical* side. That makes it a schematic, not a P&ID (piping and instrumentation diagram). A real plant would draw those by hand, pipe by pipe. Ours shows the order things happen in. Valves and relief valves protect the whole area, so they sit in a strip underneath.

## 3. One moment, worked out from the same models

For the moment you pick, the server works out each asset's:

- **health and status**, from its faults at that moment (the same function the live screens use);
- **values**: its headline sensor (the first for its kind of equipment), plus extras where they matter: wall thickness and corrosion rate on a pipeline, performance index on a solar string;
- **limits**: how far its worst sensor is past its alert, alarm or trip limits.

That last one copies a rule from the alarm system: **limits only count while a machine runs**. A stopped engine's oil pressure is zero *because it's stopped*, and a flood of "low oil pressure" warnings would bury the real problems. A machine its fault has actually tripped is shown as tripped.

Because everything comes from the same models, replaying 14:00 yesterday shows what the operators saw at 14:00 yesterday.

## 4. The replay

- The **slider** goes back 72 hours, an hour at a time. Arrow keys move it; a screen reader announces the moment shown ("24 hours ago (23 Oct, 11:00 UTC)").
- **Play** steps forward an hour every 1.2 seconds until now. **Back to now** returns to live.
- The **strip** under the slider has one cell per hour, coloured by the worst level anything in the area reached: alert, alarm or trip. It's a map of where to look. At Pecos, the cells light up during the day and go grey at night, when the inverters stop.
- The moment shown is part of the URL (`h=24` means 24 hours ago), so you can send someone a link to the exact hour.

## 5. Design choices worth noticing

- **Colour is never the only signal.** Every card has a coloured border *and* the health word with its icon. Anything past a limit has a warning icon *and* says which sensor and how far ("Past alert: Bearing vibration velocity 5.85 mm/s"). The strip's colours are explained in words underneath.
- **Every asset is a link** to its Asset 360. On the Twin tab, the asset is outlined and marked `aria-current`, so screen readers announce it as the current item.
- **One component, two places.** The full twin page and the Asset 360 tab both use `TwinView`; the tab just passes the asset to highlight.
- **Asking for "hours ago", not a timestamp.** The page doesn't know the simulation's exact clock, but the server does. So the page asks for "24 hours ago" and the server works out when that was.

## 6. Exercises

1. Open Gulf Coast Midstream → Compressor Station 3. Which asset is past a limit, and which sensor is it?
2. Open Pecos Solar Farm → Block B and drag the slider to around midday yesterday. Which strings are behind their sister strings?
3. On Pipeline Section A, find the segment with the thinnest wall. Open its Asset 360 and look at its Twin tab: how is it marked?
4. Pick an area at the Sahel Peaker Plant and press Play. What happens to the engines over the day, and why don't they show warnings when they stop?
