/**
 * HSE overview (Phase 4, chunk 3), the HSE Officer's home page: "is anything safety-critical at
 * risk?" Safety-critical equipment and which is impaired (poor health, PM overdue, an active P1
 * alarm), permits waiting to be issued, process safety events by tier over the last year, near
 * misses, and changes still open.
 */
import { useApiQuery } from "@pdm/api-client";
import { Button, HealthBadge, KpiCard, Skeleton } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../shared/format";
import { useGlobalSearch } from "../../shared/time-range";
import { ColumnChart } from "../../shared/widgets/ColumnChart";
import { HseHeader } from "./HseNav";

const FIRST = 50;

export function HsePage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const data = useApiQuery("hse.overview", { scopeId }, { refetchInterval: 60_000 });
  const [all, setAll] = useState(false);

  useEffect(() => {
    document.title = `${t("modules.hse.name")} · ${t("app.name")}`;
  }, [t]);

  const o = data.data;
  const impaired = o?.sces.filter((s) => s.reasons.length > 0) ?? [];
  const shown = all ? (o?.sces ?? []) : impaired.slice(0, FIRST);
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <HseHeader intro={t("hse.intro")} />
      {!o ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <section aria-label={t("hse.kpisLabel")} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard
              label={t("hse.kpi.impaired")}
              value={formatNumber(o.counts.impaired)}
              target={t("hse.kpi.ofSces", { count: o.counts.sces })}
              lineage={t("hse.kpi.impairedHow")}
            />
            <KpiCard
              label={t("hse.kpi.permitsWaiting")}
              value={formatNumber(o.counts.permitsWaiting)}
              target={t("hse.kpi.permitsIssued", { count: o.counts.permitsIssued })}
            />
            <KpiCard
              label={t("hse.kpi.daysSinceTier1")}
              value={o.daysSinceTier1 === null ? "—" : formatNumber(o.daysSinceTier1)}
              target={t("hse.kpi.tiers", { tier1: o.counts.tier1, tier2: o.counts.tier2 })}
              lineage={t("hse.kpi.tierHow")}
            />
            <KpiCard
              label={t("hse.kpi.nearMisses")}
              value={formatNumber(o.counts.nearMisses)}
              target={t("hse.kpi.openMoc", { count: o.counts.openMoc })}
            />
          </section>

          <section aria-labelledby="hse-monthly" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="hse-monthly" className="font-semibold">
              {t("hse.monthlyTitle")}
            </h2>
            <p className="mb-2 text-sm text-fg-muted">{t("hse.monthlyIntro")}</p>
            <ColumnChart
              columns={o.monthly.map((m) => {
                const month = new Date(`${m.month}-01T00:00:00Z`);
                return {
                  key: m.month,
                  tick: month.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
                  name: month.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
                  value: m.tier1 + m.tier2,
                  line: m.nearMiss,
                };
              })}
              format={(v) => formatNumber(v)}
              valueName={t("hse.pse")}
              lineName={t("hse.nearMissLine")}
              label={t("hse.monthlyLabel")}
              summary={t("hse.monthlySummary", { tier1: o.counts.tier1, tier2: o.counts.tier2, nearMisses: o.counts.nearMisses })}
              height={180}
            />
          </section>

          <section aria-labelledby="hse-sces" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="hse-sces" className="font-semibold">
              {t(all ? "hse.scesAllTitle" : "hse.scesTitle", { count: all ? o.sces.length : impaired.length })}
            </h2>
            <p className="mb-3 text-sm text-fg-muted">{t("hse.scesIntro")}</p>
            {shown.length === 0 ? (
              <p className="text-sm">{t("hse.noneImpaired")}</p>
            ) : (
              <div className="relative -mx-4 max-h-[32rem] overflow-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <caption className="sr-only">{t("hse.scesCaption")}</caption>
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-line text-left text-xs text-fg-muted">
                      <th scope="col" className="px-4 py-1 font-medium">
                        {t("hse.col.asset")}
                      </th>
                      <th scope="col" className="py-1 pr-3 font-medium">
                        {t("hse.col.site")}
                      </th>
                      <th scope="col" className="py-1 pr-3 font-medium">
                        {t("hse.col.health")}
                      </th>
                      <th scope="col" className="py-1 pr-4 font-medium">
                        {t("hse.col.why")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((s) => (
                      <tr key={s.assetId} className="border-b border-line last:border-0">
                        <th scope="row" className="px-4 py-1.5 text-left font-normal">
                          <Link
                            to="/assets/$assetId/$tab"
                            params={{ assetId: s.assetId, tab: "overview" }}
                            className="font-mono text-accent underline"
                          >
                            {s.assetId}
                          </Link>
                          <span className="block text-xs text-fg-muted">{t(`assetClass.${s.assetClass}`)}</span>
                        </th>
                        <td className="py-1.5 pr-3 font-mono">{s.siteId}</td>
                        <td className="py-1.5 pr-3">
                          <HealthBadge state={s.health} label={t(`health.${s.health}`)} />
                        </td>
                        <td className="py-1.5 pr-4">
                          {s.reasons.length === 0 ? (
                            <span className="text-fg-muted">{t("hse.notImpaired")}</span>
                          ) : (
                            <ul className="flex flex-wrap gap-x-3">
                              {s.reasons.map((r) => (
                                <li key={r} className="font-medium text-health-warning">
                                  {t(`hse.reason.${r}`)}
                                </li>
                              ))}
                            </ul>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!all && (
              <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAll(true)}>
                {t("hse.showAllSces", { count: o.sces.length })}
              </Button>
            )}
          </section>
        </>
      )}
    </div>
  );
}
