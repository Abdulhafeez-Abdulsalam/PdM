/**
 * The demo walkthrough again, this time saving the README's screenshots to docs/screenshots.
 *
 *   npm run demo:screenshots    (from the repository root; about 3 minutes)
 */
import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

export default defineConfig({
  ...base,
  testMatch: "walkthrough.spec.ts",
  metadata: { screenshots: true },
  use: { ...base.use, viewport: { width: 1440, height: 900 } },
});
