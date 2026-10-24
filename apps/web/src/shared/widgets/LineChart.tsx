/**
 * A small line chart over time, drawn in SVG to the dataviz rules: one y-axis, 2 px lines in
 * the theme's series colours, a legend when there are two or more lines (each also labelled at
 * its end), hairline grid, text in text colours. Threshold lines are dashed and labelled;
 * event markers are thin vertical lines with a label. Hover or arrow keys move a crosshair and
 * tooltip; "Show as table" gives every number.
 *
 * Keep it to a few hundred points per line (the 2,000-point budget is for the big telemetry
 * charts). Gaps (null) break the line rather than drawing across them.
 */
import { Button } from "@pdm/ui";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

export interface LineSeries {
  id: string;
  label: string;
  values: readonly (number | null)[];
  /** A series colour token, e.g. "var(--pdm-series-1)". Never a health colour. */
  color: string;
  dashed?: boolean;
}

export interface LineChartProps {
  /** One time (ms) per value, shared by every series. */
  times: readonly number[];
  series: readonly LineSeries[];
  /** What the chart shows, e.g. "Output and dispatch, last 48 hours (MW)". */
  label: string;
  /** One or two sentences with the main finding, read out with the label. */
  summary: string;
  format: (v: number) => string;
  /** For the tooltip and table. */
  formatTime: (t: number) => string;
  /** Short time labels along the bottom. */
  formatTick: (t: number) => string;
  thresholds?: readonly { value: number; label: string }[];
  markers?: readonly { t: number; label: string }[];
  /** Always include zero in the y-range (deviation charts read from it). */
  includeZero?: boolean;
  /** Smallest left margin (px): give stacked charts the same one so their time axes line up. */
  minLeft?: number;
  /** Label each line at its end (default with two or more lines). Off when the ends meet and would pile up. */
  endLabels?: boolean;
  height?: number;
}

const PAD = { top: 12, right: 12, bottom: 22, left: 48 };
const DIRECT_LABEL_W = 92;

function niceStep(span: number): number {
  const rough = (span || 1) / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 5, 10].map((x) => x * pow).find((s) => s >= rough) ?? 10 * pow;
}

/** SVG path for values with gaps: a new "M" after every null. */
function linePath(values: readonly (number | null)[], x: (i: number) => number, y: (v: number) => number): string {
  let d = "";
  let pen = false;
  values.forEach((v, i) => {
    if (v === null) {
      pen = false;
      return;
    }
    d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
    pen = true;
  });
  return d;
}

export function LineChart({
  times,
  series,
  label,
  summary,
  format,
  formatTime,
  formatTick,
  thresholds = [],
  markers = [],
  includeZero = false,
  minLeft = PAD.left,
  endLabels = true,
  height = 200,
}: LineChartProps) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  // Follow the container's width (jsdom has no ResizeObserver: keep the default there).
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(320, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [asTable]);

  const n = times.length;
  const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const extents = [...all, ...thresholds.map((th) => th.value), ...(includeZero ? [0] : [])];
  const lo = extents.length ? Math.min(...extents) : 0;
  const hi = extents.length ? Math.max(...extents) : 1;
  const step = niceStep(hi - lo);
  const y0 = Math.floor(lo / step) * step;
  const y1 = Math.max(y0 + step, Math.ceil(hi / step) * step);
  const ticks = Array.from({ length: Math.round((y1 - y0) / step) + 1 }, (_, i) => y0 + i * step);

  const multi = series.length > 1;
  const labelEnds = multi && endLabels;
  const right = PAD.right + (labelEnds ? DIRECT_LABEL_W : 0);
  // Room for the longest y-axis label (about 6.5 px a character at 11 px), so none is clipped.
  const left = Math.max(minLeft, 10 + 6.5 * Math.max(...ticks.map((v) => format(v).length)));
  const plotW = width - left - right;
  const base = height - PAD.bottom;
  const x = (i: number) => left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const xAt = (ms: number) => (n <= 1 ? left : left + ((ms - times[0]!) / (times[n - 1]! - times[0]!)) * plotW);
  const y = (v: number) => PAD.top + (1 - (v - y0) / (y1 - y0)) * (base - PAD.top);

  // About six time labels, never overlapping.
  const tickEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(plotW / 110))));

  // Direct labels at each line's last value, nudged apart so they never overlap.
  const ends = series
    .map((s) => {
      const last = [...s.values].reverse().find((v) => v !== null);
      return last === undefined || last === null ? null : { s, y: y(last) };
    })
    .filter((e): e is { s: LineSeries; y: number } => e !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < ends.length; i++) ends[i]!.y = Math.max(ends[i]!.y, ends[i - 1]!.y + 14);

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActive((a) => Math.min(n - 1, Math.max(0, (a ?? (e.key === "ArrowLeft" ? n : -1)) + (e.key === "ArrowLeft" ? -1 : 1))));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {multi ? (
          <ul aria-label={t("chart.legend")} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
            {series.map((s) => (
              <li key={s.id} className="flex items-center gap-1.5">
                <svg aria-hidden width={18} height={4}>
                  <line x1={0} x2={18} y1={2} y2={2} stroke={s.color} strokeWidth={2} strokeDasharray={s.dashed ? "4 3" : undefined} />
                </svg>
                {s.label}
              </li>
            ))}
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
                  {t("chart.time")}
                </th>
                {series.map((s) => (
                  <th key={s.id} scope="col" className="py-1 text-right font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {times.map((ms, i) => (
                <tr key={ms} className="border-b border-line last:border-0">
                  <td className="py-1">{formatTime(ms)}</td>
                  {series.map((s) => {
                    const v = s.values[i];
                    return (
                      <td key={s.id} className="py-1 text-right tabular-nums">
                        {v === null || v === undefined ? "—" : format(v)}
                      </td>
                    );
                  })}
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
              const px = e.clientX - e.currentTarget.getBoundingClientRect().left;
              const i = n <= 1 ? 0 : Math.round(((px - left) / plotW) * (n - 1));
              setActive(i < 0 || i >= n ? null : i);
            }}
            className="max-w-full rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pdm-focus-ring)]"
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={left} x2={left + plotW} y1={y(v)} y2={y(v)} stroke="var(--pdm-grid)" strokeWidth={1} />
                <text x={left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--pdm-text-secondary)">
                  {format(v)}
                </text>
              </g>
            ))}
            {times.map((ms, i) =>
              i % tickEvery === 0 ? (
                <text key={ms} x={x(i)} y={height - 6} textAnchor="middle" fontSize={11} fill="var(--pdm-text-secondary)">
                  {formatTick(ms)}
                </text>
              ) : null,
            )}
            {thresholds.map((th) => (
              <g key={th.label}>
                <line
                  x1={left}
                  x2={left + plotW}
                  y1={y(th.value)}
                  y2={y(th.value)}
                  stroke="var(--pdm-text-secondary)"
                  strokeWidth={1}
                  strokeDasharray="4 3"
                />
                <text x={left + 4} y={y(th.value) - 4} fontSize={11} fill="var(--pdm-text-secondary)">
                  {th.label}
                </text>
              </g>
            ))}
            {markers
              .filter((m) => n > 1 && m.t >= times[0]! && m.t <= times[n - 1]!)
              .map((m) => (
                <g key={`${m.t}${m.label}`}>
                  <line x1={xAt(m.t)} x2={xAt(m.t)} y1={PAD.top} y2={base} stroke="var(--pdm-text-primary)" strokeWidth={1} />
                  <text
                    x={xAt(m.t) + (xAt(m.t) < left + plotW - 100 ? 4 : -4)}
                    y={PAD.top + 10}
                    textAnchor={xAt(m.t) < left + plotW - 100 ? "start" : "end"}
                    fontSize={11}
                    fill="var(--pdm-text-primary)"
                  >
                    {m.label}
                  </text>
                </g>
              ))}
            {series.map((s) => (
              <path
                key={s.id}
                d={linePath(s.values, x, y)}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeDasharray={s.dashed ? "6 4" : undefined}
              />
            ))}
            {labelEnds &&
              ends.map((e) => (
                <text
                  key={`end${e.s.id}`}
                  x={left + plotW + 6}
                  y={e.y}
                  dominantBaseline="middle"
                  fontSize={11}
                  fill="var(--pdm-text-primary)"
                >
                  {e.s.label}
                </text>
              ))}
            {active !== null && (
              <g>
                <line x1={x(active)} x2={x(active)} y1={PAD.top} y2={base} stroke="var(--pdm-text-secondary)" strokeWidth={1} />
                {series.map((s) => {
                  const v = s.values[active];
                  return v === null || v === undefined ? null : (
                    <circle key={s.id} cx={x(active)} cy={y(v)} r={4} fill={s.color} stroke="var(--pdm-bg-surface)" strokeWidth={2} />
                  );
                })}
              </g>
            )}
          </svg>
          {active !== null && times[active] !== undefined && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 rounded-md border border-line bg-raised px-2 py-1 text-xs whitespace-nowrap shadow-2"
              style={{ left: Math.min(width - 200, Math.max(0, x(active) + 12)) }}
            >
              <span className="block text-fg-muted">{formatTime(times[active])}</span>
              {series.map((s) => {
                const v = s.values[active];
                return (
                  <span key={s.id} className="block">
                    {multi && `${s.label}: `}
                    <span className="font-semibold tabular-nums">{v === null || v === undefined ? "—" : format(v)}</span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
