/**
 * Acceptance criterion F in a real browser: every screen, in all three themes, checked by
 * axe-core including colour contrast (which the jsdom test in src/test/a11y.test.tsx can't do).
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, open, test, type Role, type Theme } from "./helpers";

const THEMES: Theme[] = ["light", "dark", "control-room"];

/** Real ids from the running demo (they depend on the date, so they're looked up, not hard-coded). */
async function ids(page: Page) {
  await open(page, "/predictive", { role: "reliability_engineer" });
  const prediction = (await page.locator('main a[href^="/predictive/PRED-"]').first().getAttribute("href"))!;
  await open(page, "/field", { role: "field_technician" });
  const task = (await page
    .getByRole("region", { name: /^In progress/ })
    .getByRole("link")
    .first()
    .getAttribute("href"))!;
  return { prediction, task, workOrder: task.replace("/field/tasks/", "/maintenance/") };
}

test("every screen passes axe in every theme", async ({ page }) => {
  test.setTimeout(10 * 60_000);
  const { prediction, task, workOrder } = await ids(page);
  const screens: [string, Role][] = [
    ["/command-center", "plant_manager"],
    ["/assets", "reliability_engineer"],
    ["/assets/CBC-GT-101", "reliability_engineer"],
    ["/assets/CBC-GT-101/telemetry", "reliability_engineer"],
    ["/assets/CBC-GT-101/health", "reliability_engineer"],
    ["/assets/CBC-GT-101/alarms", "reliability_engineer"],
    ["/assets/CBC-GT-101/maintenance", "reliability_engineer"],
    ["/alarms", "control_room_operator"],
    ["/alarms?view=timeline", "control_room_operator"],
    ["/predictive", "reliability_engineer"],
    [prediction, "reliability_engineer"],
    ["/maintenance", "maintenance_planner"],
    ["/maintenance?view=list", "maintenance_planner"],
    ["/maintenance?view=calendar", "maintenance_planner"],
    ["/maintenance/schedule", "maintenance_planner"],
    [workOrder, "maintenance_planner"],
    ["/field", "field_technician"],
    [task, "field_technician"],
    ["/reliability", "reliability_engineer"],
  ];

  const failures: string[] = [];
  for (const [url, role] of screens) {
    for (const theme of THEMES) {
      await open(page, url, { role, theme });
      const check = () => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      let { violations } = await check();
      // A finding must still be there a second later: once, a check caught the page mid-way
      // through switching screens and reported something that wasn't there when looked at again.
      if (violations.length > 0) {
        await page.waitForTimeout(1000);
        ({ violations } = await check());
      }
      for (const v of violations) failures.push(`${url} [${theme}] ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
    }
  }
  expect(failures).toEqual([]);
});
