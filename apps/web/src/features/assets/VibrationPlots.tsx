/**
 * Two more ways of looking at a machine's vibration:
 *   - Waterfall: the weekly spectra stacked back in time, newest in front, so a peak that grows
 *     week by week stands out as a ridge. "Show as table" gives the key peaks per week.
 *   - Orbit: the path of the shaft centre over a few turns, from two proximity probes at right
 *     angles. A clean ellipse is normal; a banana or figure-eight shape means 2× (misalignment);
 *     loops inside the orbit mean something below running speed, like oil whirl. The dots are
 *     the once-per-turn mark.
 */
import type { Orbit } from "@pdm/contracts";
import { Button } from "@pdm/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

export interface WaterfallRow {
  t: string;
  date: string;
  amps: readonly number[] | null;
  overall: number | null;
  /** Peak amplitudes at the key markers, in the same order as `columns`. */
  peaks: readonly number[];
}

interface WaterfallProps {
  rows: readonly WaterfallRow[];
  columns: readonly string[];
  selected: string;
  df: number;
  label: string;
  summary: string;
  format: (amp: number) => string;
  height?: number;
}

const PAD = { top: 8, right: 64, bottom: 24, left: 12 };

function niceStep(span: number, parts: number): number {
  const rough = (span || 1) / parts;
  const pow = 10 ** Math.floor(Math.log10(rough));
  return [1, 2, 5, 10].map((x) => x * pow).find((s) => s >= rough) ?? 10 * pow;
}

export function Waterfall({ rows, columns, selected, df, label, summary, format, height = 360 }: WaterfallProps) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(320, entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, [asTable]);

  const drawn = rows.filter((r) => r.amps !== null);
  const n = drawn.length;
  const lines = drawn[0]?.amps?.length ?? 1;
  const fMax = lines * df;
  const yMax = Math.max(1e-6, ...drawn.flatMap((r) => r.amps!));
  const plotW = width - PAD.left - PAD.right;
  // Each older spectrum sits a step up and to the right of the one in front of it.
  const depthX = 0.18 * plotW;
  const depthY = 0.42 * (height - PAD.top - PAD.bottom);
  const specW = plotW - depthX;
  const specH = height - PAD.top - PAD.bottom - depthY;
  const stepX = n > 1 ? depthX / (n - 1) : 0;
  const stepY = n > 1 ? depthY / (n - 1) : 0;
  const frontBase = height - PAD.bottom;
  // Row k from the front (0 = newest).
  const origin = (k: number) => ({ x: PAD.left + k * stepX, y: frontBase - k * stepY });
  const xStep = niceStep(fMax, Math.max(2, Math.floor(specW / 90)));
  const xTicks = Array.from({ length: Math.floor(fMax / xStep) + 1 }, (_, i) => i * xStep);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {t(asTable ? "chart.showChart" : "chart.showTable")}
        </Button>
      </div>
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="py-1 font-medium">
                  {t("vibration.table.date")}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {t("vibration.table.overall")}
                </th>
                {columns.map((c) => (
                  <th key={c} scope="col" className="py-1 text-right font-medium">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.t} className="border-b border-line last:border-0">
                  <th scope="row" className="py-1 text-left font-normal">
                    {r.date}
                  </th>
                  {r.overall === null ? (
                    <td colSpan={columns.length + 1} className="py-1 text-right text-fg-muted">
                      {t("vibration.notRunning")}
                    </td>
                  ) : (
                    <>
                      <td className="py-1 text-right tabular-nums">{format(r.overall)}</td>
                      {r.peaks.map((p, i) => (
                        <td key={columns[i]} className="py-1 text-right tabular-nums">
                          {format(p)}
                        </td>
                      ))}
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={box}>
          <svg role="img" aria-label={`${label}. ${summary}`} width={width} height={height}>
            {drawn.map((r, idx) => {
              const k = n - 1 - idx; // the oldest is furthest back and drawn first, so nearer ones hide what's behind
              const o = origin(k);
              const amps = r.amps!;
              const px = (i: number) => o.x + (((i + 1) * df) / fMax) * specW;
              const py = (a: number) => o.y - (a / yMax) * specH;
              const line = amps.map((a, i) => `${px(i).toFixed(1)},${py(a).toFixed(1)}`).join(" ");
              const isSelected = r.t === selected;
              return (
                <g key={r.t}>
                  <polygon
                    points={`${o.x.toFixed(1)},${o.y.toFixed(1)} ${line} ${(o.x + specW).toFixed(1)},${o.y.toFixed(1)}`}
                    fill="var(--pdm-bg-surface)"
                    stroke={isSelected ? "var(--pdm-series-1)" : "var(--pdm-text-secondary)"}
                    strokeWidth={isSelected ? 2 : 1}
                    strokeLinejoin="round"
                  />
                  <text
                    x={o.x + specW + 6}
                    y={o.y}
                    dominantBaseline="middle"
                    fontSize={10}
                    fontWeight={isSelected ? 600 : 400}
                    fill={isSelected ? "var(--pdm-text-primary)" : "var(--pdm-text-secondary)"}
                  >
                    {r.date}
                  </text>
                </g>
              );
            })}
            {xTicks.map((hz) => (
              <text
                key={hz}
                x={PAD.left + (hz / fMax) * specW}
                y={height - 8}
                textAnchor="middle"
                fontSize={11}
                fill="var(--pdm-text-secondary)"
              >
                {hz === 0 ? "0" : `${hz >= 100 ? hz.toFixed(0) : hz.toFixed(1)} ${t("unitSymbol.Hz")}`}
              </text>
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}

interface OrbitProps {
  orbit: Orbit;
  label: string;
  summary: string;
}

export function OrbitPlot({ orbit, label, summary }: OrbitProps) {
  const { t } = useTranslation();
  const size = 280;
  const pad = 28;
  const extent = Math.max(1, ...orbit.points.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]));
  const step = niceStep(extent, 2);
  const lim = Math.ceil((extent * 1.1) / step) * step;
  const ticks = Array.from({ length: Math.round((2 * lim) / step) + 1 }, (_, i) => -lim + i * step);
  const half = (size - 2 * pad) / 2;
  const cx = size / 2;
  const sx = (x: number) => cx + (x / lim) * half;
  const sy = (y: number) => cx - (y / lim) * half;
  const d = orbit.points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${sx(x).toFixed(1)},${sy(y).toFixed(1)}`).join("");
  const marks = orbit.points.filter((_, i) => i % orbit.pointsPerRev === 0);

  return (
    <svg role="img" aria-label={`${label}. ${summary}`} viewBox={`0 0 ${size} ${size}`} className="w-full max-w-[320px]">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={sx(v)} x2={sx(v)} y1={pad} y2={size - pad} stroke="var(--pdm-grid)" strokeWidth={v === 0 ? 1.5 : 1} />
          <line x1={pad} x2={size - pad} y1={sy(v)} y2={sy(v)} stroke="var(--pdm-grid)" strokeWidth={v === 0 ? 1.5 : 1} />
          {v !== 0 && (
            <text x={sx(v)} y={size - pad + 14} textAnchor="middle" fontSize={10} fill="var(--pdm-text-secondary)">
              {v}
            </text>
          )}
        </g>
      ))}
      <text x={size - pad} y={cx - 6} textAnchor="end" fontSize={11} fill="var(--pdm-text-secondary)">
        {t("vibration.orbit.x")}
      </text>
      <text x={cx + 6} y={pad + 4} fontSize={11} fill="var(--pdm-text-secondary)">
        {t("vibration.orbit.y")}
      </text>
      <path d={d} fill="none" stroke="var(--pdm-series-1)" strokeWidth={1.5} strokeLinejoin="round" />
      {marks.map(([x, y], i) => (
        <circle key={i} cx={sx(x)} cy={sy(y)} r={3.5} fill="var(--pdm-text-primary)" />
      ))}
    </svg>
  );
}
