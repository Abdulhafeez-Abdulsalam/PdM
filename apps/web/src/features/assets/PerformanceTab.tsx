/**
 * Asset 360 → Performance: each kind of equipment shows its own measures. So far: gas
 * turbines (efficiency against a clean machine, inspection hours), transformers (oil
 * analysis), and solar inverters, strings and batteries. Oil & gas equipment joins next.
 */
import { useApiQuery } from "@pdm/api-client";
import { EOH_PER_START, HGP_INTERVAL_EOH, type Asset, type GasTurbineRow, type TransformerDga } from "@pdm/contracts";
import { KpiCard, Skeleton } from "@pdm/ui";
import { Droplets } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate, formatNumber } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { ConditionLabel, GasTable } from "../operations/DgaSection";
import { DuvalTriangle } from "../operations/DuvalTriangle";
import { InspectionCell } from "../operations/InspectionCell";
import { formatIn, signed } from "../operations/power-format";
import { BessPerformanceView, InverterPerformanceView, StringPerformanceView } from "../operations/SolarPerformance";
import { TurbineTrend } from "../operations/TurbineTrend";

/** Classes with a Performance tab. */
export const PERFORMANCE_CLASSES: ReadonlySet<Asset["assetClass"]> = new Set([
  "gas_turbine",
  "transformer",
  "inverter",
  "pv_string",
  "bess",
]);

export function PerformanceTab({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const perf = useApiQuery("assets.performance", { assetId: asset.id }, { refetchInterval: 60_000 });
  if (perf.isPending) return <Skeleton className="h-96" />;
  if (!perf.data) return <p className="text-health-warning">{t("widget.failed")}</p>;
  if (perf.data.kind === "gas_turbine") return <TurbinePerformance row={perf.data.turbine} />;
  if (perf.data.kind === "transformer") return <TransformerPerformance dga={perf.data.dga} />;
  if (perf.data.kind === "inverter") return <InverterPerformanceView data={perf.data.inverter} />;
  if (perf.data.kind === "pv_string") return <StringPerformanceView data={perf.data.string} />;
  if (perf.data.kind === "bess") return <BessPerformanceView data={perf.data.bess} />;
  return <p className="text-fg-muted">{t("performance.none")}</p>;
}

function TurbinePerformance({ row }: { row: GasTurbineRow }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  const n = (v: number) => formatNumber(v);
  return (
    <div className="flex flex-col gap-4">
      {row.washRecommended && (
        <p className="flex items-center gap-2 rounded-lg border border-line bg-surface p-3 text-sm">
          <Droplets aria-hidden className="size-4 text-health-warning" />
          {t("performance.washAdvice")}
        </p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("performance.heatRate")}
          value={row.heatRate === null ? "—" : formatIn(row.heatRate, "heat_rate", units, t)}
          target={
            row.heatRateExpected === null
              ? undefined
              : t("power.baseline", { value: formatIn(row.heatRateExpected, "heat_rate", units, t) })
          }
          change={
            row.heatRateDeviationPct === null ? undefined : t("performance.vsBaseline", { value: `${signed(row.heatRateDeviationPct)} %` })
          }
          changeTone={(row.heatRateDeviationPct ?? 0) > 0.5 ? "bad" : "neutral"}
          changeDirection={(row.heatRateDeviationPct ?? 0) > 0.5 ? "up" : "flat"}
        />
        <KpiCard
          label={t("performance.compEff")}
          value={row.compressorEff === null ? "—" : `${row.compressorEff.toFixed(1)} %`}
          target={
            row.compressorEffExpected === null ? undefined : t("power.baseline", { value: `${row.compressorEffExpected.toFixed(1)} %` })
          }
          change={
            row.compressorEffDeviationPts === null
              ? undefined
              : t("performance.vsBaseline", { value: t("power.pts", { value: signed(row.compressorEffDeviationPts, 2) }) })
          }
          changeTone={(row.compressorEffDeviationPts ?? 0) < -0.3 ? "bad" : "neutral"}
          changeDirection={(row.compressorEffDeviationPts ?? 0) < -0.3 ? "down" : "flat"}
        />
        <KpiCard
          label={t("power.col.spread")}
          value={row.exhaustSpread === null ? "—" : formatIn(row.exhaustSpread, "temperature_difference", units, t, 1)}
        />
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-3">
          <p className="text-xs font-medium text-fg-muted">{t("power.col.inspection")}</p>
          <InspectionCell eoh={row.eoh} />
        </div>
      </div>

      <section aria-labelledby="perf-trend" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="perf-trend" className="font-semibold">
          {t("performance.trendTitle")}
        </h2>
        <p className="mb-3 text-sm text-fg-muted">{t("power.trendIntro")}</p>
        <TurbineTrend assetId={row.assetId} />
      </section>

      <section aria-labelledby="perf-eoh" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="perf-eoh" className="font-semibold">
          {t("performance.eohTitle")}
        </h2>
        <p className="mb-3 text-sm text-fg-muted">
          {t("performance.eohIntro", { perStart: EOH_PER_START, interval: HGP_INTERVAL_EOH.toLocaleString("en-US") })}
        </p>
        <dl className="grid max-w-xl grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
          <dt className="text-fg-muted">{t("performance.eohTotal")}</dt>
          <dd className="text-right tabular-nums">{n(row.eoh.total)}</dd>
          <dt className="text-fg-muted">{t("performance.eohSince")}</dt>
          <dd className="text-right tabular-nums">{n(row.eoh.sinceInspection)}</dd>
          <dt className="text-fg-muted">{t("performance.starts")}</dt>
          <dd className="text-right tabular-nums">{n(row.eoh.starts)}</dd>
          <dt className="text-fg-muted">{t("performance.startsSince")}</dt>
          <dd className="text-right tabular-nums">{n(row.eoh.startsSinceInspection)}</dd>
          <dt className="text-fg-muted">{t("performance.perDay")}</dt>
          <dd className="text-right tabular-nums">{formatNumber(row.eoh.perDay, 1)}</dd>
          <dt className="text-fg-muted">{t("performance.next")}</dt>
          <dd className="text-right">
            {t(`power.inspection.${row.eoh.nextType}`)}
            {row.eoh.nextDueAt && (
              <span className="block text-fg-muted">{t("power.dueAbout", { date: formatDate(row.eoh.nextDueAt) })}</span>
            )}
          </dd>
        </dl>
      </section>
    </div>
  );
}

function TransformerPerformance({ dga }: { dga: TransformerDga }) {
  const { t } = useTranslation();
  const latest = dga.samples[0]!;
  // Oldest first, so the path runs forward in time.
  const history = [...dga.samples].reverse();
  const marks = history.flatMap((s, i) =>
    s.duval ? [{ id: s.sampledAt, label: formatDate(s.sampledAt), ...s.duval, emphasis: i === history.length - 1 }] : [],
  );
  const first = marks[0];
  const last = marks.at(-1);
  const summary =
    first && last
      ? t("performance.duvalSummary", {
          count: marks.length,
          from: t(`dga.zone.${first.zone}`),
          to: t(`dga.zone.${last.zone}`),
        })
      : "";
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <section aria-labelledby="dga-latest" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="dga-latest" className="font-semibold">
            {t("performance.latestSample", { date: formatDate(latest.sampledAt) })}
          </h2>
          <div className="my-2">
            <ConditionLabel sample={latest} />
          </div>
          <GasTable sample={latest} />
          <p className="mt-2 text-xs text-fg-muted">{t("dga.conditionNote")}</p>
        </section>
        <section aria-labelledby="dga-tri" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="dga-tri" className="font-semibold">
            {t("performance.duvalTitle")}
          </h2>
          <p className="mb-2 text-sm text-fg-muted">{summary}</p>
          <DuvalTriangle marks={marks} path label={t("performance.duvalLabel", { id: dga.assetId })} summary={summary} />
        </section>
      </div>
      <section aria-labelledby="dga-history" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="dga-history" className="font-semibold">
          {t("performance.samplesTitle")}
        </h2>
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <caption className="sr-only">{t("performance.samplesTitle")}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("dga.col.sampled")}
                </th>
                {(["H2", "CH4", "C2H4", "C2H2"] as const).map((g) => (
                  <th key={g} scope="col" className="py-2 pr-3 text-right font-medium">
                    {t(`dga.gas.${g}`)}
                  </th>
                ))}
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("dga.col.tdcg")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("dga.col.condition")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("dga.col.zone")}
                </th>
              </tr>
            </thead>
            <tbody>
              {dga.samples.map((s) => (
                <tr key={s.sampledAt} className="border-b border-line last:border-0">
                  <td className="px-4 py-2">{formatDate(s.sampledAt)}</td>
                  {(["H2", "CH4", "C2H4", "C2H2"] as const).map((g) => (
                    <td key={g} className="py-2 pr-3 text-right tabular-nums">
                      {formatNumber(s.gases[g], 1)}
                    </td>
                  ))}
                  <td className="py-2 pr-3 text-right tabular-nums">{formatNumber(s.tdcg)}</td>
                  <td className="py-2 pr-3">{t(`dga.condition.${s.condition}`)}</td>
                  <td className="px-4 py-2">{s.duval ? t(`dga.zone.${s.duval.zone}`) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
