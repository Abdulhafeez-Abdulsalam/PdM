# Learning note 36: Slow tests, busy machines, and timings you can trust

*This note goes with the [Phase 4 review](../phase-4-review.md).*

## 1. The symptom

Three times in Phase 4, `npm run check` failed because a test ran past its time limit. One of them only checks that "10/10/2026" isn't accepted as a timestamp: microseconds of work, yet it took over 5 seconds. Run on its own, every one of them passed in a fraction of a second.

When a test that does almost nothing is slow, the test isn't the problem. **It was waiting for its turn on a processor.**

## 2. The cause: more work than processors

This laptop has **4 logical processors** (`node -p "require('os').cpus().length"`). `npm run check` asks Turborepo to type-check, lint and test five packages: 17 tasks. By default Turborepo runs **up to 10 at once**. Each test task then starts its own pool of worker processes. So dozens of busy processes share 4 processors, and the operating system gives each a slice of time in turn. Any one of them can sit waiting for seconds.

Raising each test's time limit (as chunks 4 and 5 did) hides the symptom and leaves the cause. Each fix only lasts until the next test happens to be unlucky.

## 3. The fix: run fewer things at once

Turborepo's `--concurrency` option caps how many tasks run together. The check now says `--concurrency=50%`: half the processors, 2 tasks at a time here, more on a bigger machine.

Did it make the check slower? Measured:

| | Whole check | mock-data tests | api-client tests |
|---|---|---|---|
| Up to 10 tasks at once | 7½–9 min | 96 s | 25 s |
| At most 2 at once | 8 min 53 s | 40 s | 5.5 s |

The same total time. With 4 processors, the work takes about as long however it's queued; starting more at once only makes everything share the same processors. The difference is that nothing starves: each task gets a fair turn, and the slowest test now uses a third of its limit.

## 4. A timing you can't trust

The first timing after the fix said the whole check took **42 seconds**. Too good to be true, and it wasn't: Turborepo printed **"FULL TURBO"**, meaning nothing in the packages had changed since the last successful run, so it **replayed the saved results** instead of running anything. That's its cache doing its job, and it saves real time day to day. But it makes a timing meaningless. `--force` makes it run everything afresh; that run gave the honest 8 min 53 s.

## 5. Lessons

- **Slow and simple means waiting, not working.** Look at what else is running before rewriting the test.
- **Fix the cause, not each symptom.** One flag replaced a growing list of raised limits.
- **Check what a measurement measured.** Caches, warm starts and other programs running can all change a number.
- **Read the tool's own docs for the version you have.** The Turborepo docs come inside the installed package (`node_modules/turbo/docs`), matching it exactly; AGENTS.md asks for that before changing how it runs.

## 6. Exercises

1. How many processors does your machine have? What would `--concurrency=50%` mean on it?
2. Run `npm run check` twice in a row without changing anything. How long does the second one take, and why?
3. Why doesn't running more tasks at once make the check faster on a 4-processor machine?
