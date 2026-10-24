/**
 * PM programs (Phase 4, chunk 1): every preventive maintenance plan, built from FMEA's
 * recommended strategies, with how well it's being kept up. PM compliance is the share of PMs
 * due in the last 90 days that were done within their window; "overdue" are the ones still
 * waiting. Modes with no plan (run to failure, fix the design) are listed with the reason.
 * URL: /maintenance/pm?class=… (a kind of equipment, optional).
 */
import { useApiQuery } from "@pdm/api-client";
import { AssetClass, PM_COMPLIANCE_DAYS, PM_HORIZON_DAYS } from "@pdm/contracts";
import { KpiCard, Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatDate, formatNumber } from "../../shared/format";
import { useGlobalSearch } from "../../shared/time-range";
import { ColumnChart } from "../../shared/widgets/ColumnChart";
import { pct, planTitle, triggerText } from "./pm-format";

const searchSchema = z.object({ class: AssetClass.optional().catch(undefined) });
const TARGET = 95;

export function PmPage() {
  const { t } = useTranslation();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();
  const { scopeId } = useGlobalSearch();
  const data = useApiQuery(
    "pm.overview",
    { scopeId, assetClass: search.class },
    { placeholderData: keepPreviousData, refetchInterval: 120_000 },
  );

  useEffect(() => {
    document.title = `${t("pm.title.page")} · ${t("app.name")}`;
  }, [t]);

  const o = data.data;
  const classes = AssetClass.options;
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <p className="text-sm">
          <Link to="/maintenance" search={(prev) => prev} className="text-accent underline">
            {t("modules.maintenance.name")}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">{t("pm.title.page")}</h1>
        <p className="text-fg-muted">{t("pm.intro")}</p>
      </header>
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t("reliability.classLabel")}
          value={search.class ?? ""}
          options={[{ value: "", label: t("pm.allClasses") }, ...classes.map((c) => ({ value: c, label: t(`assetClass.${c}`) }))]}
          onChange={(v) =>
            void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, class: v || undefined }), replace: true })
          }
        />
      </div>
      {data.isPending ? (
        <Skeleton className="h-96" />
      ) : !o ? (
        <p className="text-health-warning">{t("widget.failed")}</p>
      ) : (
        <div className={cx("flex flex-col gap-4", data.isPlaceholderData && "opacity-60")}>
          <section aria-label={t("pm.kpisLabel")} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard
              label={t("pm.kpi.compliance")}
              value={pct(o.counts.compliancePct)}
              target={t("pm.kpi.target", { target: TARGET })}
              lineage={t("pm.kpi.complianceHow", { days: PM_COMPLIANCE_DAYS })}
            />
            <KpiCard label={t("pm.kpi.overdue")} value={formatNumber(o.counts.overdue)} lineage={t("pm.kpi.overdueHow")} />
            <KpiCard label={t("pm.kpi.dueSoon", { days: PM_HORIZON_DAYS })} value={formatNumber(o.counts.dueSoon)} />
            <KpiCard
              label={t("pm.kpi.plans")}
              value={formatNumber(o.plans.length)}
              target={t("pm.kpi.uncovered", { count: o.uncovered.length })}
            />
          </section>

          <section aria-labelledby="pm-monthly" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="pm-monthly" className="font-semibold">
              {t("pm.monthlyTitle")}
            </h2>
            <p className="mb-2 text-sm text-fg-muted">{t("pm.monthlyIntro")}</p>
            <ColumnChart
              columns={o.monthly.map((m) => {
                const decided = m.onTime + m.late + m.missed;
                const month = new Date(`${m.month}-01T00:00:00Z`);
                return {
                  key: m.month,
                  tick: month.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
                  name: month.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
                  value: decided > 0 ? Math.round((1000 * m.onTime) / decided) / 10 : 0,
                  line: TARGET,
                };
              })}
              max={100}
              format={(v) => `${formatNumber(v, 1)} %`}
              valueName={t("pm.kpi.compliance")}
              lineName={t("pm.kpi.target", { target: TARGET })}
              label={t("pm.monthlyLabel")}
              summary={t("pm.monthlySummary", { pct: pct(o.counts.compliancePct), target: TARGET })}
            />
          </section>

          <section aria-labelledby="pm-plans" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="pm-plans" className="font-semibold">
              {t("pm.plansTitle")}
            </h2>
            <p className="mb-3 text-sm text-fg-muted">{t("pm.plansIntro")}</p>
            <div className="relative -mx-4 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <caption className="sr-only">{t("pm.plansCaption")}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-1 font-medium">
                      {t("pm.col.plan")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("pm.col.class")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("pm.col.every")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("pm.col.assets")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("pm.col.compliance")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("pm.col.overdue")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("pm.col.dueSoon")}
                    </th>
                    <th scope="col" className="py-1 pr-4 font-medium">
                      {t("pm.col.nextDue")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {o.plans.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-1.5 text-left font-normal">
                        <Link
                          to="/maintenance/pm/$planId"
                          params={{ planId: p.id }}
                          search={(prev) => prev}
                          className="font-medium text-accent hover:underline"
                        >
                          {planTitle(p, t)}
                        </Link>
                        <span className="block font-mono text-xs text-fg-muted">{p.id}</span>
                      </th>
                      <td className="py-1.5 pr-3">{t(`assetClass.${p.assetClass}`)}</td>
                      <td className="py-1.5 pr-3">{triggerText(p, t)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(p.assets)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{pct(p.counts.compliancePct)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {p.counts.overdue > 0 ? (
                          <span className="inline-flex items-center gap-1 font-semibold text-health-warning">
                            <AlertTriangle aria-hidden className="size-3.5" />
                            {formatNumber(p.counts.overdue)}
                          </span>
                        ) : (
                          "0"
                        )}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(p.counts.dueSoon)}</td>
                      <td className="py-1.5 pr-4">{p.nextDue ? formatDate(p.nextDue) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {o.uncovered.length > 0 && (
            <section aria-labelledby="pm-uncovered" className="rounded-lg border border-line bg-surface p-4">
              <h2 id="pm-uncovered" className="font-semibold">
                {t("pm.uncoveredTitle")}
              </h2>
              <p className="mb-2 text-sm text-fg-muted">{t("pm.uncoveredIntro")}</p>
              <ul className="grid gap-1 text-sm sm:grid-cols-2 xl:grid-cols-3">
                {o.uncovered.map((u) => (
                  <li key={`${u.assetClass}-${u.mode}`}>
                    <span className="font-medium">{t(`assetClass.${u.assetClass}`)}</span>: {t(`iso14224.mode.${u.mode}`)}{" "}
                    <span className="text-fg-muted">({t(`fmea.strategy.${u.strategy}`)})</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
