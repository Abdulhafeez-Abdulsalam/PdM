/**
 * The Export buttons (spec §6.13: "with row limits and audit logging"). They export every row that
 * matches the filters on screen, not just the page showing, up to a limit, as CSV or Excel, and
 * record the export in the audit log. Hidden when printing.
 */
import { useApiMutation } from "@pdm/api-client";
import { Button } from "@pdm/ui";
import { Download, FileSpreadsheet } from "lucide-react";
import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useSimNow } from "../sim-time";
import { useToasts } from "../toast";
import { download, toCsv, type Cell } from "./csv";
import { numericCell, readTable, type Sheet } from "./sheet";

const MAX_ROWS = 10_000;
const PAGE = 500;
const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => Cell;
}

type Page<T> = { items: readonly T[]; total: number };
type Format = "csv" | "xlsx";
type Built = { sheets: Sheet[]; rows: number; total: number };

/** Fetch every page, up to the limit. */
async function allRows<T>(load: (page: { offset: number; limit: number }) => Promise<Page<T>>) {
  const rows: T[] = [];
  let total = 0;
  do {
    const page = await load({ offset: rows.length, limit: PAGE });
    total = page.total;
    if (page.items.length === 0) break;
    rows.push(...page.items);
  } while (rows.length < Math.min(total, MAX_ROWS));
  return { rows: rows.slice(0, MAX_ROWS), total };
}

function useExport(what: string) {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.show);
  const record = useApiMutation("exports.record");
  const { now } = useSimNow();
  const [busy, setBusy] = useState(false);
  const run = async (format: Format, build: () => Promise<Built>) => {
    setBusy(true);
    try {
      const { sheets, rows, total } = await build();
      const name = `${what.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${new Date(now).toISOString().slice(0, 10)}`;
      if (format === "csv") {
        const [table] = sheets[0]?.tables ?? [];
        download(`${name}.csv`, toCsv(table?.headers ?? [], table?.rows ?? []), "text/csv;charset=utf-8");
      } else {
        // Loaded only now: most visits never export, so they don't pay for it.
        const { toWorkbook } = await import("./xlsx");
        download(`${name}.xlsx`, await toWorkbook(sheets), XLSX_TYPE);
      }
      await record.mutateAsync({ what, rows, format });
      toast("success", rows < total ? t("export.capped", { rows, total }) : t("export.done", { count: rows }));
    } catch {
      toast("error", t("export.failed"));
    } finally {
      setBusy(false);
    }
  };
  return { run, busy };
}

function Controls({
  what,
  busy,
  onExport,
  csv = true,
}: {
  what: string;
  busy: boolean;
  onExport: (format: Format) => void;
  csv?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <span className="flex gap-1 print:hidden">
      {csv && (
        <Button size="sm" onClick={() => onExport("csv")} disabled={busy} aria-label={t("export.namedCsv", { what })}>
          <Download aria-hidden className="size-4" />
          {t("export.csv")}
        </Button>
      )}
      <Button size="sm" onClick={() => onExport("xlsx")} disabled={busy} aria-label={t("export.namedXlsx", { what })}>
        <FileSpreadsheet aria-hidden className="size-4" />
        {t("export.xlsx")}
      </Button>
    </span>
  );
}

export function ExportButton<T>({
  what,
  columns,
  load,
}: {
  /** What this is, in words: names the file, the buttons and the audit entry. */
  what: string;
  columns: readonly ExportColumn<T>[];
  load: (page: { offset: number; limit: number }) => Promise<Page<T>>;
}) {
  const { run, busy } = useExport(what);
  const build = async () => {
    const { rows, total } = await allRows(load);
    const table = { headers: columns.map((c) => c.header), rows: rows.map((r) => columns.map((c) => c.value(r))) };
    return { sheets: [{ name: what, tables: [table] }], rows: rows.length, total };
  };
  return <Controls what={what} busy={busy} onExport={(format) => void run(format, build)} />;
}

/** For a table already complete on screen: exports what it shows. */
export function TableExportButton({ what, table }: { what: string; table: RefObject<HTMLTableElement | null> }) {
  const { run, busy } = useExport(what);
  const build = () => {
    const read = table.current ? readTable(table.current) : { headers: [], rows: [] };
    const rows = read.rows.map((r) => r.map(numericCell));
    return Promise.resolve({ sheets: [{ name: what, tables: [{ headers: read.headers, rows }] }], rows: rows.length, total: rows.length });
  };
  return <Controls what={what} busy={busy} onExport={(format) => void run(format, build)} />;
}

/** A whole report as one workbook: one sheet for each section. */
export function ReportExportButton({ what, report }: { what: string; report: RefObject<HTMLElement | null> }) {
  const { run, busy } = useExport(what);
  const build = () => {
    const sections = [...(report.current?.querySelectorAll("section") ?? [])];
    const sheets = sections.map((section) => ({
      name: section.querySelector("h3")?.textContent ?? what,
      tables: [...section.querySelectorAll("table")].map((el) => {
        const { title, headers, rows } = readTable(el);
        return { title, headers, rows: rows.map((r) => r.map(numericCell)) };
      }),
    }));
    const rows = sheets.reduce((n, s) => n + s.tables.reduce((m, table) => m + table.rows.length, 0), 0);
    return Promise.resolve({ sheets, rows, total: rows });
  };
  return <Controls what={what} busy={busy} csv={false} onExport={(format) => void run(format, build)} />;
}
