/**
 * Every story in every theme, in a real browser: no accessibility problems, and (on this computer,
 * not on GitHub) it looks the same as its saved screenshot. Scope decision 9: Playwright
 * screenshot tests, run locally.
 *
 *   npm run test:stories        (from the repository root: builds Storybook, then tests it)
 *
 * After a deliberate visual change, save new screenshots and look at them before committing:
 *
 *   npm run test:stories -- -- --update-snapshots
 */
import { defineConfig } from "@playwright/test";

const PORT = 6007;
const onCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  fullyParallel: true,
  workers: onCI ? 2 : "50%",
  timeout: 60_000,
  reporter: [["list"], ["html", { open: "never" }], ...(onCI ? [["github"] as const] : [])],
  // Screenshots are saved per operating system (fonts draw slightly differently on each); only
  // Windows ones are kept in the repository, so other systems check accessibility alone.
  snapshotPathTemplate: "{testDir}/screenshots/{arg}-{platform}{ext}",
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.002 } },
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    viewport: { width: 1024, height: 768 },
    // Fixed, so dates and numbers render the same everywhere.
    locale: "en-GB",
    timezoneId: "UTC",
  },
  webServer: {
    // Serves the Storybook that `npm run test:stories` has just built.
    command: `npx vite preview --outDir storybook-static --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/iframe.html`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
