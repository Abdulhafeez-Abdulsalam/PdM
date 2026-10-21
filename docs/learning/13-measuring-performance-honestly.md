# Learning note 13: Measuring performance honestly

*This note goes with the quality chunk and [the quality report](../quality-report.md).*

## 1. "Responsive" has to become a number

Criterion E said dashboards must "stay responsive" with 300 live tags. You can't test a feeling, so the performance test turns it into numbers the browser can measure:

| Question | What's measured | Good |
|---|---|---|
| Does a tap feel instant? | Time from a real click to the next frame on screen (the browser's *Event Timing API*, the same data as Google's "Interaction to Next Paint") | under 100–200 ms |
| Does the page freeze? | *Long tasks*: stretches over 50 ms when the browser can't react to anything | rare and short |
| Is the load real? | How many tiles actually changed each second | about 300 |

And because the user's computer isn't your computer, it runs at three speeds by slowing Chrome's CPU down 2× and 4×.

## 2. Four times the test measured itself

The first runs said the app was slow. Some of that was true, but much of it was the test:

1. **A competing page.** My browser pane had the same 300-tile page open in development mode. Close everything before measuring.
2. **A tap button that re-rendered 300 tiles.** Its counter lived in the page component, so every tap redrew the whole page. Moving the state into a small `TapTest` component fixed the *test page*, not the app.
3. **The trace recorder.** Playwright's trace (screenshots and DOM snapshots, kept for debugging failures) made the page look three times slower. `test.use({ trace: "off" })` for this file.
4. **Clicks that waited politely.** `locator.click()` waits until the page is idle before clicking, which hides exactly the delay you want to see. Raw `page.mouse.click(x, y)` doesn't.

Lesson: **when a measurement surprises you, check the measurement first.** Compare it with a second method (here, a Chrome trace without the test runner) before changing any app code.

## 3. Profile, don't guess

My first guess was that every tile re-rendered twice a second. That was true (and fixed: see `useSimulationSelector`), but it barely changed the numbers. A trace showed why: React's work was only about 20% of the time. The rest was the browser's own pipeline:

```
your code (React) → style → layout → paint → commit to the screen
```

With 300 values changing at once, layout, paint and commit happened as one block of work, and a tap had to wait behind it.

## 4. The fix: spread the work, skip what's hidden

- **Slice the redraw.** Values are stored the moment they arrive, but the "please redraw" notices go out 50 tags per frame (`announce` in [live.ts](../../packages/api-client/src/live.ts)). Six small frames instead of one big one; the person can't tell, and taps slip in between.
- **Don't draw what's off screen.** `content-visibility: auto` tells the browser to skip tiles that are scrolled out of view.

Result on a low-end machine (4× slower): the slowest tap went from 0.72 s to about 0.2–0.3 s, and the longest freeze from 1 s to about 0.23 s.

## 5. Accessibility tests at two levels

- **Every commit:** `src/test/a11y.test.tsx` runs axe on 18 screens in jsdom. It's fast, but jsdom can't see colours.
- **On demand, in Chrome:** `e2e/a11y.spec.ts` runs axe on 17 screens × 3 themes, including colour contrast.
- **Watch the check fail first:** a test feeds axe a button with no name and expects it to complain. A checker that never complains might be checking nothing.

## 6. Exercises

1. Run `npm run e2e` from the repository root, then open `apps/web/playwright-report/index.html`. Find the performance metrics in the test annotations.
2. In `packages/api-client/src/live.ts`, set `ANNOUNCE_PER_FRAME` to `1000` (no slicing) and run `npx playwright test perf` in `apps/web`. What happens to `tapWorstMs` at 4×? Undo it.
3. Open `/diagnostics/live-load` in the app, press F12 → Performance, and record 5 seconds. Find the yellow (script) and purple/green (layout/paint) blocks for one update.
4. Why does `useSimulationSelector` insist on returning a primitive (true/false, a number)? What would happen if a selector returned a new object every time?
