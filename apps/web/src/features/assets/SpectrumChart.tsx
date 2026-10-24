/**
 * A vibration spectrum: amplitude (mm/s) against frequency (Hz), with the machine's fault
 * frequencies marked as dashed lines. Labels that would collide are stacked in rows. Hover or
 * the arrow keys move a cursor line by line (Shift for ten lines, Home/End for the ends);
 * "Show as table" lists every marker and the largest peaks.
 */
import { Button } from "@pdm/ui";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";

export interface SpectrumMarker {
  key: string;
  label: string;
  /** Full name, for the table. */
  name: string;
  hz: number;
  order: number;
  amp: number;
  /** Drawn on the chart as well as listed in the table (the cage and ball-spin lines just crowd it). */
  onChart: boolean;
}

interface Props {
  amps: readonly number[];
  /** Hz between lines. */
  df: number;
  runningHz: number;
  markers: readonly SpectrumMarker[];
  label: string;
  summary: string;
  format: (amp: number) => string;
  height?: number;
}

const PAD = { top: 12, right: 16, bottom: 24, left: 48 };
const LABEL_ROW = 13;

function niceStep(span: number, parts: number): number {
  const rough = (span || 1) / parts;
  const pow = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 5, 10].map((x) => x * pow).find((s) => s >= rough) ?? 10 * pow;
}

const hzText = (hz: number) => (hz >= 100 ? hz.toFixed(0) : hz.toFixed(1));
const orderText = (order: number) => `${order.toFixed(2)}×`;

/** Local maxima, largest first. */
function largestPeaks(amps: readonly number[], count: number): number[] {
  const peaks: number[] = [];
  for (let i = 1; i < amps.length - 1; i++) if (amps[i]! > amps[i - 1]! && amps[i]! >= amps[i + 1]!) peaks.push(i);
  return peaks.sort((a, b) => amps[b]! - amps[a]!).slice(0, count);
}

export function SpectrumChart({ amps, df, runningHz, markers, label, summary, format, height = 260 }: Props) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(320, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [asTable]);

  const n = amps.length;
  const fMax = n * df;
  const yMax = Math.max(...amps, 1e-6);
  const yStep = niceStep(yMax, 4);
  const y1 = Math.ceil(yMax / yStep) * yStep;
  const yTicks = Array.from({ length: Math.round(y1 / yStep) + 1 }, (_, i) => i * yStep);
  const left = Math.max(PAD.left, 10 + 6.5 * Math.max(...yTicks.map((v) => format(v).length)));
  const plotW = width - left - PAD.right;
  const x = (hz: number) => left + (hz / fMax) * plotW;
  const xOf = (i: number) => x((i + 1) * df);

  // Marker labels in rows, so none overlaps the one before it.
  const rowEnds: number[] = [];
  const placed = [...markers]
    .filter((m) => m.onChart && m.hz < fMax)
    .sort((a, b) => a.hz - b.hz)
    .map((m) => {
      const w = 7 * m.label.length + 6;
      const start = x(m.hz) - w / 2;
      let row = rowEnds.findIndex((end) => end < start);
      if (row === -1) row = rowEnds.push(0) - 1;
      rowEnds[row] = start + w;
      return { m, row };
    });
  const top = PAD.top + rowEnds.length * LABEL_ROW;
  const base = height - PAD.bottom;
  const y = (v: number) => top + (1 - v / y1) * (base - top);
  const xStep = niceStep(fMax, Math.max(2, Math.floor(plotW / 90)));
  const xTicks = Array.from({ length: Math.floor(fMax / xStep) + 1 }, (_, i) => i * xStep);

  const path = amps.map((a, i) => `${i === 0 ? "M" : "L"}${xOf(i).toFixed(1)},${y(a).toFixed(1)}`).join("");

  const onKey = (e: KeyboardEvent) => {
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, (a: number) => number> = {
      ArrowLeft: (a) => a - step,
      ArrowRight: (a) => a + step,
      Home: () => 0,
      End: () => n - 1,
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setActive((a) => Math.min(n - 1, Math.max(0, move(a ?? 0))));
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {t(asTable ? "chart.showChart" : "chart.showTable")}
        </Button>
      </div>
      {asTable ? (
        <div className="relative overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="py-1 font-medium">
                  {t("vibration.table.what")}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {t("vibration.table.order")}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {t("vibration.table.hz")}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {t("vibration.table.amp")}
                </th>
              </tr>
            </thead>
            <tbody>
              {markers.map((m) => (
                <tr key={m.key} className="border-b border-line">
                  <th scope="row" className="py-1 text-left font-normal">
                    {m.name}
                  </th>
                  <td className="py-1 text-right tabular-nums">{orderText(m.order)}</td>
                  <td className="py-1 text-right tabular-nums">{hzText(m.hz)}</td>
                  <td className="py-1 text-right tabular-nums">{format(m.amp)}</td>
                </tr>
              ))}
              {largestPeaks(amps, 8).map((i, rank) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <th scope="row" className="py-1 text-left font-normal text-fg-muted">
                    {t("vibration.table.peak", { rank: rank + 1 })}
                  </th>
                  <td className="py-1 text-right tabular-nums">{orderText(((i + 1) * df) / runningHz)}</td>
                  <td className="py-1 text-right tabular-nums">{hzText((i + 1) * df)}</td>
                  <td className="py-1 text-right tabular-nums">{format(amps[i]!)}</td>
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
              const i = Math.round(((px - left) / plotW) * n) - 1;
              setActive(i < 0 || i >= n ? null : i);
            }}
            className="max-w-full rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pdm-focus-ring)]"
          >
            {yTicks.map((v) => (
              <g key={v}>
                <line x1={left} x2={left + plotW} y1={y(v)} y2={y(v)} stroke="var(--pdm-grid)" strokeWidth={1} />
                <text x={left - 6} y={y(v)} textAnchor="end" dominantBaseline="middle" fontSize={11} fill="var(--pdm-text-secondary)">
                  {format(v)}
                </text>
              </g>
            ))}
            {xTicks.map((hz) => (
              <text key={hz} x={x(hz)} y={height - 8} textAnchor="middle" fontSize={11} fill="var(--pdm-text-secondary)">
                {hz === 0 ? "0" : `${hzText(hz)} ${t("unitSymbol.Hz")}`}
              </text>
            ))}
            {placed.map(({ m, row }) => (
              <g key={m.key}>
                <line
                  x1={x(m.hz)}
                  x2={x(m.hz)}
                  y1={PAD.top + row * LABEL_ROW + 3}
                  y2={base}
                  stroke="var(--pdm-text-secondary)"
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
                <text x={x(m.hz)} y={PAD.top + row * LABEL_ROW} textAnchor="middle" fontSize={11} fill="var(--pdm-text-primary)">
                  {m.label}
                </text>
              </g>
            ))}
            <path d={path} fill="none" stroke="var(--pdm-series-1)" strokeWidth={1.5} strokeLinejoin="round" />
            {active !== null && (
              <g>
                <line x1={xOf(active)} x2={xOf(active)} y1={top} y2={base} stroke="var(--pdm-text-secondary)" strokeWidth={1} />
                <circle
                  cx={xOf(active)}
                  cy={y(amps[active]!)}
                  r={4}
                  fill="var(--pdm-series-1)"
                  stroke="var(--pdm-bg-surface)"
                  strokeWidth={2}
                />
              </g>
            )}
          </svg>
          {active !== null && (
            <div
              role="status"
              className="pointer-events-none absolute top-0 rounded-md border border-line bg-raised px-2 py-1 text-xs whitespace-nowrap shadow-2"
              style={{ left: Math.min(width - 200, Math.max(0, xOf(active) + 12)) }}
            >
              <span className="block text-fg-muted">
                {hzText((active + 1) * df)} {t("unitSymbol.Hz")} · {orderText(((active + 1) * df) / runningHz)}
              </span>
              <span className="block font-semibold tabular-nums">{format(amps[active]!)}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
