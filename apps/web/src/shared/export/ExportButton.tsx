/**
 * The Export button (spec §6.13: "with row limits and audit logging"). It exports every row that
 * matches the filters on screen, not just the page showing, up to a limit, and records the export
 * in the audit log. Hidden when printing.
 */
import { useApiMutation } from "@pdm/api-client";
import { Button } from "@pdm/ui";
import { Download } from "lucide-react";
import { useState, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { useSimNow } from "../sim-time";
import { useToasts } from "../toast";
import { download, toCsv, type Cell } from "./csv";

const MAX_ROWS = 10_000;
const PAGE = 500;

export interface ExportColumn<T> {
  header: string;
  value: (row: T) => Cell;
}

type Page<T> = { items: readonly T[]; total: number };
type Sheet = { headers: string[]; rows: Cell[][]; total: number };

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
  const run = async (build: () => Promise<Sheet>) => {
    setBusy(true);
    try {
      const { headers, rows, total } = await build();
      const date = new Date(now).toISOString().slice(0, 10);
      download(`${what.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}-${date}.csv`, toCsv(headers, rows), "text/csv;charset=utf-8");
      await record.mutateAsync({ what, rows: rows.length, format: "csv" });
      toast("success", rows.length < total ? t("export.capped", { rows: rows.length, total }) : t("export.done", { count: rows.length }));
    } catch {
      toast("error", t("export.failed"));
    } finally {
      setBusy(false);
    }
  };
  return { run, busy, label: t(busy ? "export.working" : "export.csv", { what }) };
}

function Control({ onClick, busy, label, what }: { onClick: () => void; busy: boolean; label: string; what: string }) {
  const { t } = useTranslation();
  return (
    <Button size="sm" onClick={onClick} disabled={busy} aria-label={t("export.named", { what })} className="print:hidden">
      <Download aria-hidden className="size-4" />
      {label}
    </Button>
  );
}

export function ExportButton<T>({
  what,
  columns,
  load,
}: {
  /** What this is, in words: names the file, the button and the audit entry. */
  what: string;
  columns: readonly ExportColumn<T>[];
  load: (page: { offset: number; limit: number }) => Promise<Page<T>>;
}) {
  const { run, busy, label } = useExport(what);
  const build = async () => {
    const { rows, total } = await allRows(load);
    return { headers: columns.map((c) => c.header), rows: rows.map((r) => columns.map((c) => c.value(r))), total };
  };
  return <Control onClick={() => void run(build)} busy={busy} label={label} what={what} />;
}

/** For a table already complete on screen: exports what it shows. */
export function TableExportButton({ what, table }: { what: string; table: RefObject<HTMLTableElement | null> }) {
  const { run, busy, label } = useExport(what);
  const text = (cell: Element) => (cell.textContent ?? "").trim();
  const build = () => {
    const el = table.current;
    const headers = [...(el?.querySelectorAll("thead th") ?? [])].map(text);
    const rows = [...(el?.querySelectorAll("tbody tr") ?? [])].map((tr) => [...tr.children].map(text));
    return Promise.resolve({ headers, rows, total: rows.length });
  };
  return <Control onClick={() => void run(build)} busy={busy} label={label} what={what} />;
}
