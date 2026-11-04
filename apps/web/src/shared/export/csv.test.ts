import { describe, expect, it } from "vitest";
import { toCsv } from "./csv";

const body = (csv: string) => csv.replace(/^\uFEFF/, "");

describe("toCsv", () => {
  it("starts with the mark that tells Excel it is UTF-8, and ends each line the Windows way", () => {
    const csv = toCsv(["A"], [["°C"]]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(body(csv)).toBe("A\r\n°C\r\n");
  });

  it("quotes commas, quotes and line breaks", () => {
    expect(body(toCsv(["A", "B"], [['say "hi"', "a,b"]]))).toBe('A,B\r\n"say ""hi""","a,b"\r\n');
    expect(body(toCsv(["A"], [["two\nlines"]]))).toBe('A\r\n"two\nlines"\r\n');
  });

  it("can't be made to run a formula", () => {
    for (const bad of ["=SUM(A1)", "+1", "-1", "@cmd"]) expect(body(toCsv(["A"], [[bad]]))).toBe(`A\r\n'${bad}\r\n`);
  });

  it("leaves numbers as numbers, even negative ones, and empties empty", () => {
    expect(body(toCsv(["A", "B"], [[-3.5, null]]))).toBe("A,B\r\n-3.5,\r\n");
  });
});
