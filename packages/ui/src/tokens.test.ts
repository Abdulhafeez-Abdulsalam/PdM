/**
 * Every text colour must be readable on every background, in every theme (WCAG 2.1 AA:
 * contrast of at least 4.5 : 1 for normal text). Health colours count as text because
 * badges write their label in that colour. Checked from tokens.css itself, so a colour
 * change that breaks readability fails here instead of in someone's control room.
 */
import { describe, expect, it } from "vitest";
import tokens from "./tokens.css?raw";

const THEMES = ["light", "dark", "control-room"] as const;
const AA = 4.5;

function themeTokens(theme: string): Map<string, string> {
  // Up to the first "}" at the start of a line.
  const block = new RegExp(String.raw`\[data-theme="${theme}"\]\s*\{([\s\S]*?)\r?\n\}`).exec(tokens)?.[1];
  if (!block) throw new Error(`No [data-theme="${theme}"] block in tokens.css`);
  return new Map([...block.matchAll(/--pdm-([\w-]+):\s*(#[0-9a-fA-F]{6})\b/g)].map((m) => [m[1]!, m[2]!]));
}

/** Relative luminance (WCAG 2.1 definition). */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("contrast", () => {
  it("matches known values", () => {
    expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrast("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
  });
});

describe.each(THEMES)("%s theme", (theme) => {
  const t = themeTokens(theme);
  const backgrounds = [...t].filter(([name]) => name.startsWith("bg-"));
  const texts = [...t].filter(([name]) => name.startsWith("text-") || name.startsWith("health-"));

  it("defines backgrounds and text colours", () => {
    expect(backgrounds.length).toBeGreaterThanOrEqual(4);
    expect(texts.length).toBeGreaterThanOrEqual(9);
  });

  it.each(texts)("%s is readable on every background", (_name, colour) => {
    for (const [bg, bgColour] of backgrounds) expect(contrast(colour, bgColour), `on ${bg}`).toBeGreaterThanOrEqual(AA);
  });

  it("button text is readable on the accent colour", () => {
    expect(contrast(t.get("accent-text")!, t.get("accent")!)).toBeGreaterThanOrEqual(AA);
  });
});
