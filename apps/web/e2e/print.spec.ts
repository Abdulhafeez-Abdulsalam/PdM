/**
 * Reports print (Phase 4, chunk 6): on paper only the report shows. The top bar, alarm bar,
 * menu, page header and Print button all hide, and the browser can make a PDF of it.
 * Needs a real browser: jsdom has no print media.
 */
import { expect, open, test } from "./helpers";

for (const [url, title] of [
  ["/reports/weekly-reliability", "Weekly reliability report"],
  ["/reports/handover", /shift handover/],
] as const) {
  test(`${url} prints only the report`, async ({ page }) => {
    await open(page, url, { role: "plant_manager" });
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    await page.emulateMedia({ media: "print" });
    for (const hidden of [
      page.getByRole("banner"),
      page.getByRole("region", { name: "Alarm summary" }),
      page.getByRole("navigation", { name: "Main navigation" }),
      page.getByRole("navigation", { name: "Reports pages" }),
      page.getByRole("button", { name: "Print or save as PDF" }),
    ])
      await expect(hidden).toBeHidden();
    await expect(page.getByRole("heading", { level: 2, name: title })).toBeVisible();
    const pdf = await page.pdf({ format: "A4" });
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });
}
