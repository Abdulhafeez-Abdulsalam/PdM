/** What an export is made of, whichever format it ends up in. */
import type { Cell } from "./csv";

export interface SheetTable {
  title?: string;
  headers: string[];
  rows: Cell[][];
}

export interface Sheet {
  name: string;
  tables: SheetTable[];
}

/** Read a table on the page as text. */
export function readTable(table: HTMLTableElement): { title: string; headers: string[]; rows: string[][] } {
  const text = (cell: Element) => (cell.textContent ?? "").trim();
  return {
    title: text(table.querySelector("caption") ?? document.createElement("span")),
    headers: [...table.querySelectorAll("thead th")].map(text),
    rows: [...table.querySelectorAll("tbody tr")].map((tr) => [...tr.children].map(text)),
  };
}

/** "1,234.5" on the page is a number in a spreadsheet. "$1.2M" and "87 %" stay as they're shown. */
export function numericCell(text: string): Cell {
  if (text === "") return null;
  return /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/.test(text) ? Number(text.replaceAll(",", "")) : text;
}

/** Excel's limits on a sheet's name: 31 characters, none of []:*?/\ and each one different. */
export function sheetName(wanted: string, taken: ReadonlySet<string>): string {
  const clean = wanted.replaceAll(/[[\]:*?/\\]/g, " ").trim() || "Sheet";
  let name = clean.slice(0, 31).trim();
  for (let n = 2; taken.has(name.toLowerCase()); n++) name = `${clean.slice(0, 27).trim()} (${n})`;
  return name;
}

const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A timestamp from the backend is a real date in a spreadsheet. */
export function isTimestamp(cell: Cell): boolean {
  return typeof cell === "string" && ISO_TIME.test(cell);
}
