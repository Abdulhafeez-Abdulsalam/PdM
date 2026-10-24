/**
 * Energy and ESG (Phase 4, chunk 4), the ESG Lead's home page: "are we on track for emissions
 * targets?" Emissions over the last 90 days from fuel burned, flaring and methane, worked out
 * from the plant's own measurements; each site's intensity and where it's heading against this
 * year's target; what solar output saved the grid; and the biggest emitters, with the part
 * poor equipment health adds (a fouled turbine, a leaking pipeline, flaring while a compressor
 * was down). That last column is where maintenance and ESG meet.
 */
import { useApiQuery } from "@pdm/api-client";
import { ESG_DAYS, GWP_CH4, type EsgIntensity } from "@pdm/contracts";
import { HealthBadge, KpiCard, Skeleton } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, TrendingUp } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../shared/format";
import { useGlobalSearch } from "../../shared/time-range";
import { LineChart } from "../../shared/widgets/LineChart";

const tonnes = (v: number) => formatNumber(Math.round(v));

export function EsgPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const data = useApiQuery("esg.overview", { scopeId }, { refetchInterval: 300_000 });

  useEffect(() => {
    document.title = `${t("modules.esg.name")} · ${t("app.name")}`;
  }, [t]);

  const o = data.data;
  const intensity = (i: EsgIntensity | null) =>
    i === null ? "—" : t(`esg.intensity.${i.unit}`, { value: i.unit === "t_per_mwh" ? i.value.toFixed(3) : formatNumber(i.value, 1) });
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.esg.name")}</h1>
        <p className="text-fg-muted">{t("esg.intro", { days: ESG_DAYS })}</p>
      </header>
      {!o ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <section aria-label={t("esg.kpisLabel")} className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <KpiCard
              label={t("esg.kpi.co2e", { days: ESG_DAYS })}
              value={tonnes(o.totals.co2e)}
              unit={t("esg.unit.co2e")}
              lineage={t("esg.kpi.co2eHow")}
            />
            <KpiCard
              label={t("esg.kpi.projected")}
              value={tonnes(o.totals.projectedAnnual)}
              unit={t("esg.unit.t")}
              target={t("esg.kpi.target", { target: tonnes(o.totals.annualTarget) })}
            />
            <KpiCard
              label={t("esg.kpi.methane")}
              value={tonnes(o.totals.methane)}
              unit={t("esg.unit.co2e")}
              target={t("esg.kpi.flaring", { value: tonnes(o.totals.flaring) })}
              lineage={t("esg.kpi.methaneHow", { gwp: GWP_CH4 })}
            />
            <KpiCard
              label={t("esg.kpi.avoided")}
              value={tonnes(o.totals.avoided)}
              unit={t("esg.unit.co2")}
              lineage={t("esg.kpi.avoidedHow")}
            />
            <KpiCard
              label={t("esg.kpi.avoidable")}
              value={tonnes(o.totals.avoidable)}
              unit={t("esg.unit.co2e")}
              lineage={t("esg.kpi.avoidableHow")}
            />
          </section>

          <section aria-labelledby="esg-daily" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="esg-daily" className="font-semibold">
              {t("esg.dailyTitle")}
            </h2>
            <p className="mb-2 text-sm text-fg-muted">{t("esg.dailyIntro")}</p>
            <LineChart
              times={o.days.map((d) => Date.parse(`${d.date}T00:00:00Z`))}
              series={[
                {
                  id: "emitted",
                  label: t("esg.emitted"),
                  values: o.days.map((d) => d.combustion + d.flaring + d.methane),
                  color: "var(--pdm-series-1)",
                },
                {
                  id: "avoided",
                  label: t("esg.avoidedLine"),
                  values: o.days.map((d) => d.avoided),
                  color: "var(--pdm-series-2)",
                  dashed: true,
                },
              ]}
              label={t("esg.dailyLabel", { days: ESG_DAYS })}
              summary={t("esg.dailySummary", {
                combustion: tonnes(o.totals.combustion),
                flaring: tonnes(o.totals.flaring),
                methane: tonnes(o.totals.methane),
                avoided: tonnes(o.totals.avoided),
              })}
              format={(v) => t("esg.tonnes", { value: formatNumber(Math.round(v)) })}
              formatTime={(ms) =>
                new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
              }
              formatTick={(ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
              includeZero
            />
          </section>

          <section aria-labelledby="esg-sites" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="esg-sites" className="font-semibold">
              {t("esg.sitesTitle")}
            </h2>
            <p className="mb-3 text-sm text-fg-muted">{t("esg.sitesIntro")}</p>
            <div className="relative -mx-4 overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <caption className="sr-only">{t("esg.sitesCaption")}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-1 font-medium">
                      {t("esg.col.site")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("esg.col.co2e", { days: ESG_DAYS })}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("esg.col.methane")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("esg.col.intensity")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("esg.col.target")}
                    </th>
                    <th scope="col" className="py-1 pr-4 text-right font-medium">
                      {t("esg.col.avoided")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {o.sites.map((s) => {
                    const onTrack = s.projectedAnnual <= s.annualTarget;
                    return (
                      <tr key={s.siteId} className="border-b border-line last:border-0">
                        <th scope="row" className="px-4 py-1.5 text-left font-normal">
                          {s.siteName}
                          <span className="block text-xs text-fg-muted">{t(`businessLine.${s.businessLine}`)}</span>
                        </th>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{tonnes(s.co2e)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{s.co2e > 0 ? `${formatNumber(s.methaneShare, 1)} %` : "—"}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{intensity(s.intensity)}</td>
                        <td className="py-1.5 pr-3">
                          {s.co2e === 0 ? (
                            <span className="text-fg-muted">{t("esg.noDirect")}</span>
                          ) : (
                            <span
                              className={`inline-flex items-center gap-1 ${onTrack ? "text-health-healthy" : "font-medium text-health-warning"}`}
                            >
                              {onTrack ? (
                                <CheckCircle2 aria-hidden className="size-3.5" />
                              ) : (
                                <TrendingUp aria-hidden className="size-3.5" />
                              )}
                              {t(onTrack ? "esg.onTrack" : "esg.offTrack", {
                                projected: tonnes(s.projectedAnnual),
                                target: tonnes(s.annualTarget),
                              })}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">{s.avoided > 0 ? tonnes(s.avoided) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          <section aria-labelledby="esg-emitters" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="esg-emitters" className="font-semibold">
              {t("esg.emittersTitle")}
            </h2>
            <p className="mb-3 text-sm text-fg-muted">{t("esg.emittersIntro")}</p>
            <div className="relative -mx-4 overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <caption className="sr-only">{t("esg.emittersCaption")}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-1 font-medium">
                      {t("esg.col.asset")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("esg.col.source")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("esg.col.co2e", { days: ESG_DAYS })}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("esg.col.avoidable")}
                    </th>
                    <th scope="col" className="py-1 pr-4 font-medium">
                      {t("esg.col.health")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {o.emitters.map((e) => (
                    <tr key={`${e.assetId}-${e.source}`} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-1.5 text-left font-normal">
                        <Link
                          to="/assets/$assetId/$tab"
                          params={{ assetId: e.assetId, tab: "overview" }}
                          className="font-mono text-accent underline"
                        >
                          {e.assetId}
                        </Link>
                        <span className="block text-xs text-fg-muted">{t(`assetClass.${e.assetClass}`)}</span>
                      </th>
                      <td className="py-1.5 pr-3">{t(`esg.source.${e.source}`)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{tonnes(e.co2e)}</td>
                      <td className="py-1.5 pr-3">
                        {e.reason ? (
                          <span className="font-medium text-health-warning">
                            {t(`esg.reason.${e.reason}`, { value: tonnes(e.avoidable) })}
                          </span>
                        ) : (
                          <span className="text-fg-muted">—</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-4">
                        <HealthBadge state={e.health} label={t(`health.${e.health}`)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
