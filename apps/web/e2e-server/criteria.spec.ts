/**
 * The acceptance criteria that depend on the backend, re-tested against the real server (Phase 5
 * review): A (the riskiest assets soon after sign-in), C (alarm to assigned work order), D (typed
 * work survives losing the connection) and F (accessibility of what server mode adds).
 */
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect, settle, test, type Theme } from "../e2e/helpers";

/** Sign in as the first person under this role heading, with saved display preferences. */
async function signIn(page: Page, roleHeading: string, path = "/", theme: Theme = "light") {
  await page.addInitScript(
    (t) =>
      localStorage.setItem(
        "pdm-preferences",
        JSON.stringify({ state: { theme: t, units: "si", timeZone: "site", role: "executive", navCollapsed: false }, version: 1 }),
      ),
    theme,
  );
  await page.goto(path);
  await page.getByRole("region", { name: roleHeading }).getByRole("button").first().click();
  await expect(page.getByText(/^Signed in as$/).first()).toBeVisible();
}

const axe = (page: Page) => new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();

test("criterion A: the five riskiest assets are on screen within 10 s of signing in", async ({ page }) => {
  await page.goto("/");
  const person = page.getByRole("region", { name: "Plant / Asset Manager" }).getByRole("button").first();
  await expect(person).toBeVisible();
  const started = Date.now();
  await person.click();
  const risks = page.locator("section", { has: page.getByRole("heading", { name: "Top risks" }) });
  await expect(risks.getByRole("row")).toHaveCount(6); // a header and five assets
  const seconds = (Date.now() - started) / 1000;
  test.info().annotations.push({ type: "app time", description: `${seconds.toFixed(2)} s (budget 10 s)` });
  expect(seconds).toBeLessThan(10);
});

test("criterion C: an alarm becomes an assigned work order in two clicks", async ({ page }) => {
  await signIn(page, "Control Room Operator", "/alarms");
  await settle(page);
  await page
    .getByRole("button", { name: /^Create work order from / })
    .first()
    .click(); // click 1
  const dialog = page.getByRole("dialog", { name: "Create work order" });
  await expect(dialog.getByLabel(/Assign to/)).not.toHaveValue("");
  await dialog.getByRole("button", { name: "Create work order" }).click(); // click 2
  await expect(page.getByText(/^WO-\d+ created and assigned to .+\.$/)).toBeVisible();
});

test("criterion D: typed work survives losing the connection, and a reload", async ({ page, context }) => {
  await signIn(page, "Field Technician", "/field");
  await settle(page);
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

  await context.setOffline(true);
  await expect(page.getByText(/No connection\. Everything you've entered is kept/)).toBeVisible();
  const complete = page.getByRole("button", { name: "Complete job" });
  await expect(complete).toBeDisabled();
  await context.setOffline(false);
  await expect(complete).toBeEnabled();

  // A reload: still signed in (the session is a cookie), and nothing typed is lost.
  await page.reload();
  await settle(page);
  await expect(page.getByText("We kept what you entered earlier on this job.")).toBeVisible();
  await expect(findings).toHaveValue("Seal leaking at the gland; replaced, testing now");
  await expect(firstStep).toBeChecked();
});

for (const theme of ["light", "dark", "control-room"] as const) {
  test(`criterion F: the sign-in page and the signed-in top bar have no accessibility problems (${theme})`, async ({ page }) => {
    await page.addInitScript(
      (t) =>
        localStorage.setItem(
          "pdm-preferences",
          JSON.stringify({ state: { theme: t, units: "si", timeZone: "site", role: "executive", navCollapsed: false }, version: 1 }),
        ),
      theme,
    );
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
    expect((await axe(page)).violations.map((v) => v.id)).toEqual([]);
    await page.getByRole("region", { name: "HSE Officer" }).getByRole("button").first().click();
    await expect(page.getByText(/^Signed in as$/).first()).toBeVisible();
    await settle(page);
    const { violations } = await axe(page);
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  });
}
