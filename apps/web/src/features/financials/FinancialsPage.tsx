/**
 * Financials (Phase 4, chunk 5): "what is maintenance costing, and what is prediction saving?"
 * Over the last 12 months: the value finished predictive jobs delivered (the failure each one
 * prevented, less what the job cost), the money still at risk in open predictions, what
 * downtime cost each site, and maintenance spend by month and kind of work against the budget.
 * Every figure shows how it was worked out, so finance can check it.
 */
import { useApiQuery } from "@pdm/api-client";
import { LABOUR_RATE } from "@pdm/contracts";
import { KpiCard, Skeleton, cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { CheckCircle2, CircleSlash } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate, formatNumber } from "../../shared/format";
import { useGlobalSearch } from "../../shared/time-range";
import { ColumnChart } from "../../shared/widgets/ColumnChart";

export function FinancialsPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const data = useApiQuery("financials.overview", { scopeId }, { refetchInterval: 300_000 });

  useEffect(() => {
    document.title = `${t("modules.financials.name")} · ${t("app.name")}`;
  }, [t]);

  const o = data.data;
  const money = (v: number) => formatCurrency(v, o?.currency ?? "USD");
  const exact = (v: number) => formatCurrency(v, o?.currency ?? "USD", false);
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.financials.name")}</h1>
        <p className="text-fg-muted">{t("financials.intro")}</p>
      </header>
      {data.isPending ? (
        <Skeleton className="h-96" />
      ) : !o ? (
        <p className="text-health-warning">{t("widget.failed")}</p>
      ) : (
        <div className={cx("flex flex-col gap-4", data.isPlaceholderData && "opacity-60")}>
          <section aria-label={t("financials.kpisLabel")} className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <KpiCard
              label={t("financials.kpi.value")}
              value={money(o.value.net)}
              target={t("financials.kpi.valueJobs", { count: o.value.jobs })}
              lineage={t("financials.kpi.valueHow", { avoided: money(o.value.avoided), cost: money(o.value.cost) })}
            />
            <KpiCard
              label={t("financials.kpi.atRisk")}
              value={money(o.atRisk.amount)}
              target={t("financials.kpi.atRiskCount", { count: o.atRisk.predictions })}
              lineage={t("financials.kpi.atRiskHow")}
            />
            <KpiCard
              label={t("financials.kpi.downtime")}
              value={money(o.downtime.cost)}
              target={t("financials.kpi.downtimeHours", { hours: formatNumber(o.downtime.hours) })}
              lineage={t("financials.kpi.downtimeHow")}
            />
            <KpiCard
              label={t("financials.kpi.spend")}
              value={money(o.spend.total)}
              target={t("financials.kpi.budget", { budget: money(o.spend.budget) })}
              lineage={t("financials.kpi.spendHow", { rate: exact(LABOUR_RATE) })}
            />
            <KpiCard
              label={t("financials.kpi.planned")}
              value={`${formatNumber(o.spend.plannedPct, 1)} %`}
              lineage={t("financials.kpi.plannedHow")}
            />
          </section>

          <section aria-labelledby="fin-monthly" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="fin-monthly" className="font-semibold">
              {t("financials.monthlyTitle")}
            </h2>
            <p className="mb-2 text-sm text-fg-muted">{t("financials.monthlyIntro")}</p>
            <ColumnChart
              columns={o.spend.months.map((m) => {
                const month = new Date(`${m.month}-01T00:00:00Z`);
                return {
                  key: m.month,
                  tick: month.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
                  name: month.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
                  value: m.corrective + m.preventive + m.predictive,
                  line: m.budget,
                };
              })}
              label={t("financials.monthlyLabel")}
              summary={t(o.spend.total > o.spend.budget ? "financials.monthlyOver" : "financials.monthlyUnder", {
                total: money(o.spend.total),
                budget: money(o.spend.budget),
                difference: money(Math.abs(o.spend.total - o.spend.budget)),
              })}
              format={money}
              valueName={t("financials.spent")}
              lineName={t("financials.budgetLine")}
            />
          </section>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <section aria-labelledby="fin-kinds" className="rounded-lg border border-line bg-surface p-4">
              <h2 id="fin-kinds" className="font-semibold">
                {t("financials.kindsTitle")}
              </h2>
              <p className="mb-3 text-sm text-fg-muted">{t("financials.kindsIntro")}</p>
              <div className="relative -mx-4 overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <caption className="sr-only">{t("financials.kindsCaption")}</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-fg-muted">
                      <th scope="col" className="px-4 py-1 font-medium">
                        {t("financials.col.kind")}
                      </th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">
                        {t("financials.col.jobs")}
                      </th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">
                        {t("financials.col.average")}
                      </th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">
                        {t("financials.col.total")}
                      </th>
                      <th scope="col" className="py-1 pr-4 text-right font-medium">
                        {t("financials.col.share")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.spend.byCategory.map((c) => (
                      <tr key={c.category} className="border-b border-line last:border-0">
                        <th scope="row" className="px-4 py-1.5 text-left font-normal">
                          {t(`financials.kind.${c.category}`)}
                        </th>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(c.jobs)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{exact(c.average)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{money(c.total)}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">
                          {o.spend.total > 0 ? `${formatNumber((100 * c.total) / o.spend.total, 1)} %` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="fin-downtime" className="rounded-lg border border-line bg-surface p-4">
              <h2 id="fin-downtime" className="font-semibold">
                {t("financials.downtimeTitle")}
              </h2>
              <p className="mb-3 text-sm text-fg-muted">{t("financials.downtimeIntro")}</p>
              <div className="relative -mx-4 overflow-x-auto">
                <table className="w-full min-w-[480px] text-sm">
                  <caption className="sr-only">{t("financials.downtimeCaption")}</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-fg-muted">
                      <th scope="col" className="px-4 py-1 font-medium">
                        {t("financials.col.site")}
                      </th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">
                        {t("financials.col.hours")}
                      </th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">
                        {t("financials.col.perHour")}
                      </th>
                      <th scope="col" className="py-1 pr-4 text-right font-medium">
                        {t("financials.col.cost")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.downtime.sites.map((s) => (
                      <tr key={s.siteId} className="border-b border-line last:border-0">
                        <th scope="row" className="px-4 py-1.5 text-left font-normal">
                          {s.siteName}
                        </th>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(s.hours)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{exact(s.costPerHour)}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">{money(s.cost)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          <section aria-labelledby="fin-value" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="fin-value" className="font-semibold">
              {t("financials.valueTitle")}
            </h2>
            <p className="mb-3 text-sm text-fg-muted">
              {t("financials.valueIntro", { rate: exact(LABOUR_RATE), count: o.value.falseAlarms })}
            </p>
            {o.value.items.length === 0 ? (
              <p className="text-sm text-fg-muted">{t("financials.noValue")}</p>
            ) : (
              <div className="relative -mx-4 overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <caption className="sr-only">{t("financials.valueCaption")}</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-fg-muted">
                      <th scope="col" className="px-4 py-1 font-medium">
                        {t("financials.col.workOrder")}
                      </th>
                      <th scope="col" className="py-1 pr-3 font-medium">
                        {t("financials.col.asset")}
                      </th>
                      <th scope="col" className="py-1 pr-3 font-medium">
                        {t("financials.col.finished")}
                      </th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">
                        {t("financials.col.avoided")}
                      </th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">
                        {t("financials.col.labour")}
                      </th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">
                        {t("financials.col.parts")}
                      </th>
                      <th scope="col" className="py-1 pr-4 text-right font-medium">
                        {t("financials.col.net")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.value.items.map((i) => (
                      <tr key={i.workOrderId} className="border-b border-line last:border-0">
                        <th scope="row" className="px-4 py-1.5 text-left font-normal">
                          <Link
                            to="/maintenance/$workOrderId"
                            params={{ workOrderId: i.workOrderId }}
                            className="font-mono text-accent underline"
                          >
                            {i.workOrderNumber}
                          </Link>
                          <span className={cx("flex items-center gap-1 text-xs", i.falseAlarm ? "text-fg-muted" : "text-health-healthy")}>
                            {i.falseAlarm ? (
                              <CircleSlash aria-hidden className="size-3" />
                            ) : (
                              <CheckCircle2 aria-hidden className="size-3" />
                            )}
                            {t(i.falseAlarm ? "financials.falseAlarm" : "financials.confirmed")}
                          </span>
                        </th>
                        <td className="py-1.5 pr-3">
                          <Link
                            to="/assets/$assetId/$tab"
                            params={{ assetId: i.assetId, tab: "overview" }}
                            className="font-mono text-accent underline"
                          >
                            {i.assetId}
                          </Link>
                        </td>
                        <td className="py-1.5 pr-3">{formatDate(i.completedAt)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{i.falseAlarm ? "—" : money(i.avoided)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {t("financials.labour", {
                            hours: formatNumber(i.labourHours, 1),
                            cost: exact(i.labourHours * LABOUR_RATE),
                          })}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{i.partsCost > 0 ? exact(i.partsCost) : "—"}</td>
                        <td className={cx("py-1.5 pr-4 text-right font-medium tabular-nums", i.net < 0 && "text-health-warning")}>
                          {money(i.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
