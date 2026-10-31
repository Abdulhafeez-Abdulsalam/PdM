/**
 * End-to-end tests against the real server (Phase 5 chunk 6, ADR-0017): the app built in server
 * mode and served by the PdM server, as `npm start` runs it, with sign-in, the database and the
 * live WebSocket all real. Each run starts with a brand-new database.
 *
 *   npm run e2e:server     (from the repository root)
 */
import { defineConfig } from "@playwright/test";

const PORT = 4175;

export default defineConfig({
  testDir: "e2e-server",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  use: {
    // 127.0.0.1, the address the server listens on, so pages and the API are one site.
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: "chrome",
    viewport: { width: 1440, height: 900 },
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run build:connected -w @pdm/web && npm run start:server",
    cwd: "../..",
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      PORT: String(PORT),
      // A fresh database for every run, beside the server's own (apps/server/data, ignored by git).
      DB_FILE: `data/e2e/pdm-${Date.now()}.sqlite`,
      LOG_LEVEL: "warn",
      // The tests sign in more than 10 times a minute, all from this computer.
      SIGN_IN_ATTEMPTS_PER_MINUTE: "100",
    },
  },
});
