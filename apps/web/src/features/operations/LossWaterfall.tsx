/**
 * Where the energy went, from sunlight to grid, as a horizontal waterfall: the first bar is
 * what the panels' nameplate would make from the sunlight that fell; each loss then takes its
 * slice off the end; the last bar is what was delivered. Rows read top to bottom in the order
 * the losses happen.
 *
 * Built to the dataviz rules: bars at most 20 px thick with 4 px rounded ends, totals in the
 * first series colour and losses in the second (identity, not status), values in text colours
 * at the bar ends. "Show as table" gives the same numbers.
 */
import type { SolarWaterfall } from "@pdm/contracts";
import { Button } from "@pdm/ui";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatMwh } from "./power-format";

const ROW = 30;

/** A loss takes energy away (−); a negative loss, like cool panels on a cold morning, adds it (+). */
const lossText = (kwh: number) => (kwh >= 0 ? `−${formatMwh(kwh)}` : `+${formatMwh(-kwh)}`);
const BAR = 20;
const LABEL_W = 190;
const VALUE_W = 130;

/** A bar with rounded corners at both ends (the rows float, so neither end sits on a baseline). */
function barPath(x: number, y: number, w: number, h: number): string {
  const r = Math.min(4, w / 2, h / 2);
  if (w <= 0) return "";
  return `M${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h - r}Q${x + w},${y + h} ${x + w - r},${y + h}H${x + r}Q${x},${y + h} ${x},${y + h - r}V${y + r}Q${x},${y} ${x + r},${y}Z`;
}

export function LossWaterfall({ waterfall, label }: { waterfall: SolarWaterfall; label: string }) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [asTable, setAsTable] = useState(false);

  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(([e]) => e && setWidth(Math.max(320, e.contentRect.width)));
    o.observe(el);
    return () => o.disconnect();
  }, [asTable]);

  const { sunKwh, losses, actualKwh } = waterfall;
  const pct = (kwh: number) => (sunKwh > 0 ? (100 * kwh) / sunKwh : 0);
  // Rows: the sunlight, each loss (start → end), what was delivered. A loss starts where all
  // the losses before it left off.
  const lostBefore = (i: number) => losses.slice(0, i).reduce((s, l) => s + l.kwh, 0);
  const rows = [
    { key: "sun", name: t("solar.waterfall.sun"), from: 0, to: sunKwh, total: true, kwh: sunKwh },
    ...losses.map((l, i) => {
      const top = sunKwh - lostBefore(i);
      return { key: l.step, name: t(`solar.loss.${l.step}`), from: top - l.kwh, to: top, total: false, kwh: l.kwh };
    }),
    { key: "actual", name: t("solar.waterfall.actual"), from: 0, to: actualKwh, total: true, kwh: actualKwh },
  ];
  const biggest = [...losses].sort((a, b) => b.kwh - a.kwh)[0];
  const summary = t("solar.waterfall.summary", {
    sun: formatMwh(sunKwh),
    actual: formatMwh(actualKwh),
    pr: pct(actualKwh).toFixed(1),
    biggest: biggest ? t(`solar.loss.${biggest.step}`) : "—",
    biggestPct: biggest ? pct(biggest.kwh).toFixed(1) : "0",
  });

  const narrow = width < 560;
  const labelW = narrow ? 120 : LABEL_W;
  const valueW = narrow ? 96 : VALUE_W;
  const plotW = Math.max(60, width - labelW - valueW);
  const max = Math.max(sunKwh, ...rows.map((r) => Math.max(r.from, r.to)));
  const x = (kwh: number) => labelW + (Math.max(0, kwh) / (max || 1)) * plotW;
  const height = rows.length * ROW + 4;

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-fg-muted">{summary}</p>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {t(asTable ? "chart.showChart" : "chart.showTable")}
        </Button>
      </div>
      {asTable ? (
        <table className="w-full text-sm">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="py-1 font-medium">
                {t("solar.waterfall.step")}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {t("solar.waterfall.energy")}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {t("solar.waterfall.share")}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-b border-line last:border-0">
                <th scope="row" className="py-1 text-left font-normal">
                  {r.name}
                </th>
                <td className="py-1 text-right tabular-nums">{r.total ? formatMwh(r.kwh) : lossText(r.kwh)}</td>
                <td className="py-1 text-right tabular-nums">{pct(r.kwh).toFixed(1)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div ref={box}>
          <svg role="img" aria-label={`${label}. ${summary}`} width={width} height={height} className="max-w-full">
            {rows.map((r, i) => {
              const y = i * ROW + (ROW - BAR) / 2;
              const left = x(Math.min(r.from, r.to));
              const w = Math.max(1, Math.abs(x(r.to) - x(r.from)));
              return (
                <g key={r.key}>
                  <text x={0} y={y + BAR / 2} dominantBaseline="middle" fontSize={12} fill="var(--pdm-text-primary)">
                    {r.name}
                  </text>
                  <path d={barPath(left, y, w, BAR)} fill={r.total ? "var(--pdm-series-1)" : "var(--pdm-series-2)"} />
                  {/* A thin line joins each step to the next, so the eye follows the drop. */}
                  {i < rows.length - 1 && !rows[i + 1]!.total && (
                    <line
                      x1={x(r.total ? r.to : r.from)}
                      x2={x(r.total ? r.to : r.from)}
                      y1={y + BAR}
                      y2={y + ROW}
                      stroke="var(--pdm-text-secondary)"
                      strokeWidth={1}
                    />
                  )}
                  <text x={left + w + 6} y={y + BAR / 2} dominantBaseline="middle" fontSize={11} fill="var(--pdm-text-secondary)">
                    {r.total ? formatMwh(r.kwh) : `${lossText(r.kwh)} · ${pct(Math.abs(r.kwh)).toFixed(1)} %`}
                  </text>
                </g>
              );
            })}
          </svg>
        </div>
      )}
    </div>
  );
}
