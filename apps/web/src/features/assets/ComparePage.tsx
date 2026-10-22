/**
 * Fleet comparison (spec §6.2: "benchmark similar assets … rank charts, and outlier
 * detection"). Pick a class of identical equipment and a measure; every asset is ranked
 * worst to best, and the ones that stand apart from their sisters are flagged.
 *
 * Why it's useful: one pump at 6 mm/s vibration means little on its own; one pump at 6 mm/s
 * when its 40 sisters read 2 mm/s is worth a look.
 */
import { useApiQuery } from "@pdm/api-client";
import { AssetClass, OUTLIER_SCORE, type CompareMeasure, type FleetCompareRow } from "@pdm/contracts";
import { Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { usePreferences, type UnitSystem } from "../../shared/preferences";
import { useGlobalSearch } from "../../shared/time-range";
import { formatMeasurement, toDisplay } from "../../shared/units";
import { AssetsNav } from "./AssetsNav";

const searchSchema = z.object({
  class: AssetClass.catch("compressor").default("compressor"),
  measure: z.string().optional().catch(undefined),
  /** An asset to point out, e.g. when coming from its Related tab. */
  highlight: z.string().optional().catch(undefined),
  outliers: z.enum(["yes", "no"]).catch("no"),
});

const TABLE_LIMIT = 200;

export function ComparePage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const navigate = useNavigate();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const set = (patch: Record<string, string | undefined>) =>
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }), replace: true });
  const units = usePreferences((p) => p.units);

  const assetClass = search.class;
  const data = useApiQuery(
    "assets.compare",
    { assetClass, scopeId, measure: search.measure ?? "health" },
    { placeholderData: keepPreviousData, refetchInterval: 60_000, retry: false },
  );

  useEffect(() => {
    document.title = `${t("compare.title")} · ${t("app.name")}`;
  }, [t]);

  const r = data.data;
  const show = makeFormatter(r?.measure, units, t);
  const outliers = r?.items.filter((i) => i.outlier) ?? [];
  const rows = search.outliers === "yes" ? outliers : (r?.items ?? []);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.assets.name")}</h1>
        <p className="text-fg-muted">{t("compare.intro")}</p>
      </header>
      <AssetsNav />

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t("compare.classLabel")}
          value={assetClass}
          options={(r?.classes ?? [{ assetClass: assetClass, count: 0 }]).map((c) => ({
            value: c.assetClass,
            label: c.count
              ? t("compare.classOption", { name: t(`assetClass.${c.assetClass}`), count: c.count })
              : t(`assetClass.${c.assetClass}`),
          }))}
          onChange={(v) => set({ class: v, measure: undefined })}
        />
        <Select
          label={t("compare.measureLabel")}
          value={r?.measure.id ?? search.measure ?? "health"}
          options={(r?.measures ?? []).map((m) => ({ value: m.id, label: measureName(m, units, t) }))}
          onChange={(v) => set({ measure: v })}
        />
      </div>

      {data.isPending ? (
        <Skeleton className="h-96" />
      ) : data.isError || !r ? (
        <p className="text-health-warning">{t("widget.failed")}</p>
      ) : (
        <div className={cx("flex flex-col gap-4 transition-opacity", data.isPlaceholderData && "opacity-60")}>
          <section aria-label={t("compare.chartTitle")} className="rounded-lg border border-line bg-surface p-4">
            <h2 className="font-semibold">{t("compare.chartTitle")}</h2>
            <p className="mb-3 text-sm text-fg-muted">
              {t("compare.summary", {
                count: r.items.length,
                median: r.median === null ? "—" : show(r.median),
                outliers: outliers.length,
                threshold: OUTLIER_SCORE,
              })}
            </p>
            <RankChart
              rows={r.items}
              median={r.median}
              format={show}
              highlight={search.highlight}
              label={t("compare.chartLabel", { measure: measureName(r.measure, units, t), name: t(`assetClass.${r.assetClass}`) })}
            />
          </section>

          <section aria-label={t("compare.tableTitle")} className="rounded-lg border border-line bg-surface p-4">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{t("compare.tableTitle")}</h2>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={search.outliers === "yes"}
                  onChange={(e) => set({ outliers: e.target.checked ? "yes" : undefined })}
                />
                {t("compare.onlyOutliers", { count: outliers.length })}
              </label>
            </div>
            <div className="-mx-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">{t("compare.tableCaption")}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-2 text-right font-medium">
                      {t("compare.col.rank")}
                    </th>
                    <th scope="col" className="py-2 pr-3 font-medium">
                      {t("assets.col.asset")}
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      {measureName(r.measure, units, t)}
                    </th>
                    <th scope="col" className="py-2 pr-3 text-right font-medium">
                      {t("compare.col.deviation")}
                    </th>
                    <th scope="col" className="px-4 py-2 font-medium">
                      {t("compare.col.flag")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, TABLE_LIMIT).map((row) => (
                    <tr
                      key={row.assetId}
                      className={cx("border-b border-line last:border-0", row.assetId === search.highlight && "bg-sunken")}
                      aria-current={row.assetId === search.highlight ? "true" : undefined}
                    >
                      <td className="px-4 py-2 text-right text-fg-muted tabular-nums">{r.items.indexOf(row) + 1}</td>
                      <td className="py-2 pr-3">
                        <Link to="/assets/$assetId" params={{ assetId: row.assetId }} search={(prev) => prev} className="hover:underline">
                          {row.assetName}
                        </Link>
                        <span className="ml-2 font-mono text-xs text-fg-muted">{row.assetId}</span>
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {row.value !== null
                          ? show(row.value)
                          : r.measure.id.startsWith("tag:") && row.operatingStatus !== "running"
                            ? t("compare.notRunning", { status: t(`operatingStatus.${row.operatingStatus}`) })
                            : t("compare.noValue")}
                      </td>
                      <td className="py-2 pr-3 text-right text-fg-muted tabular-nums">
                        {row.deviation === null ? "—" : row.deviation.toFixed(1)}
                      </td>
                      <td className="px-4 py-2">
                        <OutlierFlag outlier={row.outlier} worse={r.measure.worse} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {rows.length > TABLE_LIMIT && (
                <p className="px-4 pt-3 text-sm text-fg-muted">{t("compare.showingFirst", { shown: TABLE_LIMIT, total: rows.length })}</p>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

/** "Bearing vibration (mm/s)", or a built-in measure's name. */
function measureName(m: CompareMeasure, units: UnitSystem, t: (k: string, o?: Record<string, unknown>) => string): string {
  if (!m.id.startsWith("tag:")) return t(`compare.measure.${m.id}`);
  if (!m.quantity) return m.label;
  return `${m.label} (${t(`unitSymbol.${toDisplay(0, m.quantity, units).unit}`)})`;
}

/** Shows a value in the user's units, or as a score or days for the built-in measures. */
function makeFormatter(m: CompareMeasure | undefined, units: UnitSystem, t: (k: string, o?: Record<string, unknown>) => string) {
  return (v: number): string => {
    if (!m) return String(v);
    if (m.id === "health") return Math.round(v).toString();
    if (m.id === "anomaly") return v.toFixed(2);
    if (m.id === "rul") return t("compare.days", { count: Math.round(v) });
    return m.quantity ? formatMeasurement(toDisplay(v, m.quantity, units).value) : formatMeasurement(v);
  };
}

/** "Unusually high" or "unusually low", with an arrow; worded as worse or better when we know which way is bad. */
function OutlierFlag({ outlier, worse }: { outlier: FleetCompareRow["outlier"]; worse: CompareMeasure["worse"] }) {
  const { t } = useTranslation();
  if (!outlier) return <span className="text-fg-muted">—</span>;
  const bad = worse === outlier;
  const Icon = outlier === "high" ? ArrowUp : ArrowDown;
  return (
    <span className={cx("inline-flex items-center gap-1 text-xs font-medium", bad ? "text-health-warning" : "text-fg")}>
      <Icon aria-hidden className="size-3.5" />
      {t(`compare.outlier.${outlier}`)}
      {worse && <span className="font-normal text-fg-muted">· {t(bad ? "compare.worseThanFleet" : "compare.betterThanFleet")}</span>}
    </span>
  );
}

// ─── The chart ───────────────────────────────────────────────────────────────

const H = 240;
const PAD = { top: 16, right: 16, bottom: 28, left: 52 };

/** A clean step for the y-axis so there are about 4 gridlines. */
function niceStep(span: number): number {
  const rough = (span || 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 5, 10].map((x) => x * pow).find((s) => s >= rough) ?? 10 * pow;
}

/**
 * Ranked dot plot: assets sorted worst to best along the bottom, each dot at its value, the
 * fleet median as a line. Outliers are drawn larger and labelled; the highlighted asset gets
 * a ring. Works for 3 assets or 700. Arrow keys move a tooltip from dot to dot; the table
 * below holds every number.
 */
function RankChart({
  rows,
  median,
  format,
  highlight,
  label,
}: {
  rows: readonly FleetCompareRow[];
  median: number | null;
  format: (v: number) => string;
  highlight?: string;
  label: string;
}) {
  const { t } = useTranslation();
  const [width, setWidth] = useState(900);
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  const [active, setActive] = useState<number | null>(null);
  useEffect(() => {
    if (!box || typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(([e]) => e && setWidth(Math.max(320, e.contentRect.width)));
    o.observe(box);
    return () => o.disconnect();
  }, [box]);

  const valued = rows.filter((r): r is FleetCompareRow & { value: number } => r.value !== null);
  if (valued.length === 0) return <p className="text-sm text-fg-muted">{t("compare.nothingToPlot")}</p>;
  const lo = Math.min(...valued.map((r) => r.value));
  const hi = Math.max(...valued.map((r) => r.value));
  const step = niceStep(hi - lo);
  const y0 = Math.floor(lo / step) * step;
  const y1 = Math.max(y0 + step, Math.ceil(hi / step) * step);
  const ticks = Array.from({ length: Math.round((y1 - y0) / step) + 1 }, (_, i) => y0 + i * step);
  const plotW = width - PAD.left - PAD.right;
  const x = (i: number) => PAD.left + (valued.length === 1 ? plotW / 2 : (i / (valued.length - 1)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0)) * (H - PAD.top - PAD.bottom);
  // Label outliers and the highlighted asset, but never on top of each other: a label that
  // would collide with one already placed is left out (the tooltip and table still have it).
  const placed: { x: number; y: number }[] = [];
  const labelled = valued
    .filter((r) => r.outlier || r.assetId === highlight)
    .sort((a, b) => Number(b.assetId === highlight) - Number(a.assetId === highlight))
    .filter((r) => {
      const at = { x: x(valued.indexOf(r)), y: y(r.value) };
      if (placed.some((p) => Math.abs(p.x - at.x) < 110 && Math.abs(p.y - at.y) < 14)) return false;
      placed.push(at);
      return placed.length <= 8;
    });

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActive((a) =>
      Math.min(valued.length - 1, Math.max(0, (a ?? (e.key === "ArrowLeft" ? valued.length : -1)) + (e.key === "ArrowLeft" ? -1 : 1))),
    );
  };
  const current = active === null ? null : valued[active];

  return (
    <div ref={setBox} className="relative">
      <svg
        role="img"
        aria-label={t("compare.chartAria", { label, count: valued.length, outliers: valued.filter((r) => r.outlier).length })}
        tabIndex={0}
        width={width}
        height={H}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        onPointerMove={(e) => {
          const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
          const i = valued.length === 1 ? 0 : Math.round(((px - PAD.left) / plotW) * (valued.length - 1));
          setActive(i < 0 || i >= valued.length ? null : i);
        }}
        className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pdm-focus-ring)]"
      >
        {ticks.map((v) => (
          <g key={v}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--pdm-grid)" strokeWidth={1} />
            <text x={PAD.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--pdm-text-secondary)">
              {format(v)}
            </text>
          </g>
        ))}
        <text x={PAD.left} y={H - 8} fontSize={11} fill="var(--pdm-text-secondary)">
          {t("compare.axisWorst")}
        </text>
        <text x={width - PAD.right} y={H - 8} textAnchor="end" fontSize={11} fill="var(--pdm-text-secondary)">
          {t("compare.axisBest")}
        </text>
        {median !== null && (
          <g>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(median)} y2={y(median)} stroke="var(--pdm-text-secondary)" strokeWidth={1.5} />
            <text x={width - PAD.right} y={y(median) - 4} textAnchor="end" fontSize={11} fill="var(--pdm-text-secondary)">
              {t("compare.median", { value: format(median) })}
            </text>
          </g>
        )}
        {valued.map((r, i) => {
          const big = Boolean(r.outlier) || r.assetId === highlight;
          return (
            <circle
              key={r.assetId}
              cx={x(i)}
              cy={y(r.value)}
              r={big ? 5 : valued.length > 200 ? 2.5 : 4}
              fill="var(--pdm-series-1)"
              stroke={r.assetId === highlight ? "var(--pdm-text-primary)" : "var(--pdm-bg-surface)"}
              strokeWidth={2}
              opacity={active === null || active === i ? 1 : 0.5}
            />
          );
        })}
        {labelled.map((r) => {
          const i = valued.indexOf(r);
          const right = x(i) < width / 2;
          return (
            <text
              key={`l${r.assetId}`}
              x={x(i) + (right ? 8 : -8)}
              y={y(r.value) - 8}
              textAnchor={right ? "start" : "end"}
              fontSize={11}
              fill="var(--pdm-text-primary)"
            >
              {r.assetId}
            </text>
          );
        })}
      </svg>
      {current && active !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-0 rounded-md border border-line bg-raised px-2 py-1 text-xs whitespace-nowrap shadow-2"
          style={{ left: Math.min(width - 200, Math.max(0, x(active) - 80)) }}
        >
          <span className="block font-semibold">
            {t("compare.tooltipRank", { rank: active + 1, count: valued.length })} · {current.assetName}
          </span>
          <span className="tabular-nums">{format(current.value)}</span>
          {current.outlier && <span className="ml-2">{t(`compare.outlier.${current.outlier}`)}</span>}
        </div>
      )}
    </div>
  );
}
