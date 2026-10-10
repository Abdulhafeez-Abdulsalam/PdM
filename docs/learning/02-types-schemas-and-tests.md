# Learning note 02 — Types, schemas and tests

*Goes with deliverable 4. Open [packages/contracts/src/assets.ts](../../packages/contracts/src/assets.ts) next to this note.*

## 1. A type is a promise about the shape of data

```ts
type Health = { score: number; state: "healthy" | "critical" };

const h: Health = { score: 72, state: "healthy" };   // ✅
const bad: Health = { score: "72", state: "fine" };  // ❌ editor underlines both mistakes
```

Types exist only while you write code. When the app runs, they're gone — so they **can't** check data that arrives from a server.

## 2. A schema checks data while the app runs

```ts
import { z } from "zod";

const Health = z.object({
  score: z.number().min(0).max(100),
  state: z.enum(["healthy", "critical"]),
});

Health.parse({ score: 72, state: "healthy" });  // ✅ returns the data
Health.parse({ score: 150, state: "healthy" }); // ❌ throws: score must be ≤ 100
```

## 3. Zod gives you both from one definition

```ts
export const Health = z.object({ ... });       // schema (runtime)
export type Health = z.infer<typeof Health>;   // type (compile time), generated from the schema
```

Write the shape once → never have a type and a check that disagree. That's the pattern in every contract file.

## 4. Things to notice in the contract files

| Look for | Example | What it teaches |
|---|---|---|
| `z.enum([...])` | `HealthState` | A value must be one of a fixed list |
| `.nullable()` vs `.optional()` | `rul: RulEstimate.nullable()` | `null` = "we know there's no value"; optional = "may be left out" |
| `.default(...)` | `limit ... .default(50)` | Caller may omit it; the schema fills it in |
| `.refine(...)` | `RulEstimate` | A custom rule involving several fields (p10 ≤ p50 ≤ p90) |
| `.extend({...})` | `AssetListParams = PageParams.extend(...)` | Build bigger shapes from smaller ones |
| `.pick({...})` | `CreateWorkOrderRequest` | Reuse some fields of another shape |
| `z.discriminatedUnion("type", [...])` | `ServerMessage` | "One of these message kinds — look at `type` to know which" |
| `as const satisfies Record<…>` | `CANONICAL_UNIT` | TypeScript checks the table covers **every** quantity — add a quantity and forget its unit, and the build fails |

## 5. Tests

A test is code that checks other code. Open [contracts.test.ts](../../packages/contracts/src/contracts.test.ts):

```ts
it("rejects a probability above 1", () => {
  expect(Prediction.safeParse({ ...prediction, probability: 1.5 }).success).toBe(false);
});
```

Read it as a sentence: *"It rejects a probability above 1: expect parsing a prediction with probability 1.5 to not succeed."*

`{ ...prediction, probability: 1.5 }` is the **spread** syntax: "copy every field of `prediction`, then override `probability`".

## 6. Something that happened while building this

The type checker failed once:

```
src/timeseries.ts(29,3): error TS2322: Type 'number | undefined' is not assignable to type 'number'.
```

The code read the last item of an array: `NICE_INTERVALS_SECONDS[NICE_INTERVALS_SECONDS.length - 1]`. We turned on the strict setting `noUncheckedIndexedAccess`, which says *"reading `array[i]` might give `undefined` — prove it doesn't."* The fix was to use a named constant instead. Strict settings feel annoying at first; they are the reason whole categories of bugs never reach users.

## 7. Exercises

Run `npm run check` after each change and read what it tells you.

1. In [contracts.test.ts](../../packages/contracts/src/contracts.test.ts), change the `"7 days"` expectation from `600` to `300`. Run the tests and read the failure message. Then change it back.
2. In [quantities.ts](../../packages/contracts/src/quantities.ts), add `"torque"` to the `Quantity` list **without** adding it to `CANONICAL_UNIT`. Run `npm run typecheck`. What does TypeScript say? Now add `torque: "N·m"` and check again.
3. Write a new test: a `ShelveAlarmRequest` with a reason longer than 500 characters should fail. Hint: `"x".repeat(501)`.
4. Git: run `git status` and `git diff` to see what you changed. Undo exercise changes with `git restore <file>`.
