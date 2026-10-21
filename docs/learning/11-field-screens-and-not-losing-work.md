# Learning note 11: Field screens, and not losing someone's work

*This note goes with Phase 2, chunk 3 (field technician screens). Switch role to **Field Technician**. Try it on a phone-sized window too: in your browser press F12, then click the phone icon (device toolbar).*

## 1. Designing for a different person

Everyone else uses this app at a desk. A technician uses it standing next to a pump, maybe wearing gloves, maybe in the sun. So the field pages are different:

- **One column, phone width** (`max-w-xl`). Nothing to scroll sideways.
- **48 px touch targets.** Checkboxes are whole rows, and buttons use the new `size="lg"` (a fingertip is about 10 mm).
- **Only my work, ordered by what I do next:** *In progress* → *Ready to start* → *Waiting for approval*.
- **Numbers typed with `inputMode="decimal"`.** Phones then show a number keypad, and we still accept "4,5" as well as "4.5".

The same data (work orders) gets a different screen because the person and their situation are different. That's normal: "one screen per user goal", not one screen per database table.

## 2. Checklists: data, not code

Each work order now carries a **checklist**: safety checks, steps and readings ([contracts](../../packages/contracts/src/work-orders.ts)). The screen doesn't know what a "gas test" is; it just draws whatever lines the work order has. A new procedure means new data, not a new release of the app.

## 3. A safety gate, enforced twice

"Start work" stays disabled until every safety check is ticked. That's the **UI** check, and it's there for convenience. The **server** checks again: try to start without the checks and it answers *"Confirm every safety check before starting"* ([checklists.ts](../../packages/mock-data/src/checklists.ts)).

Why both? Anyone can send a request without our UI (ADR-0008). A rule that matters for safety must live where it can't be skipped. The UI copy of the rule just saves people a confusing error.

## 4. Units: the way back

Until now we only converted SI → the user's units, for display. A technician *types* in their units, so we need the inverse too: `fromDisplay()` in [units.ts](../../apps/web/src/shared/units.ts). The server always stores SI.

The test for this is a **round trip**: convert there and back and you must get the same number. Round-trip tests catch a whole family of bugs, like forgetting the +32 in °F.

## 5. Criterion D: never lose what someone typed

The original spec wanted full offline sync. We cut that (ADR-0007). We kept one promise: **a dropped connection never wipes typed work.** Here is how it's kept, in three small pieces:

1. **Copy every keystroke to session storage** ([draft.ts](../../apps/web/src/features/field/draft.ts)). `sessionStorage` is a small key–value store in the browser that lives as long as the tab. A reload doesn't clear it, but closing the tab does.
2. **Don't send while offline.** The submit buttons are disabled and say *"Waiting for a connection…"*. We also told TanStack Query `networkMode: "always"`. Otherwise it would quietly *queue* a submit and fire it later by itself, which is a hidden form of offline sync, exactly what we decided not to build.
3. **Clear the draft only after the server says yes.** If the submit fails, nothing is lost and the person just presses the button again.

How do you *test* a dropped connection? The transport got a `setDisconnected()` switch. The browser's real `offline`/`online` events call it, and so does the demo's **Drop the connection** checkbox in the simulation panel. The test in [Field.test.tsx](../../apps/web/src/features/field/Field.test.tsx) types, pulls the plug, "reloads" (unmounts and renders again), checks everything is still there, reconnects and submits.

## 6. A lint warning worth reading

ESLint flagged `form.watch()` with *"Compilation Skipped: Use of incompatible library"*. React's compiler can't safely cache a function whose result changes without React knowing. The fix is the hook version, `useWatch()`, which tells React when values change. Warnings like this are the tools teaching you the framework's rules, so it's worth reading them rather than silencing them.

## 7. Exercises

1. As **Field Technician**, open a *Ready to start* job. Tick two of the three safety checks. What does the page say? Tick the third and start.
2. On an *In progress* job, type some findings. Open the menu → Simulation → **Drop the connection**. What changed on the page? Now reload the page (F5). Is your text still there?
3. Set units to **Imperial** in Settings, enter a vibration reading of `0.5`, and complete the job. Open the work order from Maintenance: what value is shown, and in which units? What value did the server store? (Hint: 1 in = 25.4 mm.)
4. Switch to **Plant Manager** and open the same field task. What can you change? Which line in `TaskPage.tsx` decides that?
5. Close the browser tab after typing some findings, then open the job again. Is the draft still there? Why is that the right trade-off for an online-only app?
