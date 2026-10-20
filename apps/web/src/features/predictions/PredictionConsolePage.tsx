/**
 * Prediction console (spec §6.4): every prediction in scope, ranked by money at risk, so
 * engineers triage the most valuable ones first. Each row opens the full prediction page.
 */
import { useApiQuery } from "@pdm/api-client";
import { PredictionSort } from "@pdm/contracts";
import { HealthBadge, Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CircleAlert, ClipboardCheck } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatNumber, formatProbability } from "../../shared/format";
import { useGlobalSearch } from "../../shared/time-range";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";
import { MIN_PROBABILITY, PREDICTION_SHOW, STATUSES_FOR, WITHIN_DAYS, usePredictionSearch } from "./prediction-search";

export function PredictionConsolePage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const [search, setSearch] = usePredictionSearch();

  const params = {
    scopeId,
    status: STATUSES_FOR[search.show],
    minProbability: search.min === "any" ? undefined : Number(search.min),
    maxRulDays: search.within === "any" ? undefined : Number(search.within),
    sort: search.sort,
    limit: 200,
  };
  const predictions = useApiQuery("predictions.list", params, { placeholderData: keepPreviousData, refetchInterval: 30_000 });
  const active = useApiQuery("predictions.list", { scopeId, status: STATUSES_FOR.active, limit: 500 }, { refetchInterval: 30_000 });
  const quality = useApiQuery("predictions.feedbackSummary", { scopeId });
  const items = predictions.data?.items ?? [];

  useEffect(() => {
    document.title = `${t("modules.predictive.name")} · ${t("app.name")}`;
  }, [t]);

  const activeItems = active.data?.items ?? [];
  const exposure = activeItems.reduce((sum, p) => sum + p.probability * p.recommendedAction.failureCost.amount, 0);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.predictive.name")}</h1>
        <p className="text-fg-muted">{t("console.intro")}</p>
      </header>

      {active.isPending ? (
        <Skeleton className="h-20" />
      ) : (
        <dl className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label={t("console.stat.active")} value={formatNumber(activeItems.length)} />
          <Stat
            label={t("console.stat.likely")}
            value={formatNumber(activeItems.filter((p) => p.probability >= 0.7).length)}
            hint={t("console.stat.likelyHint")}
          />
          <Stat
            label={t("console.stat.soon")}
            value={formatNumber(activeItems.filter((p) => (p.rul?.p50Days ?? Infinity) <= 7).length)}
            hint={t("console.stat.soonHint")}
          />
          <Stat label={t("console.stat.exposure")} value={formatCurrency(exposure, "USD")} hint={t("console.stat.exposureHint")} />
          <Stat
            label={t("console.stat.precision")}
            value={quality.data?.precision == null ? "—" : formatProbability(quality.data.precision)}
            hint={
              quality.data ? t("console.stat.precisionHint", { tp: quality.data.truePositive, fp: quality.data.falsePositive }) : undefined
            }
          />
        </dl>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <Select
          label={t("console.show")}
          value={search.show}
          options={PREDICTION_SHOW.map((v) => ({ value: v, label: t(`console.showOption.${v}`) }))}
          onChange={(show) => setSearch({ show })}
        />
        <Select
          label={t("console.minProbability")}
          value={search.min}
          options={MIN_PROBABILITY.map((v) => ({ value: v, label: v === "any" ? t("console.any") : formatProbability(Number(v)) + "+" }))}
          onChange={(min) => setSearch({ min })}
        />
        <Select
          label={t("console.within")}
          value={search.within}
          options={WITHIN_DAYS.map((v) => ({
            value: v,
            label: v === "any" ? t("console.any") : t("prediction.days", { count: Number(v) }),
          }))}
          onChange={(within) => setSearch({ within })}
        />
        <Select
          label={t("console.sortBy")}
          value={search.sort}
          options={PredictionSort.options.map((v) => ({ value: v, label: t(`console.sort.${v}`) }))}
          onChange={(sort) => setSearch({ sort })}
        />
      </div>

      <DashboardWidget
        title={t("console.count", { count: predictions.data?.total ?? 0 })}
        query={predictions}
        isEmpty={items.length === 0}
        emptyText={t("console.empty")}
        skeleton={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-10" />
            ))}
          </div>
        }
      >
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("console.col.prediction")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("assets.col.asset")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("prediction.probability")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("console.col.rul")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("prediction.confidence")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("console.col.exposure")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("console.col.status")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-line last:border-0 hover:bg-sunken">
                  <td className="px-4 py-2">
                    <Link
                      to="/predictive/$predictionId"
                      params={{ predictionId: p.id }}
                      search={(prev) => prev}
                      className="font-medium hover:underline"
                    >
                      {p.failureMode.label}
                    </Link>
                    <span className="block font-mono text-xs text-fg-muted">{p.id}</span>
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <Link
                      to="/assets/$assetId/$tab"
                      params={{ assetId: p.assetId, tab: "health" }}
                      search={(prev) => prev}
                      className="font-mono text-xs hover:underline"
                    >
                      {p.assetId}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {formatProbability(p.probability)}
                    <span className="block text-xs text-fg-muted">{t("prediction.withinDays", { count: p.horizonDays })}</span>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    {p.rul ? t("prediction.days", { count: Math.round(p.rul.p50Days) }) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">
                    <span className="inline-flex items-center gap-1">
                      {p.dataQuality.length > 0 && (
                        <span title={t("console.dataIssues")}>
                          <CircleAlert aria-hidden className="size-3.5 text-health-warning" />
                          <span className="sr-only">{t("console.dataIssues")}</span>
                        </span>
                      )}
                      {formatProbability(p.confidence)}
                    </span>
                  </td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums">
                    {formatCurrency(p.probability * p.recommendedAction.failureCost.amount, "USD")}
                  </td>
                  <td className="px-4 py-2">
                    <span className={cx("inline-flex items-center gap-1.5", p.status === "dismissed" && "text-fg-muted")}>
                      <StatusIcon status={p.status} />
                      {t(`prediction.status.${p.status}`)}
                    </span>
                    {p.feedback && <span className="block text-xs text-fg-muted">{t(`feedback.short.${p.feedback}`)}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardWidget>
    </div>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === "actioned") return <ClipboardCheck aria-hidden className="size-4 text-fg-muted" />;
  if (status === "open") return <HealthBadge compact state="warning" label="" />;
  return null;
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
      {hint && <dd className="text-xs text-fg-muted">{hint}</dd>}
    </div>
  );
}
