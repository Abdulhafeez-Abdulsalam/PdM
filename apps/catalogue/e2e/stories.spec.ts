/**
 * Every story, in every theme: axe finds no accessibility problems (WCAG 2.1 A and AA, including
 * colour contrast), and on Windows it matches its saved screenshot. The story list comes from the
 * Storybook just built (storybook-static/index.json), so a new story is tested without listing it.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

const THEMES = ["light", "dark", "control-room"] as const;
// Screenshots differ slightly between operating systems' font drawing; the saved ones are Windows'.
const compareScreenshots = process.platform === "win32" && !process.env.CI;

interface Entry {
  type: string;
  id: string;
  title: string;
  name: string;
}
const index = JSON.parse(readFileSync(new URL("../storybook-static/index.json", import.meta.url), "utf8")) as {
  entries: Record<string, Entry>;
};
const stories = Object.values(index.entries).filter((e) => e.type === "story");

async function show(page: Page, id: string, theme: string) {
  await page.goto(`/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`);
  await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
  await expect(page.locator("#storybook-root > *").first()).toBeAttached();
  await page.evaluate(() => document.fonts.ready);
  // Charts draw on the next frames; let them settle.
  await page.waitForTimeout(page.url().includes("charts-") ? 600 : 150);
}

for (const story of stories) {
  test(`${story.title} › ${story.name}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    const failures: string[] = [];
    for (const theme of THEMES) {
      await show(page, story.id, theme);
      const { violations } = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        // About Storybook's own page around the story, not the components.
        .disableRules(["document-title", "html-has-lang"])
        .analyze();
      for (const v of violations) failures.push(`[${theme}] ${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);
      if (compareScreenshots) await expect(page).toHaveScreenshot(`${story.id}--${theme}.png`);
    }
    expect(failures).toEqual([]);
    // The "Failed" story throws on purpose, and its boundary catches it; nothing else may throw.
    expect(errors.filter((m) => !m.includes("unexpected shape"))).toEqual([]);
  });
}
