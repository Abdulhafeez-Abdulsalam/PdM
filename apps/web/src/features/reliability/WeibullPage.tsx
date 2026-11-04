/**
 * Weibull analysis (spec §6.7): for one type of equipment and one way it fails, how does the
 * chance of failure grow with running time? β says whether failures come early (β < 1), at
 * random (β ≈ 1) or from wear (β > 1), which decides whether replacing on a schedule helps.
 *
 * Two charts, each with one y-axis: the probability plot ("Weibull paper", where a Weibull is a
 * straight line, so you can see how well it fits) and the reliability curve with its band.
 */
import { useApiQuery } from "@pdm/api-client";
import { AssetClass, FailureModeCode, type WeibullAnalysis } from "@pdm/contracts";
import { KpiCard, Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatNumber } from "../../shared/format";
import { useGlobalSearch } from "../../shared/time-range";
import { LineChart } from "../../shared/widgets/LineChart";
import { ReliabilityNav } from "./ReliabilityNav";

const searchSchema = z.object({
  class: AssetClass.catch("pump").default("pump"),
  mode: FailureModeCode.optional().catch(undefined),
});

export function WeibullPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();
  const set = (patch: Record<string, string | undefined>) =>
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }), replace: true });
  const data = useApiQuery(
    "reliability.weibull",
    { assetClass: search.class, mode: search.mode, scopeId },
    { placeholderData: keepPreviousData, refetchInterval: 120_000 },
  );

  useEffect(() => {
    document.title = `${t("weibull.title")} · ${t("app.name")}`;
  }, [t]);

  const r = data.data;
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.reliability.name")}</h1>
        <p className="text-fg-muted">{t("weibull.intro")}</p>
      </header>
      <ReliabilityNav />
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t("reliability.classLabel")}
          value={search.class}
          options={AssetClass.options.map((c) => ({ value: c, label: t(`assetClass.${c}`) }))}
          onChange={(v) => set({ class: v, mode: undefined })}
        />
        <Select
          label={t("weibull.modeLabel")}
          value={r?.mode ?? search.mode ?? ""}
          options={(r?.modes ?? []).map((m) => ({
            value: m.mode,
            label: t("weibull.modeOption", { name: t(`iso14224.mode.${m.mode}`), count: m.failures }),
          }))}
          onChange={(v) => set({ mode: v })}
        />
      </div>
      {data.isPending ? (
        <Skeleton className="h-96" />
      ) : data.isError || !r ? (
        <p className="text-health-warning">{t("widget.failed")}</p>
      ) : (
        <div className={cx("flex flex-col gap-4 transition-opacity", data.isPlaceholderData && "opacity-60")}>
          <Summary r={r} />
          {r.fit && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <section aria-labelledby="wb-plot" className="rounded-lg border border-line bg-surface p-4">
                <h2 id="wb-plot" className="font-semibold">
                  {t("weibull.plotTitle")}
                </h2>
                <p className="mb-2 text-sm text-fg-muted">{t("weibull.plotIntro")}</p>
                <WeibullPlot r={r} />
              </section>
              <section aria-labelledby="wb-curve" className="rounded-lg border border-line bg-surface p-4">
                <h2 id="wb-curve" className="font-semibold">
                  {t("weibull.curveTitle")}
                </h2>
                <p className="mb-2 text-sm text-fg-muted">{t("weibull.curveIntro")}</p>
                <LineChart
                  times={r.curve.map((p) => p.days)}
                  series={[
                    {
                      id: "r",
                      label: t("weibull.reliability"),
                      values: r.curve.map((p) => p.reliability * 100),
                      color: "var(--pdm-series-1)",
                    },
                    {
                      id: "hi",
                      label: t("weibull.bandHigh"),
                      values: r.curve.map((p) => p.high * 100),
                      color: "var(--pdm-series-2)",
                      dashed: true,
                    },
                    {
                      id: "lo",
                      label: t("weibull.bandLow"),
                      values: r.curve.map((p) => p.low * 100),
                      color: "var(--pdm-series-2)",
                      dashed: true,
                    },
                  ]}
                  label={t("weibull.curveLabel")}
                  summary={t("weibull.curveSummary", { b10: formatNumber(r.fit.b10Days), mttf: formatNumber(r.fit.mttfDays) })}
                  format={(v) => `${formatNumber(v)} %`}
                  formatTime={(d) => t("weibull.dayN", { n: formatNumber(d) })}
                  formatTick={(d) => formatNumber(d)}
                  thresholds={[{ value: 90, label: t("weibull.b10Line") }]}
                  includeZero
                  endLabels={false}
                />
              </section>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Summary({ r }: { r: WeibullAnalysis }) {
  const { t } = useTranslation();
  const f = r.fit;
  return (
    <section aria-label={t("weibull.summaryLabel")} className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">{t("weibull.data", { failures: r.failures, suspensions: r.suspensions })}</p>
      {!f ? (
        <p className="text-fg-muted">{t("weibull.tooFew")}</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              label={t("weibull.beta")}
              value={f.beta.toFixed(2)}
              target={t("weibull.between", { low: f.betaLow.toFixed(2), high: f.betaHigh.toFixed(2) })}
            />
            <KpiCard
              label={t("weibull.eta")}
              value={t("reliability.days", { value: formatNumber(f.etaDays) })}
              target={t("weibull.between", { low: formatNumber(f.etaLowDays), high: formatNumber(f.etaHighDays) })}
            />
            <KpiCard label={t("weibull.b10")} value={t("reliability.days", { value: formatNumber(f.b10Days) })} />
            <KpiCard label={t("weibull.mttf")} value={t("reliability.days", { value: formatNumber(f.mttfDays) })} />
          </div>
          <div className="rounded-lg border border-line bg-surface p-4">
            <h2 className="font-semibold">{t(`weibull.pattern.${f.pattern}`)}</h2>
            <p className="text-sm">{t(`weibull.patternMeans.${f.pattern}`, { b10: formatNumber(f.b10Days) })}</p>
          </div>
        </>
      )}
    </section>
  );
}

// ─── Weibull paper ───────────────────────────────────────────────────────────

const H = 300;
const PAD = { top: 12, right: 12, bottom: 30, left: 48 };
/** Gridlines on the unreliability axis, %. */
const F_LINES = [1, 2, 5, 10, 20, 30, 50, 63.2, 80, 90, 95, 99];
const wy = (pct: number) => Math.log(-Math.log(1 - pct / 100));

/**
 * The probability plot: running time on a log scale across, the share failed on a Weibull scale
 * up. On this paper a Weibull distribution is a straight line with slope β, crossing 63.2 % at η.
 * Points far from the line mean one Weibull doesn't describe the data (e.g. two failure causes mixed).
 */
function WeibullPlot({ r }: { r: WeibullAnalysis }) {
  const { t } = useTranslation();
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const o = new ResizeObserver(([e]) => e && setWidth(Math.max(320, e.contentRect.width)));
    o.observe(el);
    return () => o.disconnect();
  }, [asTable]);

  const fit = r.fit!;
  const pts = r.points.filter((p) => p.days > 0 && p.unreliabilityPct > 0 && p.unreliabilityPct < 100);
  const lo = Math.floor(Math.log10(Math.max(0.1, Math.min(...pts.map((p) => p.days), fit.b10Days))));
  const hi = Math.ceil(Math.log10(Math.max(...pts.map((p) => p.days), fit.etaDays * 1.5)));
  const plotW = width - PAD.left - PAD.right;
  const x = (days: number) => PAD.left + ((Math.log10(days) - lo) / (hi - lo)) * plotW;
  const yMin = wy(0.5);
  const yMax = wy(99.5);
  const y = (pct: number) => PAD.top + (1 - (wy(pct) - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  const decades = Array.from({ length: hi - lo + 1 }, (_, i) => 10 ** (lo + i));
  // The fitted line: F(t) = 1 − exp(−(t/η)^β).
  const F = (d: number) => 100 * (1 - Math.exp(-Math.pow(d / fit.etaDays, fit.beta)));
  const t0 = 10 ** lo;
  const t1 = 10 ** hi;
  const clampPct = (p: number) => Math.min(99.5, Math.max(0.5, p));

  const onKey = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const n = pts.length;
    setActive((a) => Math.min(n - 1, Math.max(0, (a ?? (e.key === "ArrowLeft" ? n : -1)) + (e.key === "ArrowLeft" ? -1 : 1))));
  };
  const current = active === null ? null : pts[active];
  const label = t("weibull.plotLabel");
  const summary = t("weibull.plotSummary", { n: pts.length, beta: fit.beta.toFixed(2), eta: formatNumber(fit.etaDays) });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <ul aria-label={t("chart.legend")} className="flex flex-wrap gap-x-4 text-xs text-fg-muted">
          <li className="flex items-center gap-1.5">
            <svg aria-hidden width={10} height={10}>
              <circle cx={5} cy={5} r={4} fill="var(--pdm-series-1)" />
            </svg>
            {t("weibull.failuresPoints")}
          </li>
          <li className="flex items-center gap-1.5">
            <svg aria-hidden width={18} height={4}>
              <line x1={0} x2={18} y1={2} y2={2} stroke="var(--pdm-series-2)" strokeWidth={2} />
            </svg>
            {t("weibull.fittedLine")}
          </li>
        </ul>
        <button
          type="button"
          className="rounded-md px-2 py-1 text-sm hover:bg-sunken"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
        >
          {t(asTable ? "chart.showChart" : "chart.showTable")}
        </button>
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
                  {t("weibull.colDays")}
                </th>
                <th scope="col" className="py-1 text-right font-medium">
                  {t("weibull.colFailed")}
                </th>
              </tr>
            </thead>
            <tbody>
              {pts.map((p, i) => (
                <tr key={i} className="border-b border-line last:border-0">
                  <td className="py-1 tabular-nums">{formatNumber(p.days, 1)}</td>
                  <td className="py-1 text-right tabular-nums">{p.unreliabilityPct.toFixed(1)} %</td>
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
            height={H}
            onKeyDown={onKey}
            onBlur={() => setActive(null)}
            className="max-w-full rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pdm-focus-ring)]"
          >
            {F_LINES.map((p) => (
              <g key={p}>
                <line x1={PAD.left} x2={width - PAD.right} y1={y(p)} y2={y(p)} stroke="var(--pdm-grid)" strokeWidth={1} />
                <text x={PAD.left - 6} y={y(p)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--pdm-text-secondary)">
                  {p} %
                </text>
              </g>
            ))}
            {decades.map((d) => (
              <g key={d}>
                <line x1={x(d)} x2={x(d)} y1={PAD.top} y2={H - PAD.bottom} stroke="var(--pdm-grid)" strokeWidth={1} />
                <text x={x(d)} y={H - 12} textAnchor="middle" fontSize={11} fill="var(--pdm-text-secondary)">
                  {formatNumber(d)}
                </text>
              </g>
            ))}
            <text x={width - PAD.right} y={H - 1} textAnchor="end" fontSize={11} fill="var(--pdm-text-secondary)">
              {t("weibull.axisDays")}
            </text>
            <line x1={x(t0)} y1={y(clampPct(F(t0)))} x2={x(t1)} y2={y(clampPct(F(t1)))} stroke="var(--pdm-series-2)" strokeWidth={2} />
            {pts.map((p, i) => (
              <circle
                key={i}
                cx={x(p.days)}
                cy={y(p.unreliabilityPct)}
                r={active === i ? 5 : 3}
                fill="var(--pdm-series-1)"
                stroke={active === i ? "var(--pdm-text-primary)" : "var(--pdm-bg-surface)"}
                strokeWidth={1}
              />
            ))}
          </svg>
          <div role="status">
            {current && (
              <div className="pointer-events-none absolute top-0 right-0 rounded-md border border-line bg-raised px-2 py-1 text-xs shadow-2">
                {t("weibull.pointTip", { days: formatNumber(current.days), pct: current.unreliabilityPct.toFixed(1) })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
