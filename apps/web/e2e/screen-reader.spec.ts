/**
 * The checkable half of the screen-reader script (docs/testing/nvda-script.md), journey by journey:
 * what a screen reader is given to work with. Where focus goes, what things are called, how big
 * tables say they are, and what's announced when something changes.
 *
 * It can't tell whether the app makes sense when listened to. That still takes a person.
 */
import type { Locator, Page } from "@playwright/test";
import { expect, open, settle, test } from "./helpers";

/** The element a screen reader would announce a change from: inside a live region. */
const live = (page: Page) => page.locator('[role="status"], [role="alert"], [aria-live="polite"], [aria-live="assertive"]');
const focused = (page: Page) => page.locator(":focus");
const nameOf = (l: Locator) => l.evaluate((e) => e.getAttribute("aria-label") ?? e.textContent ?? "");

test("journey 1: finding your way around", async ({ page }) => {
  await open(page, "/command-center", { role: "control_room_operator" });
  await expect(page).toHaveTitle(/Command Center · PdM/);
  // The first Tab lands on the skip link, and it moves focus into the page's own content.
  await page.keyboard.press("Tab");
  await expect(focused(page)).toHaveAccessibleName("Skip to main content");
  await page.keyboard.press("Enter");
  await expect(page.locator("main")).toBeFocused();
  await expect(page.getByRole("banner")).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.getByRole("navigation").first()).toBeAttached();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
});

test("journey 2: an alarm, from hearing it to acting on it", async ({ page }) => {
  await open(page, "/alarms?view=list&show=all", { role: "control_room_operator" });
  const table = page.locator("main table");
  const total = Number(await table.getAttribute("aria-rowcount"));
  expect(total).toBeGreaterThan(1);
  const row = page.locator('main tbody tr[tabindex="0"]').first();
  await expect(row).toHaveAttribute("aria-rowindex", "2");
  await expect(row).toHaveAccessibleName(/^P\d /);

  // Acknowledging is announced.
  await page.goto("/alarms?view=list&show=unacked");
  await settle(page);
  await page.locator('main tbody tr[tabindex="0"]').first().focus();
  await page.keyboard.press("a");
  await expect(
    live(page)
      .filter({ hasText: /acknowledged/i })
      .first(),
  ).toBeAttached();

  // A dialog takes focus, names every field, and gives focus back when it closes.
  const opener = page.getByRole("button", { name: /^Create work order from / }).first();
  await opener.focus();
  const name = await nameOf(opener);
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Create work order" });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(":focus")).toHaveCount(1);
  for (const field of await dialog.locator("input:not([type=hidden]), select, textarea").all()) {
    expect(await field.evaluate((e) => (e as HTMLInputElement).labels?.length ?? 0), "every field has a label").toBeGreaterThan(0);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(focused(page)).toHaveAttribute("aria-label", name);
});

test("escalating an alarm from the keyboard is announced, and the alarm says where it went", async ({ page }) => {
  await open(page, "/alarms?view=list&show=unacked", { role: "control_room_operator" });
  await page.locator('main tbody tr[tabindex="0"]').first().focus();
  await page.keyboard.press("e");
  await expect(
    live(page)
      .filter({ hasText: /escalated to / })
      .first(),
  ).toBeAttached();
  await expect(page.getByText(/^escalated to /).first()).toBeVisible();
});

test("a burst of alarms shows what came first, and shrinks to it", async ({ page }) => {
  await open(page, "/alarms?view=list&show=all&priority=p2", { role: "control_room_operator" });
  await expect(page.getByText(/^first out · \d+ followed$/).first()).toBeVisible();
  await page.getByRole("button", { name: /^P2 High/ }).click();
  const count = async () =>
    Number(/^(\d+) alarm/.exec((await page.getByRole("heading", { name: /^\d+ alarms?$/ }).textContent()) ?? "")?.[1]);
  const all = await count();
  await page.getByRole("checkbox", { name: "Hide follow-on alarms" }).check();
  await expect(page).toHaveURL(/causes=on/);
  await expect.poll(count).toBeLessThan(all);
});

test("the on-call list opens from the keyboard and names each step", async ({ page }) => {
  await open(page, "/alarms", { role: "control_room_operator" });
  const summary = page.locator("summary", { hasText: "On call now" });
  await summary.focus();
  await page.keyboard.press("Enter");
  const table = page.getByRole("table", { name: "On call now" });
  await expect(table.getByRole("columnheader", { name: "Plant / Asset Manager" })).toBeVisible();
  expect(await table.getByRole("row").count()).toBeGreaterThan(3);
});

test("journey 3: a machine's history", async ({ page }) => {
  await open(page, "/assets/PBU-PMP-106/telemetry?range=30d", { role: "reliability_engineer" });
  await expect(page.locator("figure [role=img]").first()).toHaveAccessibleName(/.{30,}/);
  const lanes = page.getByRole("application", { name: /^Event timeline, [1-9]\d* events/ });
  await expect(lanes).toHaveAccessibleDescription(/step through events/);
  await lanes.focus();
  await page.keyboard.press("ArrowRight");
  await expect(live(page).getByRole("region", { name: "Selected event" })).toBeAttached();
});

test("journey 4: vibration, by ear", async ({ page }) => {
  await open(page, "/assets/GCM-CMP-105/vibration", { role: "condition_analyst" });
  // Arrow keys must reach these charts: "application" tells NVDA to switch to focus mode by itself.
  for (const [name, keys, said] of [
    [/^Vibration spectrum of/, ["ArrowRight"], / Hz/],
    [/^Weekly vibration spectra/, ["ArrowRight"], / Hz, /],
    [/^Shaft orbit at/, ["PageDown", "ArrowRight"], /^Turn 2 of /],
  ] as const) {
    const chart = page.getByRole("application", { name });
    await chart.focus();
    for (const key of keys) await page.keyboard.press(key);
    await expect(live(page).filter({ hasText: said }).first()).toBeAttached();
  }
});

test("journey 5: planning work without a mouse", async ({ page }) => {
  await open(page, "/maintenance", { role: "maintenance_planner" });
  await expect(page.getByRole("region", { name: /^Requested, \d+ work orders?$/ })).toBeAttached();
  const move = page.getByRole("button", { name: /^Move to… WO-/ }).first();
  await move.focus();
  await page.keyboard.press("Enter");
  // The popover takes focus, on its first choice.
  await expect(page.getByRole("button", { name: "Triage" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(
    live(page)
      .filter({ hasText: /is now /i })
      .first(),
  ).toBeAttached();
});

test("journey 6: a job in the field, offline", async ({ page, context }) => {
  await open(page, "/field", { role: "field_technician" });
  await page
    .getByRole("region", { name: /^In progress/ })
    .getByRole("link")
    .first()
    .click();
  await settle(page);
  for (const box of await page.getByRole("group", { name: "Steps and readings" }).getByRole("checkbox").all()) {
    await expect(box).toHaveAccessibleName(/.+/);
  }
  await context.setOffline(true);
  await expect(
    live(page)
      .filter({ hasText: /No connection/ })
      .first(),
  ).toBeAttached();
  await context.setOffline(false);
});

test("the notification bell says how many are unread, and each item leads to its subject", async ({ page }) => {
  await open(page, "/command-center", { role: "field_technician" });
  const bell = page.getByRole("button", { name: /^Notifications, [1-9]\d* unread$/ });
  await expect(
    live(page)
      .filter({ hasText: /unread notifications?/ })
      .first(),
  ).toBeAttached();
  await bell.focus();
  await page.keyboard.press("Enter");
  const panel = page.getByRole("heading", { name: "Notifications" });
  await expect(panel).toBeVisible();
  const before = Number(/(\d+)/.exec((await bell.getAttribute("aria-label")) ?? "")?.[1]);
  await page
    .getByRole("link", { name: /^Unread: WO-\d+ assigned to you/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/maintenance\/.+|\/field\/.+/);
  await expect(page.getByRole("button", { name: `Notifications, ${before - 1} unread` })).toBeVisible();
});

test("journey 7: asking and searching", async ({ page }) => {
  await open(page, "/command-center", { role: "plant_manager" });
  await page.keyboard.press("Control+k");
  const box = page.getByRole("combobox", { name: "Search pages, assets and actions" });
  await expect(box).toBeFocused();
  await box.fill("pump");
  await expect(
    live(page)
      .filter({ hasText: /\d+ results?/ })
      .first(),
  ).toBeAttached();
  await page.keyboard.press("ArrowDown");
  await expect(box).toHaveAttribute("aria-activedescendant", /.+/);
  await page.keyboard.press("Escape");

  await page.getByRole("button", { name: "Open the copilot (.)" }).click();
  await page.getByRole("button", { name: "Which pumps are likely to fail in the next 30 days?" }).click();
  await expect(page.getByText(/^Read as: /)).toBeVisible();
  await expect(
    live(page)
      .filter({ hasText: /.{20,}/ })
      .first(),
  ).toBeAttached();
  await page.keyboard.press("Escape");

  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
});
