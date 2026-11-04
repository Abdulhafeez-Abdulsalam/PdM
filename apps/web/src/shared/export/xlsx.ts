/**
 * Turning an export into an Excel workbook (write-excel-file). Numbers and dates are real ones, so
 * they sort and add up. Text is stored as text, so unlike CSV it can't run as a formula.
 * This file is loaded only when someone exports to Excel.
 */
import writeExcelFile, { type Row, type Sheet as ExcelSheet } from "write-excel-file/browser";
import type { Cell } from "./csv";
import { isTimestamp, sheetName, type Sheet } from "./sheet";

const DATE_FORMAT = "yyyy-mm-dd hh:mm";
const MAX_WIDTH = 48;

function toCell(cell: Cell): Row[number] {
  if (cell === null) return null;
  if (typeof cell === "number") return { value: cell };
  return isTimestamp(cell) ? { value: new Date(cell), format: DATE_FORMAT } : { value: cell };
}

export async function toWorkbook(sheets: readonly Sheet[]): Promise<Blob> {
  const taken = new Set<string>();
  const out = sheets.map((sheet): ExcelSheet<never> => {
    const name = sheetName(sheet.name, taken);
    taken.add(name.toLowerCase());
    const data: Row[] = [];
    const widths: number[] = [];
    const measure = (i: number, text: string) => (widths[i] = Math.min(MAX_WIDTH, Math.max(widths[i] ?? 8, text.length + 2)));
    sheet.tables.forEach((table, n) => {
      if (n > 0) data.push([]);
      if (sheet.tables.length > 1 && table.title) data.push([{ value: table.title, fontWeight: "bold" }]);
      table.headers.forEach((h, i) => measure(i, h));
      data.push(table.headers.map((value) => ({ value, fontWeight: "bold" })));
      for (const row of table.rows) {
        row.forEach((cell, i) => measure(i, String(cell ?? "")));
        data.push(row.map(toCell));
      }
    });
    return { data, sheet: name, columns: widths.map((width) => ({ width })), stickyRowsCount: sheet.tables.length === 1 ? 1 : 0 };
  });
  return writeExcelFile(out).toBlob();
}
