# Learning note 09 — Feedback loops, and trusting your cache

*Goes with Phase 2, chunk 1 (prediction console). Switch role to **Reliability Engineer**.*

## 1. The feedback loop

A predictive model is only as good as the evidence it learns from. The prediction page asks one question — **"Was the model right?"** — with three answers: the problem was real, it was a false alarm, or there was a different problem.

Those answers feed **model precision** on the console:

```
precision = confirmed ÷ (confirmed + false alarms)
```

Mark a prediction as a false alarm and watch precision drop. In a real system these labels go back to the data scientists to retrain the model — the loop that makes predictions better over time.

## 2. Ranking by money at risk

The console sorts by `probability × cost if it fails` by default. A pipeline at 57% probability outranks a pump at 90%, because a pipeline failure costs millions and a pump failure tens of thousands. Change **Sort by** to compare. Choosing *what to rank by* is a product decision, not a technical one.

## 3. One dialog, two sources

The "Create work order" dialog now works from an alarm **or** a prediction. The type that describes it:

```ts
type WorkOrderTarget =
  | { kind: "alarm"; alarm: Alarm }
  | { kind: "prediction"; prediction: Prediction };
```

This is a **discriminated union** — the same idea as the live messages in note 02. Checking `target.kind` tells TypeScript which fields exist, so `target.alarm` is only reachable after `kind === "alarm"`.

## 4. A bug in the build system: the cache that lied

Turborepo caches task results: if a package's files haven't changed, it replays the last result instead of re-running. Our config said `"typecheck": {}` — and when the **contracts** package changed, the **mock-data** package's type check was replayed from cache as *passing*, although its code no longer matched the new contract.

Turborepo's own documentation shows this exact config marked *"Incorrect!"*. The fix is a "transit" task that links each package's cache to its dependencies:

```json
"transit":   { "dependsOn": ["^transit"] },
"typecheck": { "dependsOn": ["transit"] }
```

Lessons:
- A green check is only as trustworthy as what it actually ran. "Suspiciously no errors" deserves a second look — here, `--force` revealed the truth.
- Read the docs for the version you have installed (`node_modules/turbo/docs`), not memory.

## 5. Exercises

1. As Reliability Engineer, open a prediction and mark it **No — false alarm**. Go back to the console: what happened to Model precision?
2. Dismiss a prediction without a reason. Then with one. Find your reason in the asset's event timeline (Alarms → Event timeline).
3. Raise a work order from a prediction. Then open the asset's **Maintenance** tab. What priority and due date did it get? Read `draftFromPrediction` in [work-order-draft.ts](../../apps/web/src/features/alarms/work-order-draft.ts) to see why.
4. Switch to **Condition Monitoring Analyst** and reload `/`. Where do you land, and which file decides that?
