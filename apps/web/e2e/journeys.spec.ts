/** Whole user journeys in a real browser, on the production build. */
import { expect, open, settle, test, type Role } from "./helpers";

test("criterion C: an alarm becomes an assigned work order in two clicks", async ({ page }) => {
  await open(page, "/alarms", { role: "control_room_operator" });
  const create = page.getByRole("button", { name: /^Create work order from / }).first();
  const started = Date.now();
  await create.click(); // click 1
  const dialog = page.getByRole("dialog", { name: "Create work order" });
  await expect(dialog.getByText(/Attach a snapshot of [1-9]\d* current reading/)).toBeVisible();
  await expect(dialog.getByLabel(/Assign to/)).not.toHaveValue("");
  await dialog.getByRole("button", { name: "Create work order" }).click(); // click 2
  await expect(page.getByText(/^WO-\d+ created and assigned to .+\.$/)).toBeVisible();
  const seconds = (Date.now() - started) / 1000;
  test.info().annotations.push({ type: "app time", description: `${seconds.toFixed(2)} s (budget 30 s, including a person)` });
  expect(seconds).toBeLessThan(5);
});

test("criterion D: typed work survives the browser going offline, and a reload", async ({ page, context }) => {
  await open(page, "/field", { role: "field_technician" });
  await page
    .getByRole("region", { name: /^In progress/ })
    .getByRole("link")
    .first()
    .click();
  await settle(page);
  const work = page.getByRole("group", { name: "Steps and readings" });
  const firstStep = work.getByRole("checkbox").first();
  await firstStep.check();
  const findings = page.getByLabel(/Findings/);
  await findings.fill("Seal leaking at the gland; replaced, testing now");

  // The network goes away (out of coverage). The browser's own offline signal drives this.
  await context.setOffline(true);
  await expect(page.getByText(/No connection\. Everything you've entered is kept/)).toBeVisible();
  const complete = page.getByRole("button", { name: "Complete job" });
  await expect(complete).toBeDisabled();

  // Back in coverage; the technician reloads the page. Nothing typed is lost.
  await context.setOffline(false);
  await expect(complete).toBeEnabled();
  await page.reload();
  await settle(page);
  await expect(page.getByText("We kept what you entered earlier on this job.")).toBeVisible();
  await expect(findings).toHaveValue("Seal leaking at the gland; replaced, testing now");
  await expect(firstStep).toBeChecked();

  // Finish the job and submit.
  for (const box of await work.getByRole("checkbox").all()) await box.check();
  for (const reading of await work.getByRole("textbox").all()) await reading.fill("1");
  await complete.click();
  await expect(page).toHaveURL(/\/field$/);
  await expect(page.getByText(/completed and sent for verification/)).toBeVisible();
});

test("a long alarm list draws only the rows in view, and the keyboard still walks all of it", async ({ page }) => {
  await open(page, "/alarms?view=list&show=all", { role: "control_room_operator" });
  const table = page.locator("main table");
  const total = Number(await table.getAttribute("aria-rowcount")) - 1; // less the header row
  test.skip(total <= 100, `only ${total} alarms right now: too few to need virtualising`);
  const drawn = page.locator('main tbody tr[tabindex="0"]');
  expect(await drawn.count()).toBeLessThan(60); // of `total`
  // Screen readers are told every row's place in the whole list.
  await drawn.first().focus();
  for (let n = 0; n < 80; n++) await page.keyboard.press("ArrowDown");
  const focused = page.locator(":focus");
  await expect(focused).toHaveAttribute("aria-rowindex", "82");
  await expect(focused).toBeInViewport();
});

test("the plant manager approves work by dragging the card with the mouse", async ({ page }) => {
  await open(page, "/maintenance", { role: "plant_manager" });
  const scheduled = page.getByRole("region", { name: /^Scheduled, \d+ work orders$/ });
  const card = scheduled.getByRole("article").first();
  const number = (await card.getAttribute("aria-label"))!.split(":")[0]!;
  const approved = page.getByRole("region", { name: /^Approved, \d+ work orders$/ });

  const from = (await card.getByRole("button", { name: `Drag ${number}` }).boundingBox())!;
  const to = (await approved.boundingBox())!;
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(to.x + to.width / 2, to.y + 120, { steps: 15 });
  await page.mouse.up();

  await expect(page.getByText(`${number} is now Approved.`)).toBeVisible();
  await expect(approved.getByRole("article", { name: new RegExp(`^${number}:`) })).toBeVisible();
});

const HOMES: [Role, string][] = [
  ["executive", "/command-center"],
  ["plant_manager", "/command-center"],
  ["reliability_engineer", "/reliability"],
  ["condition_analyst", "/predictive"],
  ["control_room_operator", "/command-center"],
  ["maintenance_planner", "/maintenance"],
  ["field_technician", "/field"],
];

for (const [role, home] of HOMES) {
  test(`${role} lands on ${home}`, async ({ page }) => {
    await open(page, "/", { role });
    await expect.poll(() => new URL(page.url()).pathname).toBe(home);
  });
}
