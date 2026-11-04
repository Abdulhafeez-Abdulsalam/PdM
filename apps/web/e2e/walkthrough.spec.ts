/**
 * The stakeholder demo (docs/demo-walkthrough.md), acted out in a real browser, so the script
 * can't drift from the app: every step a presenter takes is one here.
 *
 * In demo mode the simulated plant lives in the page, so a reload would start it again. Like a
 * presenter, this stays on one page load and moves through the app's own menus.
 *
 * It also takes the README's screenshots when run with its own config, `npm run demo:screenshots`.
 */
import type { Page } from "@playwright/test";
import { expect, open, settle, test } from "./helpers";

const ASSET = "CBC-GT-101";

/** Run the plant fast until the storyline reaches this phase, then back to real time. */
async function fastForwardTo(page: Page, phase: string) {
  await page.getByLabel("Speed").selectOption("3600");
  await expect(page.getByText(phase, { exact: true })).toBeVisible({ timeout: 120_000 });
  await page.getByLabel("Speed").selectOption("1");
}

const viewAs = (page: Page, role: string) => page.getByRole("combobox", { name: "Viewing as" }).selectOption({ label: role });

async function goTo(page: Page, menuItem: string) {
  await page.getByRole("link", { name: menuItem, exact: true }).first().click();
  await settle(page);
}

/** Open an asset the way a presenter would: the search palette. */
async function openAsset(page: Page) {
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search pages, assets and actions" }).fill(ASSET);
  await page.getByRole("option", { name: new RegExp(`^${ASSET} ·`) }).click();
  await settle(page);
}

test("the demo walkthrough: from the first warning to a verified repair", async ({ page }) => {
  test.setTimeout(300_000);
  const shoot = async (name: string) => {
    if (test.info().config.metadata.screenshots) {
      await page.waitForTimeout(600); // charts finish drawing
      await page.screenshot({ path: `../../docs/screenshots/${name}.png` });
    }
  };

  // Scene 1: the executive's view of the company.
  await open(page, "/command-center", { role: "executive" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await shoot("command-center");
  if (test.info().config.metadata.screenshots) {
    // The alarm list as it looks at the start (alarms pile up later: nobody is working them).
    await viewAs(page, "Control Room Operator");
    await goTo(page, "Alarms & Events");
    await shoot("alarms");
    await viewAs(page, "Executive / VP Ops");
  }

  // Scene 2: the fault begins, and nobody can see it yet.
  await page.getByRole("button", { name: "Start demo storyline" }).click();
  await fastForwardTo(page, "Anomaly detected");

  // Scene 3: the analyst sees the prediction, before any alarm.
  await viewAs(page, "Condition Monitoring Analyst");
  await fastForwardTo(page, "Prediction raised");
  await goTo(page, "Predictive & AI");
  await page
    .getByRole("row")
    .filter({ hasText: ASSET })
    .getByRole("link", { name: /Compressor fouling/ })
    .first()
    .click();
  await settle(page);
  await expect(page.getByText("Compressor fouling").first()).toBeVisible();
  await shoot("prediction");

  // Scene 4: the alarm arrives, days after the prediction. The operator acts in two clicks.
  await fastForwardTo(page, "Alarm raised");
  await viewAs(page, "Control Room Operator");
  await openAsset(page);
  await page.getByRole("navigation", { name: "Asset sections" }).getByRole("link", { name: "Alarms" }).click();
  await page
    .getByRole("button", { name: /^Create work order from / })
    .first()
    .click();
  const dialog = page.getByRole("dialog", { name: "Create work order" });
  await dialog.getByRole("button", { name: "Create work order" }).click();
  await expect(page.getByText(/^WO-\d+ created and assigned to .+\.$/)).toBeVisible();

  // Scene 5: the planner sees it on the board.
  await viewAs(page, "Maintenance Planner");
  await goTo(page, "Maintenance");
  await expect(page.getByRole("article").filter({ hasText: ASSET }).first()).toBeVisible();
  await shoot("maintenance");

  // Scene 6: a technician in the field: the signal drops, and nothing typed is lost.
  await viewAs(page, "Field Technician");
  await page.getByRole("button", { name: /^Notifications, [1-9]\d* unread$/ }).click();
  await expect(page.getByRole("link", { name: /assigned to you/ }).first()).toBeVisible();
  await shoot("notifications");
  await page.keyboard.press("Escape");
  await goTo(page, "Field");
  await page
    .getByRole("region", { name: /^In progress/ })
    .getByRole("link")
    .first()
    .click();
  await settle(page);
  await page.getByRole("group", { name: "Steps and readings" }).getByRole("checkbox").first().check();
  await page.getByLabel(/Findings/).fill("Seal weeping at the gland; monitoring");
  const drop = page.getByRole("checkbox", { name: /^Drop the connection/ });
  await drop.check();
  await expect(page.getByText(/No connection\. Everything you've entered is kept/)).toBeVisible();
  await drop.uncheck();
  await expect(page.getByRole("button", { name: "Complete job" })).toBeVisible();

  // Scene 7: repaired and verified; the reliability engineer reads the whole story on one axis.
  await fastForwardTo(page, "Recovery verified");
  await viewAs(page, "Reliability Engineer");
  await openAsset(page);
  await page.getByRole("navigation", { name: "Asset sections" }).getByRole("link", { name: "Telemetry" }).click();
  await page.getByRole("combobox", { name: "Time range" }).selectOption({ label: "Last 7 days" });
  // Just the efficiency chart: it falls, the wash brings it back, and the events line up beneath.
  const sensors = page.getByRole("main").getByRole("checkbox");
  await sensors.first().waitFor();
  for (const box of await sensors.all()) await box.uncheck();
  await page.getByRole("checkbox", { name: /^Compressor isentropic efficiency/ }).check();
  const lanes = page.getByRole("application", { name: /^Event timeline, [1-9]\d* events/ });
  await expect(lanes).toBeVisible();
  await page.getByRole("heading", { name: /^History/ }).evaluate((h) => h.scrollIntoView());
  await expect(page.locator("figure")).toHaveCount(1);
  await shoot("asset-timeline");

  // Scene 8: back to the top: what it was worth, and asking the copilot.
  await viewAs(page, "Executive / VP Ops");
  await goTo(page, "Financials");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Open the copilot (.)" }).click();
  await page.getByRole("button", { name: "Which pumps are likely to fail in the next 30 days?" }).click();
  await expect(page.getByText(/^Read as: /)).toBeVisible();
  await shoot("copilot");
});

test("the control room theme (a README screenshot)", async ({ page }) => {
  test.skip(!test.info().config.metadata.screenshots, "only when taking the screenshots");
  await open(page, "/alarms", { role: "control_room_operator", theme: "control-room" });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "../../docs/screenshots/control-room.png" });
});
