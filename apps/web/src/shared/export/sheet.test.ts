import { describe, expect, it } from "vitest";
import { isTimestamp, numericCell, sheetName } from "./sheet";

describe("numericCell", () => {
  it("turns plain numbers on the page into numbers", () => {
    expect(numericCell("1,234.5")).toBe(1234.5);
    expect(numericCell("-7")).toBe(-7);
  });
  it("leaves anything else as it is shown", () => {
    for (const text of ["$1.2M", "87 %", "4/5", "WO-10", "1,23"]) expect(numericCell(text)).toBe(text);
    expect(numericCell("")).toBeNull();
  });
});

describe("sheetName", () => {
  it("keeps to the limits Excel sets", () => {
    const name = sheetName("Rates: a/b [very] long name that keeps on going", new Set());
    expect(name.length).toBeLessThanOrEqual(31);
    for (const banned of "[]:*?/") expect(name).not.toContain(banned);
  });
  it("never repeats a name", () => {
    expect(sheetName("Costs", new Set(["costs"]))).toBe("Costs (2)");
    expect(sheetName("Costs", new Set(["costs", "costs (2)"]))).toBe("Costs (3)");
  });
});

describe("isTimestamp", () => {
  it("knows a backend time from other text", () => {
    expect(isTimestamp("2026-11-04T08:00:00.000Z")).toBe(true);
    expect(isTimestamp("2026 plan")).toBe(false);
    expect(isTimestamp(5)).toBe(false);
  });
});
