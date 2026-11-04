/**
 * Turning rows into a CSV file that opens cleanly in Excel.
 *   - A byte-order mark at the start tells Excel the file is UTF-8, so "°C" and "é" survive.
 *   - Text starting with = + - @ gets a leading apostrophe: otherwise a spreadsheet would run it as
 *     a formula, and alarm messages or comments can hold anything ("formula injection").
 *   - Numbers stay numbers, so a negative value isn't touched.
 */
export type Cell = string | number | null;

const BOM = "﻿";
const FORMULA_START = /^[=+\-@\t\r]/;

function field(cell: Cell): string {
  if (cell === null) return "";
  if (typeof cell === "number") return String(cell);
  const text = FORMULA_START.test(cell) ? `'${cell}` : cell;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(headers: readonly string[], rows: readonly (readonly Cell[])[]): string {
  return BOM + [headers, ...rows].map((row) => row.map(field).join(",")).join("\r\n") + "\r\n";
}

/** Give the browser a file to save. */
export function download(fileName: string, contents: BlobPart, type: string): void {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
