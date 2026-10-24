/**
 * Alarms per time bucket, as columns (one series, so no legend: the heading names it).
 * Built to the dataviz specs: columns at most 24 px wide with a 2 px gap, 4 px rounded tops,
 * hairline grid, the theme's first series colour, text in text colours. Hover or arrow keys
 * show a tooltip, and "Show as table" gives the same numbers as a table.
 */
import { Button } from "@pdm/ui";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

export interface RatePoint {
  t: string;
  count: number;
}

const HEIGHT = 180;
const PAD = { top: 8, right: 8, bottom: 22, left: 36 };
const time = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** A clean step for the y-axis: 1, 2, 5, 10, 20, 50… so there are about 4 gridlines. */
function niceStep(max: number): number {
  const rough = Math.max(1, max) / 4;
  const pow = 10 ** Math.floor(Math.log10(rough));
  return ([1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow) || 1;
}

/** Column with a rounded top and a square foot on the baseline. */
function columnPath(x: number, y: number, w: number, base: number): string {
  const r = Math.min(4, w / 2, base - y);
  if (r <= 0) return "";
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

export function RateChart({ points, bucketMinutes, label }: { points: readonly RatePoint[]; bucketMinutes: number; label: string }) {
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
  }, []);

  const max = Math.max(0, ...points.map((p) => p.count));
  const step = niceStep(max);
  const top = Math.max(step, Math.ceil(max / step) * step);
  const plotW = width - PAD.left - PAD.right;
  const base = HEIGHT - PAD.bottom;
  const slot = plotW / Math.max(1, points.length);
  const colW = Math.max(1, Math.min(24, slot - 2));
  const y = (v: number) => PAD.top + (1 - v / top) * (base - PAD.top);
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);
  const daily = bucketMinutes >= 60;
  // X labels: every 6 hours for a day, every day for a week.
  const labelEvery = daily ? 24 : 36;

  const range = (i: number) => {
    const from = Date.parse(points[i]!.t);
    const to = from + bucketMinutes * 60_000;
    return daily ? `${day.format(from)} ${time.format(from)}–${time.format(to)}` : `${time.format(from)}–${time.format(to)}`;
  };
  const summary = useMemo(() => {
    if (points.length === 0) return "";
    const peak = points.reduce((b, p, i) => (p.count > points[b]!.count ? i : b), 0);
    return t("analytics.chartSummary", { total: points.reduce((s, p) => s + p.count, 0), peak: points[peak]!.count, when: range(peak) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- range only depends on points and bucketMinutes
  }, [points, bucketMinutes, t]);

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    setActive((a) =>
      Math.min(points.length - 1, Math.max(0, (a ?? (e.key === "ArrowLeft" ? points.length : -1)) + (e.key === "ArrowLeft" ? -1 : 1))),
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {t(asTable ? "analytics.showChart" : "analytics.showTable")}
        </Button>
      </div>
      {asTable ? (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="py-1 font-medium">
                  {t("analytics.col.period")}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {t("analytics.col.alarms")}
                </th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.t} className="border-b border-line last:border-0">
                  <td className="py-1">{range(i)}</td>
                  <td className="py-1 text-right tabular-nums">{p.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box} className="relative">
          {/* The figure is focusable: arrow keys move the tooltip from column to column. */}
          <svg
            role="img"
            aria-label={`${label}. ${summary}`}
            tabIndex={0}
            width={width}
            height={HEIGHT}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            onPointerLeave={() => setActive(null)}
            onPointerMove={(e) => {
              const x = e.clientX - e.currentTarget.getBoundingClientRect().left - PAD.left;
              setActive(x < 0 || x > plotW ? null : Math.min(points.length - 1, Math.floor(x / slot)));
            }}
            className="max-w-full rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pdm-focus-ring)]"
          >
            {ticks.map((v) => (
              <g key={v}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(v)} y2={y(v)} stroke="var(--pdm-grid)" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--pdm-text-secondary)">
                  {v}
                </text>
              </g>
            ))}
            {points.map((p, i) =>
              i % labelEvery === 0 ? (
                <text key={`x${p.t}`} x={PAD.left + i * slot} y={HEIGHT - 6} fontSize={11} fill="var(--pdm-text-secondary)">
                  {daily ? day.format(Date.parse(p.t)) : time.format(Date.parse(p.t))}
                </text>
              ) : null,
            )}
            {points.map((p, i) => (
              <path
                key={p.t}
                d={columnPath(PAD.left + i * slot + (slot - colW) / 2, y(p.count), colW, base)}
                fill="var(--pdm-series-1)"
                opacity={active === null || active === i ? 1 : 0.45}
              />
            ))}
          </svg>
          {active !== null && points[active] && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 rounded-md border border-line bg-raised px-2 py-1 text-xs whitespace-nowrap shadow-2"
              style={{ left: Math.min(width - 160, Math.max(0, PAD.left + active * slot - 60)) }}
            >
              <span className="block text-fg-muted">{range(active)}</span>
              <span className="font-semibold tabular-nums">{t("analytics.alarmsCount", { count: points[active].count })}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
