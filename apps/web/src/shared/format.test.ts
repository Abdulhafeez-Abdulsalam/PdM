import { describe, expect, it } from "vitest";
import { formatAgo, formatCompact, formatCurrency, formatProbability } from "./format";

describe("format", () => {
  it("formats probabilities, compact numbers and money", () => {
    expect(formatProbability(0.724)).toBe("72%");
    expect(formatCompact(1_250_000)).toBe("1.3M");
    expect(formatCurrency(21_570_667, "USD")).toBe("$21.6M");
  });

  it("describes how long ago something happened", () => {
    const now = 1_000_000_000;
    expect(formatAgo(now - 12_000, now)).toMatch(/12 sec/);
    expect(formatAgo(now - 3 * 3_600_000, now)).toMatch(/3 hr/);
  });
});
