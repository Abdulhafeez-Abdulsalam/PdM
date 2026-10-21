/**
 * Shared set-up for the end-to-end tests:
 *  - `open()` starts the app as a given role, theme and unit system (the same saved
 *    preferences a real user has), then waits until the page has finished loading.
 *  - every test fails if the browser console shows an error.
 */
import { test as base, expect, type Page } from "@playwright/test";

export type Role =
  | "executive"
  | "plant_manager"
  | "reliability_engineer"
  | "condition_analyst"
  | "control_room_operator"
  | "maintenance_planner"
  | "field_technician";
export type Theme = "light" | "dark" | "control-room";

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      page.on("pageerror", (e) => errors.push(e.message));
      await use(errors);
      expect(errors, "errors in the browser console").toEqual([]);
    },
    { auto: true },
  ],
});
export { expect };

export async function open(page: Page, url: string, prefs: { role: Role; theme?: Theme; units?: "si" | "imperial" | "oilfield" }) {
  const state = { theme: prefs.theme ?? "light", units: prefs.units ?? "si", timeZone: "site", role: prefs.role, navCollapsed: false };
  // Runs before the app's own scripts on every page load, like a returning user's saved settings.
  await page.addInitScript((s) => localStorage.setItem("pdm-preferences", JSON.stringify({ state: s, version: 1 })), state);
  await page.goto(url);
  await settle(page);
}

/** Wait for the page heading, then until loading placeholders are gone (or stop changing). */
export async function settle(page: Page) {
  await expect(page.locator("h1").first()).toBeAttached();
  let last = -1;
  for (let i = 0, still = 0; i < 60 && still < 4; i++) {
    const now = await page.locator(".animate-pulse").count();
    if (now === 0) return;
    still = now === last ? still + 1 : 0;
    last = now;
    await page.waitForTimeout(250);
  }
}
