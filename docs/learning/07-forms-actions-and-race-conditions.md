# Learning note 07 — Forms, actions, and race conditions

*Goes with Phase 1, chunk 4 (Alarms). Switch role to **Control Room Operator** to see every action.*

## 1. Forms: one schema, two jobs

The shelve form ([ShelveDialog.tsx](../../apps/web/src/features/alarms/ShelveDialog.tsx)):

```ts
const schema = z.object({
  reason: z.string().trim().min(5, { error: "forms.reasonTooShort" }),
  hours: z.enum(["1", "4", "8", "12", "24"]),
});
const form = useForm({ resolver: zodResolver(schema), defaultValues: { reason: "", hours: "4" } });
```

- **React Hook Form** keeps track of what's typed, which fields are touched, and whether it's submitting.
- **Zod** (the same library as the data contracts) decides what's valid.
- The error *message* is a text-catalog key, translated where it's shown.

`zodResolver` is a 20-line connector in [forms.ts](../../apps/web/src/shared/forms.ts). The usual package for this had a dependency conflict; writing the small piece yourself is sometimes the better trade.

## 2. Accessible form fields

[Field.tsx](../../packages/ui/src/Field.tsx) wires each input to its label, hint and error, so a screen reader says *"Reason, required, invalid: Give a reason of at least 5 characters"*. That happens through `htmlFor`/`id`, `aria-describedby` and `aria-invalid` — worth reading.

## 3. Optimistic updates

When an operator acknowledges an alarm, the row changes **immediately**, before the server answers ([use-alarm-actions.ts](../../apps/web/src/features/alarms/use-alarm-actions.ts)):

1. `onMutate` — save the current list, then update the cached list as if it worked.
2. `onError` — put the saved list back, show a message.
3. `onSettled` — refetch from the server either way, so the screen ends up true.

During an alarm flood, waiting a round-trip per alarm would be painful. Optimism is fine here because acknowledging rarely fails and is easy to undo visually.

## 4. Race conditions: two bugs found by timing the flow

A **race condition** is a bug that depends on what finishes first.

**Bug 1 — the empty snapshot.** The work-order form counted as "ready" once the asset and technicians had loaded — but the readings snapshot was a separate request. A fast operator could press Create before it arrived, and the work order would have no evidence. The test didn't catch it because test runs happen to be slower. Fix: "ready" waits for the snapshot too. A test now asserts the snapshot has readings.

**Bug 2 — the late subscriber.** Shelving was rejected as "more than 24 hours" in tests. The simulated clock's status was broadcast before the shelve dialog started listening, so the dialog used the real date (10 days later than the simulation). Fix: the transport remembers the latest status and gives it to anyone who subscribes later — the same pattern as a "current value" in a store.

**A false alarm.** While checking the Bug 1 fix in the browser, it still showed 0 readings. Cause: Vite's hot reload had swapped the file but the open dialog was still running the old code. A full page reload proved the fix worked. When a fix "doesn't work", first make sure you're running it.

## 5. Keyboard-first design

Control-room operators work fast. In the alarm list: focus a row (Tab), move with ↑/↓, press **A** to acknowledge, **S** to shelve, **W** for a work order. See `onRowKey` in [AlarmTable.tsx](../../apps/web/src/features/alarms/AlarmTable.tsx). Note the guard: `if (e.target !== e.currentTarget) return;` — so pressing "a" while a button or checkbox inside the row has focus doesn't trigger an action.

## 6. Exercises

1. As Control Room Operator, shelve an alarm with the reason "ok". Read the error. Then give a proper reason. Check the Shelved count in the alarm bar.
2. Switch role to **Executive** and open Alarms. Where did the buttons go? Find the three lines in `AlarmTable.tsx` that decide.
3. Create a work order from an alarm, then open that asset's **Maintenance** tab. Is it there? What priority did it get, and why? (See `PRIORITY_FROM_ALARM` in [work-order-draft.ts](../../apps/web/src/features/alarms/work-order-draft.ts).)
4. Turn on **Chaos mode** at 600× speed and watch the Alarms page. Does the flood warning appear?
5. In `use-alarm-actions.ts`, comment out the `onMutate` block, save, and acknowledge an alarm. Notice the delay before the row changes. Put it back.
