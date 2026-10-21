/**
 * Acceptance criterion E: the screen stays responsive with 300 live tags updating once a
 * second (ADR-0005). Opens the diagnostics page with 300 real live-value widgets and, for
 * 20 seconds, measures:
 *
 *  - updates:     how many tiles really change each second (proves the load is real)
 *  - tap response: real mouse clicks on a button, timed by the browser's Event Timing API,
 *                 from the click to the next frame on screen, including any wait while the
 *                 browser was busy. This is what Google's "Interaction to Next Paint" (INP)
 *                 measures; under 200 ms counts as good.
 *  - freezes:     "long tasks", when the browser is busy for more than 50 ms in one go;
 *                 "blocking time" is the part beyond 50 ms, per second
 *  - smoothness:  gaps between drawn frames
 *
 * Run at three speeds, by slowing Chrome's CPU down: 1× (this development laptop),
 * 2× (a typical older office PC) and 4× (Chrome DevTools' setting for a low-end device).
 */
import { expect, open, test } from "./helpers";

const MEASURE_S = 20;

// Playwright's trace recorder (screenshots and DOM snapshots) is heavy work in the same
// browser; left on, it made the page look three times slower than it is.
test.use({ trace: "off" });

/**
 * Taps: Google's scale says under 200 ms is good and under 500 ms needs improvement. The
 * full-speed and office-PC budgets are "good"; the low-end budget is "needs improvement",
 * which is what 300 changing values cost on such a machine (see docs/quality-report.md).
 */
const BUDGET = {
  1: { tapMs: 100, longestTaskMs: 150, blockingMsPerSecond: 50 },
  2: { tapMs: 200, longestTaskMs: 300, blockingMsPerSecond: 150 },
  4: { tapMs: 500, longestTaskMs: 600, blockingMsPerSecond: 400 },
} as const;

for (const slowdown of [1, 2, 4] as const) {
  test(`criterion E: 300 live tags stay responsive (CPU ${slowdown}× slower)`, async ({ page }) => {
    await open(page, "/diagnostics/live-load", { role: "plant_manager" });
    const grid = page.getByTestId("live-load-grid");
    await expect(grid.getByRole("listitem")).toHaveCount(300);
    await expect.poll(() => grid.locator(".animate-pulse").count(), { timeout: 20_000 }).toBeLessThan(10); // first values in

    if (slowdown > 1) {
      const cdp = await page.context().newCDPSession(page);
      await cdp.send("Emulation.setCPUThrottlingRate", { rate: slowdown });
    }

    // Start recording inside the page.
    await page.evaluate(() => {
      const w = window as unknown as Record<string, unknown>;
      const longTasks: number[] = [];
      const taps: number[] = [];
      const gaps: number[] = [];
      new PerformanceObserver((l) => l.getEntries().forEach((e) => longTasks.push(e.duration))).observe({ type: "longtask" });
      new PerformanceObserver((l) => l.getEntries().forEach((e) => e.name === "click" && taps.push(e.duration))).observe({
        type: "event",
        durationThreshold: 16,
        buffered: false,
      } as PerformanceObserverInit);
      // Gaps between frame timestamps (the first frame only sets the starting point: frame
      // timestamps and performance.now() can differ slightly, which once gave a negative gap).
      let last: number | null = null;
      const frame = (t: number) => {
        if (last !== null) gaps.push(t - last);
        last = t;
        if (!w.stop) requestAnimationFrame(frame);
      };
      requestAnimationFrame(frame);
      const tiles = [...document.querySelectorAll('[data-testid="live-load-grid"] > li')];
      const read = () => tiles.map((li) => li.lastElementChild?.textContent ?? "");
      let previous = read();
      let changed = 0;
      const timer = setInterval(() => {
        const now = read();
        changed += now.filter((text, i) => text !== previous[i]).length;
        previous = now;
      }, 1000);
      Object.assign(w, { longTasks, taps, gaps, changes: () => changed, timer, tiles: tiles.length, started: performance.now() });
    });

    // Real mouse clicks, out of step with the once-a-second updates so some land while the
    // page is busy. Raw mouse events, not locator.click(): that first waits until the page is
    // idle, which would hide exactly the delay we want to see.
    const box = (await page.getByRole("button", { name: /^Tap test/ }).boundingBox())!;
    const clicks = Math.floor((MEASURE_S * 1000) / 1300);
    for (let i = 0; i < clicks; i++) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(1300);
    }

    const m = await page.evaluate(() => {
      const w = window as unknown as {
        longTasks: number[];
        taps: number[];
        gaps: number[];
        changes: () => number;
        timer: number;
        tiles: number;
        started: number;
        stop?: boolean;
      };
      w.stop = true;
      // The real elapsed time: on a slowed-down CPU the clicks take longer than planned.
      const seconds = (performance.now() - w.started) / 1000;
      clearInterval(w.timer);
      const sorted = (xs: number[]) => [...xs].sort((a, b) => a - b);
      const pct = (xs: number[], p: number) => sorted(xs)[Math.min(xs.length - 1, Math.floor(xs.length * p))] ?? 0;
      return {
        tiles: w.tiles,
        updatesPerSecond: Math.round(w.changes() / seconds),
        tapsTimed: w.taps.length,
        // Clicks answered within 16 ms don't produce an entry, so missing ones count as fast.
        tapWorstMs: Math.round(Math.max(0, ...w.taps)),
        longestTaskMs: Math.round(Math.max(0, ...w.longTasks)),
        blockingMsPerSecond: Math.round(w.longTasks.reduce((sum, d) => sum + Math.max(0, d - 50), 0) / seconds),
        frameGapP95Ms: Math.round(pct(w.gaps, 0.95)),
        seconds: Math.round(seconds),
      };
    });
    test.info().annotations.push({ type: `metrics at ${slowdown}× slower CPU`, description: JSON.stringify(m) });
    // eslint-disable-next-line no-console -- the measurements are this test's output; worth seeing on every run
    console.log(`CPU ${slowdown}×`, m);

    const budget = BUDGET[slowdown];
    expect(m.tiles).toBe(300);
    expect(m.updatesPerSecond, "enough tiles really changing to be a real load").toBeGreaterThanOrEqual(150);
    expect(m.tapWorstMs, "slowest tap, click to screen").toBeLessThan(budget.tapMs);
    expect(m.longestTaskMs).toBeLessThan(budget.longestTaskMs);
    expect(m.blockingMsPerSecond).toBeLessThan(budget.blockingMsPerSecond);
  });
}
