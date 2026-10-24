# Learning note 28: Safety-critical equipment, permits, incidents and management of change

*This note goes with Phase 4 chunk 3. Choose the **HSE Officer** role: it now lands on **HSE & Compliance**. The module has four pages: Overview, Permits to work, Incidents, Management of change.*

## 1. Process safety is not the same as personal safety

Slips, trips and cuts are **personal safety**. **Process safety** is about the rare, big events: a fire, an explosion, a toxic release. They start when a hazardous fluid gets out of its pipes and vessels (a **loss of primary containment**) or when a protective system fails when it's needed. A plant can have an excellent personal-safety record and still be heading for a disaster. That's why this module looks at equipment, work and changes, not just injuries.

## 2. Safety-critical elements

A **safety-critical element (SCE)** is equipment whose failure could cause a major accident, or fail to stop one: relief valves, pressure vessels, pipelines, tanks, separators, fired heaters, and here anything of criticality 5.

The overview shows which SCEs are **impaired**, with the reason ([hse.ts](../../packages/mock-data/src/hse.ts)):

| Reason | Comes from |
|---|---|
| Poor health | Health warning or critical (the same model as everywhere else) |
| PM overdue | The PM programs (note 26): a safety-critical item past its maintenance window is a real risk |
| P1 alarm | An active top-priority alarm |

The predictive maintenance work we've built is exactly what keeps this list short.

## 3. Permits to work

Hazardous work (opening a line, entering a vessel, isolating electrics, welding) needs a **permit to work**: a written agreement that the hazards are known and controlled before anyone starts. Its type sets the precautions:

| Permit | When | Example |
|---|---|---|
| Cold work (mechanical isolation) | Most mechanical work | Changing a pump seal |
| Hot work | Flames or sparks | Welding on a pipeline |
| Electrical isolation | Electrical equipment | Transformer, switchgear, inverter |
| Confined space entry | Inside vessels and tanks | Inspecting a separator |

How it works here:

1. When hazardous work is **scheduled**, a permit is **requested** automatically.
2. The **HSE officer issues** it.
3. Work **can't start** without an issued permit. The server refuses ("Permit PTW-00012 for WO-10391 hasn't been issued yet"), just as it refuses to start without the safety checklist.
4. Closing out the work **closes** the permit; cancelling the work cancels it.

Inspections and calibrations are hands-off and need no permit.

This changed four earlier tests: they started work on jobs they had just created, and now they have to issue the permit first, as a supervisor would. A rule that matters belongs in the server *and* in the tests.

## 4. Incidents and the safety pyramid

| Kind | Here it comes from |
|---|---|
| **Process safety event**, tier 1 or 2 | A process-fluid leak in the failure history: a loss of containment. Tier 1 is the more serious (API RP 754 sets the thresholds by amount and consequence); here only the most critical equipment can have one |
| **Environmental release** | An oil leak from a transformer |
| **Equipment damage** | A breakdown of critical equipment |
| **Near miss** | Reported by people: anyone can report one |

The demo shows the classic **safety pyramid**: for every serious event, many more minor ones and near misses. A site reporting lots of near misses usually has a *healthy* safety culture: people notice warnings and say so. A site reporting none is often just not looking.

## 5. Management of change

Many major accidents (Flixborough in 1974 is the textbook case) started with a change nobody reviewed properly. **Management of change (MoC)** makes every change (a new setpoint, different equipment, a revised procedure, a temporary bypass) go through:

**proposed → under review → approved → implemented**, or **rejected** with a reason.

Who may do what follows the roles: anyone can propose, the HSE officer and plant manager review and approve, and the planner marks it implemented. The server enforces the order of steps; rejecting needs a reason, as cancelling a work order does.

## 6. Design choices worth noticing

- **Permits follow the work orders automatically.** The work-order store tells listeners about every status change, and asks a "start check" before work begins. The HSE code plugs into both; the work-order code doesn't need to know what a permit is.
- **One permit card, two places.** The permit shows on the work order's page and on the permits list, with the same Issue button. The button appears only for the role allowed to press it.
- **Seeded to look like a real Monday.** Work already approved has an issued permit; scheduled work waits in the HSE officer's queue.

## 7. Exercises

1. On the Overview, pick an impaired item whose reason is "PM overdue". Find its PM plan (note 26) and raise the work.
2. As Maintenance Planner, open a scheduled work order. What does its permit card say? As HSE Officer, issue the permit from the Permits page and look again.
3. Report a near miss. Where does it appear, and how does it change the chart?
4. Walk a proposed change through review to implemented, switching roles as needed. Which role can do each step?
