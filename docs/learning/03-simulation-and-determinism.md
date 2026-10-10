# Learning note 03 — Simulation, determinism and classes

*Goes with step 5. Run `npm run inspect -w @pdm/mock-data` first and look at the output.*

## 1. Determinism: why we never use `Math.random()`

`Math.random()` gives different numbers every run. Then a test that passes today fails tomorrow, and a demo looks different every time.

Instead, [random.ts](../../packages/mock-data/src/random.ts) uses **seeded** randomness: a formula that turns a seed number into a sequence that *looks* random but is always the same for the same seed.

```ts
const rng = new Rng(42);
rng.next(); // some number between 0 and 1 — the SAME number every time, on every computer
```

A second trick: `hashNoise(seed, n)` gives "the random number at position n" **without** keeping any state. That's how [signals.ts](../../packages/mock-data/src/signals.ts) can compute a sensor's value at any moment — `gaussNoise(tag.seed, secondsSince1970)` — without storing history.

## 2. Pure functions

A **pure function** returns the same output for the same input and changes nothing else. `tagValue(world, chaos, tag, t)` is (almost) pure. Benefits:

- Easy to test — call it, check the result.
- History is free — call it with an older `t`.
- No bugs from hidden state changing behind your back.

The alarm engine, by contrast, *has* state (people acknowledge alarms), so it's a **class**.

## 3. Classes

```ts
export class SimClock {
  private currentSpeed = 1;                 // data that belongs to this object
  constructor(private readonly realNow: () => number, startSimTime: number) { … }
  now(): number { … }                       // behaviour that uses that data
  setSpeed(speed: number): void { … }
}

const clock = new SimClock(Date.now, startTime);  // make one
clock.setSpeed(3600);
```

- `private` — only code inside the class can touch it.
- `readonly` — can't be reassigned after construction.
- `constructor(private readonly realNow …)` — shorthand that declares *and* stores a field.

## 4. Dependency injection (passing in what you depend on)

`SimClock` doesn't call `Date.now()` directly; it receives a `realNow` function. In the app we pass `Date.now`. In tests we pass a fake we can move forward instantly:

```ts
let real = 0;
const backend = createMockBackend({ realNow: () => real, … });
real += 1000; // one second passes — instantly
```

That's how the storyline test plays a simulated **week** in about a second.

## 5. Maps and Sets

| | Use when | Example |
|---|---|---|
| `Map<K, V>` | Look things up by key, fast | `world.assets.get("CBC-GT-101")` |
| `Set<T>` | "Is this in the group?" | `asset.scopeIds.has("CBC")` |

Looking up in an array means checking every item; a `Map` jumps straight to it. With 10,000 tags, that difference matters.

## 6. Something that happened while building this

All 16 tests passed first time — but printing the data revealed solar inverters producing 4–12 kW **at night**. Noise was being added to a machine that was switched off. Tests only check what you thought to test; *looking at the output* catches the rest. The fix: stopped machines with a fixed idle value read flat.

## 7. Exercises

1. Run `npm run inspect -w @pdm/mock-data`. Which asset is the #1 risk? Open [snapshot.ts](../../packages/mock-data/src/snapshot.ts) and find the line that computes `riskScore`. Explain the number in your own words.
2. In [catalog/sites.ts](../../packages/mock-data/src/catalog/sites.ts), change Pecos Solar Farm's `cloudiness` from `0.15` to `0.9`. Run inspect again and compare the inverter's day of output. Change it back.
3. In [world.ts](../../packages/mock-data/src/world.ts), change `FAULT_RATE` from `0.06` to `0.2`. What happens to enterprise health and the number of P2 alarms? Do the tests still pass? Why might one fail? Change it back.
4. Read the storyline test at the bottom of [backend.test.ts](../../packages/mock-data/src/backend.test.ts). Each `step(n)` moves the simulation forward `n` days. Match each `expect` line to a row of the storyline table in the [mock data guide](../05-mock-data/README.md#the-storyline-gt-compressor-fouling-on-cbc-gt-101).
