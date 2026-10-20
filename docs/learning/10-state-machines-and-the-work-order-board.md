# Learning note 10: State machines and the work-order board

*This note goes with Phase 2, chunk 2 (the work-order lifecycle). Open **Maintenance**, then switch roles between **Maintenance Planner**, **Plant Manager** and **Field Technician** as you read.*

## 1. A work order is a state machine

A work order is always in exactly one **state**: requested, triaged, planned, scheduled, approved, in progress, completed, verified, closed or cancelled. It can only move along certain arrows. The arrows are one plain table in [work-orders.ts](../../packages/contracts/src/work-orders.ts):

```ts
requested: ["triaged", "cancelled"],
triaged:   ["planned", "cancelled"],
...
completed: ["verified", "in_progress"],   // verify, or reopen
closed:    [],                            // the end
```

This table is a **state machine**. Writing it down as data, not as `if` statements scattered around the code, has three benefits:

- **One source of truth.** The mock backend (`transition()` refuses illegal moves with a *conflict* error), the board (which drop targets are valid), and the buttons on the work-order page all read the same table.
- **Testable in one line each.** `canTransition("requested", "closed")` is `false`. Tests for this live in `contracts.test.ts`.
- **Visible to non-programmers.** A maintenance manager can read this table and say "no, verified work must be closed by the planner".

## 2. Two questions: *may this move happen*, and *may you make it*

[lifecycle.ts](../../apps/web/src/features/maintenance/lifecycle.ts) combines the state machine with the roles:

```ts
mayMove(role, from, to) = canTransition(from, to) && role is allowed that action
```

A planner may schedule, the plant manager approves, and a technician starts and closes out work. Drag a card as the wrong role and the board tells you *why* it refused. "Not a valid next step" and "your role can't do that" are different messages, because they need different fixes.

Remember that hiding a button is only a convenience (see [scope decisions](../scope-decisions.md)). The real rule must also be enforced by the server, and here the mock backend does that.

## 3. Some moves need more information

Moving a card is usually one click. Some moves can't be done with one click:

| Move | Asks for | Why |
|---|---|---|
| → Scheduled | start time **and** technician | A schedule without a person or a time is a wish. |
| → Completed | ISO 14224 close-out | This is the data that reliability analysis is built on. |
| → Cancelled | a reason | Cancelled work vanishes from the board, so leave a trail. |

`resolveDrop()` turns a drop into one of these outcomes: `move`, `schedule`, `closeOut` or `refuse`. That keeps the board component dumb: it just does what it's told.

## 4. ISO 14224: why the codes are dropdowns, not free text

"Bearing noisy, replaced" is useful to the technician who wrote it, and useless to someone counting bearing failures across 400 pumps. ISO 14224 is the oil-and-gas standard for failure data. It splits each failure into three parts:

- **Failure mode**: what you saw (`VIB` vibration, `ELP` external leak, …)
- **Cause**: why it happened (`2.4` wear-out, `5.2` lubrication, …)
- **Remedy**: what you did (replace, repair, adjust, …)

Coded data can be counted, so you can later ask "what are our top failure modes?". The free-text **findings** field is still there for the story, with a 10-character minimum so that "ok" doesn't count.

If the work came from a prediction, the close-out also asks **"Was the prediction right?"**. That answer goes straight into the feedback loop from note 09, so finishing the work trains the model.

## 5. Optimistic updates, again

The board moves the card **before** the server answers (the optimistic update from note 07). If the server refuses, the card snaps back and a message explains why. Try it by turning on chaos mode in the simulation panel and moving cards until a request fails.

## 6. Accessibility: dragging without a mouse

Drag-and-drop is hard for keyboard and screen-reader users, so there are two ways to move a card:

1. **The grip handle** works with the keyboard as well: Tab to it, press Space, use the arrow keys, then press Space again. dnd-kit announces each step to screen readers.
2. **"Move to…"**: an ordinary menu of the moves your role is allowed. This is the fallback that always works.

One bug found while writing the tests: the button's visible text was "Move to…" and it had hidden text " WO-10353" next to it. The browser computed its **accessible name** (what a screen reader says) as "Move to…WO-10353", with no space. Giving the button an explicit `aria-label` fixed it. Testing with `getByRole("button", { name: … })` found this because it queries the page the way assistive technology does.

## 7. A test that failed only on a busy machine

`npm run check` runs typecheck, lint and every package's tests **at the same time**. On a laptop, the slowest web test then took over 20 s and timed out, but it passed whenever it ran alone. That's a resource problem, not a code bug. The fix was to give Vitest fewer workers (`maxWorkers: "50%"` in `vite.config.ts`) rather than simply raising the time limit. When a test is "flaky", first ask what is different between the passing and the failing run.

## 8. Exercises

1. As **Maintenance Planner**, drag a *Planned* card to *Scheduled*. What does the dialog ask for? Cancel it. Did the card move?
2. As **Field Technician**, try to drag a *Scheduled* card to *Approved*. Read the refusal. Which file wrote that message?
3. As **Field Technician**, open an *In progress* work order and close it out. Leave the findings empty first. Then find your close-out on the work-order page.
4. Add a rule: a technician may also **cancel** work. Which single line would you change, and which test should you update first?
5. Draw the state machine on paper from `WORK_ORDER_TRANSITIONS`. Which states have no way out?
