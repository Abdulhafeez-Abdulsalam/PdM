/**
 * End-to-end tests in a real browser (scope decision 9: Playwright, run locally).
 * They run against the production build, served on port 4174 so they never clash with
 * `npm run dev` (5173). The installed Google Chrome is used; no browser download needed.
 *
 *   npm run e2e            (from the repository root)
 */
import { defineConfig } from "@playwright/test";

const PORT = 4174;
// On GitHub (which sets CI), also report each failure as an annotation: readable on the run's page
// and through GitHub's public API, without signing in (ADR-0018).
declare const process: { env: Record<string, string | undefined> };
const onCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "e2e",
  // One test at a time: the performance test needs a quiet machine, and the rest are quick.
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never" }], ...(onCI ? [["github"] as const] : [])],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
