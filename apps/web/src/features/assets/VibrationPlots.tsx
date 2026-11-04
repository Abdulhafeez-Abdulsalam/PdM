/**
 * Two more ways of looking at a machine's vibration:
 *   - Waterfall: the weekly spectra stacked back in time, newest in front, so a peak that grows
 *     week by week stands out as a ridge. "Show as table" gives the key peaks per week.
 *   - Orbit: the path of the shaft centre over a few turns, from two proximity probes at right
 *     angles. A clean ellipse is normal; a banana or figure-eight shape means 2× (misalignment);
 *     loops inside the orbit mean something below running speed, like oil whirl. The dots are
 *     the once-per-turn mark.
 *
 * Both have a cursor for the keyboard and the mouse, like the spectrum's, and say what it's on in
 * words below the chart (read out by screen readers):
 *   - Waterfall: left/right along the frequencies (Shift for ten lines, Home/End for the ends),
 *     up/down to an older or newer week.
 *   - Orbit: left/right along the shaft's path (Shift for ten points), Page Up/Down a whole turn,
 *     Home/End for the start and end.
 */
import type { Orbit } from "@pdm/contracts";
import { Button } from "@pdm/ui";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
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
type Cursor = { row: number; line: number };

const CURSOR_CLASS =
  "max-w-full rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pdm-focus-ring)]";

const hzText = (hz: number) => (hz >= 100 ? hz.toFixed(0) : hz.toFixed(1));

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
  // The cursor: which drawn week (0 = oldest) and which line of its spectrum.
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const hintId = useId();

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
  const pointAt = (row: number, line: number) => {
    const o = origin(n - 1 - row);
    const a = drawn[row]?.amps?.[line] ?? 0;
    return { x: o.x + (((line + 1) * df) / fMax) * specW, y: o.y - (a / yMax) * specH, base: o.y, amp: a };
  };
  // Where the cursor starts: the highlighted week (or the newest), at its biggest peak.
  const start = (): Cursor => {
    const found = drawn.findIndex((r) => r.t === selected);
    const row = found === -1 ? n - 1 : found;
    const amps = drawn[row]?.amps ?? [];
    return { row, line: Math.max(0, amps.indexOf(Math.max(...amps))) };
  };

  const onKey = (e: KeyboardEvent) => {
    if (n === 0) return;
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, (c: Cursor) => Cursor> = {
      ArrowLeft: (c) => ({ ...c, line: c.line - step }),
      ArrowRight: (c) => ({ ...c, line: c.line + step }),
      Home: (c) => ({ ...c, line: 0 }),
      End: (c) => ({ ...c, line: lines - 1 }),
      ArrowUp: (c) => ({ ...c, row: c.row - 1 }), // further back: older
      ArrowDown: (c) => ({ ...c, row: c.row + 1 }), // nearer the front: newer
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setCursor((c) => {
      const next = move(c ?? start());
      return { row: Math.min(n - 1, Math.max(0, next.row)), line: Math.min(lines - 1, Math.max(0, next.line)) };
    });
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    if (n === 0) return;
    const row = cursor?.row ?? start().row;
    const px = e.clientX - e.currentTarget.getBoundingClientRect().left - origin(n - 1 - row).x;
    const line = Math.round((px / specW) * lines) - 1;
    setCursor(line < 0 || line >= lines ? null : { row, line });
  };
  const at = cursor && drawn[cursor.row] ? { ...pointAt(cursor.row, cursor.line), date: drawn[cursor.row]!.date } : null;

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
          <svg
            role="img"
            aria-label={`${label}. ${summary}`}
            aria-describedby={hintId}
            tabIndex={0}
            width={width}
            height={height}
            onKeyDown={onKey}
            onBlur={() => setCursor(null)}
            onPointerMove={onPointer}
            onPointerLeave={() => setCursor(null)}
            className={CURSOR_CLASS}
          >
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
                {hz === 0 ? "0" : `${hzText(hz)} ${t("unitSymbol.Hz")}`}
              </text>
            ))}
            {at && (
              <g>
                <line x1={at.x} x2={at.x} y1={at.y - 12} y2={at.base} stroke="var(--pdm-text-secondary)" strokeWidth={1} />
                <circle cx={at.x} cy={at.y} r={4} fill="var(--pdm-series-1)" stroke="var(--pdm-bg-surface)" strokeWidth={2} />
              </g>
            )}
          </svg>
          <p id={hintId} className="sr-only">
            {t("vibration.cursor.waterfallKeys")}
          </p>
          <p role="status" className="min-h-5 text-xs text-fg-muted tabular-nums">
            {at && cursor && t("vibration.cursor.waterfall", { date: at.date, hz: hzText((cursor.line + 1) * df), amp: format(at.amp) })}
          </p>
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
  const [active, setActive] = useState<number | null>(null);
  const hintId = useId();
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
  const count = orbit.points.length;
  const ppr = Math.max(1, orbit.pointsPerRev);

  const onKey = (e: KeyboardEvent) => {
    if (count === 0) return;
    const step = e.shiftKey ? 10 : 1;
    const moves: Record<string, (i: number) => number> = {
      ArrowLeft: (i) => i - step,
      ArrowRight: (i) => i + step,
      PageUp: (i) => i - ppr,
      PageDown: (i) => i + ppr,
      Home: () => 0,
      End: () => count - 1,
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    setActive((i) => Math.min(count - 1, Math.max(0, move(i ?? 0))));
  };
  // The mouse picks the nearest point of the path, if it's close to it.
  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * size;
    const py = ((e.clientY - r.top) / r.height) * size;
    let best = -1;
    let bestD = 18 ** 2;
    orbit.points.forEach(([x, y], i) => {
      const d = (sx(x) - px) ** 2 + (sy(y) - py) ** 2;
      if (d < bestD) [best, bestD] = [i, d];
    });
    setActive(best === -1 ? null : best);
  };
  const point = active === null ? undefined : orbit.points[active];

  return (
    <div>
      <svg
        role="img"
        aria-label={`${label}. ${summary}`}
        aria-describedby={hintId}
        tabIndex={0}
        viewBox={`0 0 ${size} ${size}`}
        onKeyDown={onKey}
        onBlur={() => setActive(null)}
        onPointerMove={onPointer}
        onPointerLeave={() => setActive(null)}
        className={`w-full max-w-[320px] ${CURSOR_CLASS}`}
      >
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
        {point && (
          <g>
            <line
              x1={cx}
              x2={sx(point[0])}
              y1={cx}
              y2={sy(point[1])}
              stroke="var(--pdm-text-secondary)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
            <circle cx={sx(point[0])} cy={sy(point[1])} r={5} fill="var(--pdm-series-1)" stroke="var(--pdm-bg-surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      <p id={hintId} className="sr-only">
        {t("vibration.cursor.orbitKeys")}
      </p>
      <p role="status" className="min-h-5 text-xs text-fg-muted tabular-nums">
        {point &&
          active !== null &&
          t("vibration.cursor.orbit", {
            turn: Math.floor(active / ppr) + 1,
            turns: Math.ceil(count / ppr),
            deg: Math.round(((active % ppr) / ppr) * 360),
            x: point[0].toFixed(1),
            y: point[1].toFixed(1),
          })}
      </p>
    </div>
  );
}
