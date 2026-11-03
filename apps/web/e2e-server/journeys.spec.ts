/**
 * Whole journeys against the real server: sign in, real role checks, live values over the
 * WebSocket, changes kept in the database, and the security headers. Like the demo-mode tests,
 * any error in the browser console fails the test.
 */
import type { Page } from "@playwright/test";
import { expect, settle, test } from "../e2e/helpers";

/** Sign in from the sign-in page as the first person under this role heading. */
async function signIn(page: Page, roleHeading: string, path = "/") {
  await page.goto(path);
  const group = page.getByRole("region", { name: roleHeading });
  await group.getByRole("button").first().click();
  await expect(page.getByText(/^Signed in as$/).first()).toBeVisible();
  await settle(page);
}

test("sign in, and the role decides what the screen offers and what the server allows", async ({ page }) => {
  // The unacknowledged list: every row there would offer Acknowledge to someone allowed to. (The
  // list draws only the rows in view, so on the full list those could all be acknowledged ones.)
  await signIn(page, "Executive / VP Ops", "/alarms?view=list&show=unacked");
  await expect(page.getByRole("row", { name: /^P\d / }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /^Acknowledge ALM-/ })).toHaveCount(0);
  // A page with its button hidden could still send the request: the server refuses it.
  const alarms = await page.request.get('/api/alarms?states=["active_unacked"]&limit=1');
  const [alarm] = ((await alarms.json()) as { items: { id: string }[] }).items;
  const refused = await page.request.post("/api/alarms/acknowledge", { data: { alarmIds: [alarm!.id] } });
  expect(refused.status()).toBe(403);
});

test("an operator acknowledges an alarm, and it stays acknowledged after a reload", async ({ page }) => {
  // Unacknowledged ones only: the list draws just the rows in view, and on the full list those
  // can all be acknowledged already.
  await signIn(page, "Control Room Operator", "/alarms?view=list&show=unacked");
  const ack = page.getByRole("button", { name: /^Acknowledge ALM-/ }).first();
  const id = ((await ack.getAttribute("aria-label")) ?? "").replace("Acknowledge ", "");
  type Listed = { items: { id: string; assetId: string; state: string }[] };
  const before = (await (await page.request.get('/api/alarms?states=["active_unacked","rtn_unacked"]&limit=500')).json()) as Listed;
  const { assetId } = before.items.find((a) => a.id === id)!;
  await ack.click();
  await expect(page.getByRole("button", { name: `Acknowledge ${id}` })).toHaveCount(0);
  await page.reload();
  await settle(page);
  // Acknowledged, an active alarm stays (active_acked); one that had already returned to normal
  // is cleared, and the alarm list leaves cleared alarms out unless asked: so ask for both.
  const after = (await (
    await page.request.get(`/api/alarms?assetId="${assetId}"&states=["active_acked","cleared"]&limit=500`)
  ).json()) as Listed;
  expect(after.items.find((a) => a.id === id)?.state).toMatch(/^(active_acked|cleared)$/);
});

test("live values arrive over the WebSocket", async ({ page }) => {
  await signIn(page, "Plant / Asset Manager", "/assets/CBC-GT-101/overview");
  await expect(page.getByRole("status").filter({ hasText: "Live" }).first()).toBeAttached();
  const values = page.getByRole("region", { name: "Key live values" });
  await expect(values.getByText(/\d+(\.\d+)?\s*°C/).first()).toBeVisible();
});

test("signing out goes back to the sign-in page, and stays there after a reload", async ({ page }) => {
  await signIn(page, "Maintenance Planner");
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Sign in", level: 1 })).toBeVisible();
  expect((await page.request.get("/api/assets")).status()).toBe(401);
});

test("every page carries the security headers", async ({ page }) => {
  const response = await page.goto("/command-center");
  const headers = response!.headers();
  expect(headers["content-security-policy"]).toContain("script-src 'self'");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("no-referrer");
});

test("the overlays open under the Content Security Policy: copilot, command palette, shortcut sheet", async ({ page }) => {
  // Each adds a style to stop the page behind it scrolling; without the page's nonce the browser
  // would block it and log an error, which fails this test.
  await signIn(page, "Plant / Asset Manager", "/command-center");
  await page.getByRole("button", { name: "Open the copilot (.)" }).click();
  await page.getByRole("button", { name: "Which pumps are likely to fail in the next 30 days?" }).click();
  await expect(page.getByText(/^Read as: /)).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search pages, assets and actions" }).fill("pump");
  await expect(page.getByRole("option").first()).toBeVisible();
  await page.keyboard.press("Escape");
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog", { name: "Keyboard shortcuts" })).toBeVisible();
  expect(await page.evaluate(() => document.querySelectorAll("style[nonce]").length)).toBeGreaterThan(0);
});
