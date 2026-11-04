/**
 * Columns, one per category (months, failure modes…), to the dataviz rules: columns at most
 * 24 px wide with a 2 px gap and 4 px rounded tops, hairline grid, one y-axis, the first series
 * colour, text in text colours. An optional line in the second series colour can ride on the
 * same axis (e.g. a Pareto's running total, also in %). Hover or arrow keys show a tooltip;
 * "Show as table" gives every number.
 */
import { Button } from "@pdm/ui";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

export interface Column {
  key: string;
  /** Short label under the column (may be skipped when crowded). */
  tick: string;
  /** Full name for the tooltip and table. */
  name: string;
  value: number;
  /** The line's value at this column, if there's a line. */
  line?: number;
}

export interface ColumnChartProps {
  columns: readonly Column[];
  /** What the chart shows, e.g. "Failures per month". */
  label: string;
  summary: string;
  format: (v: number) => string;
  /** Names for the table's columns and the legend. */
  valueName: string;
  lineName?: string;
  /** Fix the top of the axis (e.g. 100 for percentages). */
  max?: number;
  height?: number;
}

const PAD = { top: 10, right: 10, bottom: 24, left: 44 };

function niceStep(max: number): number {
  const rough = Math.max(1, max) / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  return ([1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow) || 1;
}

function columnPath(x: number, y: number, w: number, base: number): string {
  const r = Math.min(4, w / 2, base - y);
  if (r <= 0) return "";
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

export function ColumnChart({ columns, label, summary, format, valueName, lineName, max, height = 200 }: ColumnChartProps) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const hasLine = columns.some((c) => c.line !== undefined);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(([e]) => e && setWidth(Math.max(320, e.contentRect.width)));
    o.observe(el);
    return () => o.disconnect();
  }, [asTable]);

  const peak = Math.max(0, ...columns.map((c) => Math.max(c.value, c.line ?? 0)));
  const step = niceStep(max ?? peak);
  const top = max ?? Math.max(step, Math.ceil(peak / step) * step);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const plotW = width - PAD.left - PAD.right;
  const base = height - PAD.bottom;
  const slot = plotW / Math.max(1, columns.length);
  const colW = Math.max(1, Math.min(24, slot - 2));
  const y = (v: number) => PAD.top + (1 - v / top) * (base - PAD.top);
  const cx = (i: number) => PAD.left + i * slot + slot / 2;
  // Tick labels need about 44 px each; skip some when crowded.
  const tickEvery = Math.max(1, Math.ceil(44 / slot));

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const n = columns.length;
    setActive((a) => Math.min(n - 1, Math.max(0, (a ?? (e.key === "ArrowLeft" ? n : -1)) + (e.key === "ArrowLeft" ? -1 : 1))));
  };
  const current = active === null ? null : columns[active];

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {hasLine ? (
          <ul aria-label={t("chart.legend")} className="flex flex-wrap gap-x-4 text-xs text-fg-muted">
            <li className="flex items-center gap-1.5">
              <span aria-hidden className="inline-block size-3 rounded-sm" style={{ background: "var(--pdm-series-1)" }} />
              {valueName}
            </li>
            <li className="flex items-center gap-1.5">
              <svg aria-hidden width={18} height={4}>
                <line x1={0} x2={18} y1={2} y2={2} stroke="var(--pdm-series-2)" strokeWidth={2} />
              </svg>
              {lineName}
            </li>
          </ul>
        ) : (
          <span />
        )}
        <Button size="sm" variant="ghost" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {t(asTable ? "chart.showChart" : "chart.showTable")}
        </Button>
      </div>
      {asTable ? (
        <div
          className="max-h-80 overflow-y-auto"
          role="region"
          aria-label={label}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a named, focusable scroll region is the recommended pattern here
          tabIndex={0}
        >
          <table className="w-full text-sm">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="py-1 font-medium">
                  <span className="sr-only">{t("chart.category")}</span>
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {valueName}
                </th>
                {hasLine && (
                  <th scope="col" className="py-1 text-right font-medium">
                    {lineName}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {columns.map((c) => (
                <tr key={c.key} className="border-b border-line last:border-0">
                  <th scope="row" className="py-1 text-left font-normal">
                    {c.name}
                  </th>
                  <td className="py-1 text-right tabular-nums">{format(c.value)}</td>
                  {hasLine && <td className="py-1 text-right tabular-nums">{c.line === undefined ? "—" : format(c.line)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative">
          <svg
            role="img"
            aria-label={`${label}. ${summary}`}
            tabIndex={0}
            width={width}
            height={height}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            onPointerMove={(e) => {
              const x = e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.left;
              setActive(x < 0 || x > plotW ? null : Math.min(columns.length - 1, Math.floor(x / slot)));
            }}
            className="max-w-full rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pdm-focus-ring)]"
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--pdm-grid)" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--pdm-text-secondary)">
                  {format(v)}
                </text>
              </g>
            ))}
            {columns.map((c, i) =>
              i % tickEvery === 0 ? (
                <text key={`x${c.key}`} x={cx(i)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--pdm-text-secondary)">
                  {c.tick}
                </text>
              ) : null,
            )}
            {columns.map((c, i) => (
              <path
                key={c.key}
                d={columnPath(cx(i) - colW / 2, y(c.value), colW, base)}
                fill="var(--pdm-series-1)"
                opacity={active === null || active === i ? 1 : 0.45}
              />
            ))}
            {hasLine && (
              <>
                <polyline
                  points={columns.map((c, i) => `${cx(i).toFixed(1)},${y(c.line ?? 0).toFixed(1)}`).join(" ")}
                  fill="none"
                  stroke="var(--pdm-series-2)"
                  strokeWidth={2}
                  strokeLinejoin="round"
                />
                {columns.map((c, i) => (
                  <circle
                    key={`p${c.key}`}
                    cx={cx(i)}
                    cy={y(c.line ?? 0)}
                    r={3}
                    fill="var(--pdm-series-2)"
                    stroke="var(--pdm-bg-surface)"
                    strokeWidth={1.5}
                  />
                ))}
              </>
            )}
          </svg>
          <div role="status">
            {current && active !== null && (
              <div
                className="pointer-events-none absolute top-0 rounded-md border border-line bg-raised px-2 py-1 text-xs whitespace-nowrap shadow-2"
                style={{ left: Math.min(width - 180, Math.max(0, cx(active) - 60)) }}
              >
                <span className="block font-semibold">{current.name}</span>
                <span className="block tabular-nums">
                  {valueName}: {format(current.value)}
                </span>
                {current.line !== undefined && (
                  <span className="block tabular-nums">
                    {lineName}: {format(current.line)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
