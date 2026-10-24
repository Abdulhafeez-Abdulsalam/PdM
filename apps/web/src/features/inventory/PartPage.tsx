/**
 * One spare part: what it costs and how long it takes to arrive, its stock at each site, every
 * asset that will need it in the next 90 days (and why: a PM plan coming due or a failure
 * prediction), and its orders.
 */
import { useApiQuery } from "@pdm/api-client";
import { DEMAND_HORIZON_DAYS } from "@pdm/contracts";
import { EmptyState, Skeleton } from "@pdm/ui";
import { Link, useParams } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate, formatNumber, formatProbability } from "../../shared/format";
import { useGlobalSearch } from "../../shared/time-range";
import { StockStatusLabel, Suggestion } from "./inventory-ui";

export function PartPage() {
  const { t } = useTranslation();
  const { partNumber } = useParams({ from: "/inventory/parts/$partNumber" });
  const { scopeId } = useGlobalSearch();
  const data = useApiQuery("inventory.part", { partNumber, scopeId }, { refetchInterval: 60_000 });

  useEffect(() => {
    document.title = `${partNumber} · ${t("modules.inventory.name")} · ${t("app.name")}`;
  }, [partNumber, t]);

  if (data.isError) {
    return (
      <EmptyState icon={<SearchX className="size-8" />} title={t("inventory.notFound", { id: partNumber })}>
        <Link to="/inventory" search={(prev) => prev} className="text-accent underline">
          {t("inventory.back")}
        </Link>
      </EmptyState>
    );
  }
  const d = data.data;
  if (!d) return <Skeleton className="h-96" />;
  const p = d.part;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <p className="text-sm">
          <Link to="/inventory" search={(prev) => prev} className="text-accent underline">
            {t("modules.inventory.name")}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">
          {p.description} <span className="font-mono text-lg">{p.partNumber}</span>
        </h1>
      </header>

      <dl className="grid grid-cols-2 gap-3 rounded-lg border border-line bg-surface p-4 text-sm md:grid-cols-5">
        <div>
          <dt className="text-xs text-fg-muted">{t("inventory.unitCost")}</dt>
          <dd className="font-semibold">{formatCurrency(p.unitCost, p.currency, false)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("inventory.leadTime")}</dt>
          <dd className="font-semibold">{t("inventory.days", { count: p.leadTimeDays })}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("inventory.criticalityLabel")}</dt>
          <dd className="font-semibold">{t(`inventory.criticality.${p.criticality}`)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("inventory.usedFor")}</dt>
          <dd className="font-semibold">
            {t(`assetClass.${p.assetClass}`)}: {t(`iso14224.mode.${p.mode}`)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("inventory.pmPlan")}</dt>
          <dd className="font-semibold">
            {d.pmPlanId ? (
              <Link to="/maintenance/pm/$planId" params={{ planId: d.pmPlanId }} className="text-accent underline">
                {d.pmPlanId}
              </Link>
            ) : (
              t("inventory.noPmPlan")
            )}
          </dd>
        </div>
      </dl>

      <section aria-labelledby="part-stock" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="part-stock" className="mb-3 font-semibold">
          {t("inventory.stockTitle")}
        </h2>
        <div className="relative -mx-4 overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <caption className="sr-only">{t("inventory.stockCaption", { part: p.partNumber })}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="px-4 py-1 font-medium">
                  {t("inventory.col.site")}
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t("inventory.col.status")}
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {t("inventory.col.onHand")}
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {t("inventory.col.onOrder")}
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {t("inventory.col.minMax")}
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {t("inventory.col.needed", { days: DEMAND_HORIZON_DAYS })}
                </th>
                <th scope="col" className="py-1 pr-4 font-medium">
                  {t("inventory.col.suggestion")}
                </th>
              </tr>
            </thead>
            <tbody>
              {d.lines.map((l) => (
                <tr key={l.siteId} className="border-b border-line align-top last:border-0">
                  <th scope="row" className="px-4 py-1.5 text-left font-mono font-normal">
                    {l.siteId}
                  </th>
                  <td className="py-1.5 pr-3">
                    <StockStatusLabel status={l.status} />
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(l.onHand)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(l.onOrder)}</td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">
                    {formatNumber(l.reorderPoint)} / {formatNumber(l.max)}
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(l.demand)}</td>
                  <td className="py-1.5 pr-4">
                    <Suggestion line={l} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="part-demand" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="part-demand" className="font-semibold">
          {t("inventory.demandTitle", { days: DEMAND_HORIZON_DAYS })}
        </h2>
        <p className="mb-3 text-sm text-fg-muted">{t("inventory.demandIntro")}</p>
        {d.demand.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("inventory.noDemand")}</p>
        ) : (
          <div className="relative -mx-4 max-h-[28rem] overflow-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">{t("inventory.demandCaption", { part: p.partNumber })}</caption>
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th scope="col" className="px-4 py-1 font-medium">
                    {t("inventory.col.needBy")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("inventory.col.asset")}
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    {t("inventory.col.qty")}
                  </th>
                  <th scope="col" className="py-1 pr-4 font-medium">
                    {t("inventory.col.why")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.demand.map((x) => (
                  <tr key={`${x.source}-${x.refId}-${x.assetId}-${x.needBy}`} className="border-b border-line last:border-0">
                    <th scope="row" className="px-4 py-1 text-left font-normal">
                      {formatDate(x.needBy)}
                    </th>
                    <td className="py-1 pr-3">
                      <Link
                        to="/assets/$assetId/$tab"
                        params={{ assetId: x.assetId, tab: "overview" }}
                        className="font-mono text-accent underline"
                      >
                        {x.assetId}
                      </Link>
                    </td>
                    <td className="py-1 pr-3 text-right tabular-nums">{formatNumber(x.quantity)}</td>
                    <td className="py-1 pr-4">
                      {x.source === "pm" ? (
                        <Link to="/maintenance/pm/$planId" params={{ planId: x.refId }} className="text-accent underline">
                          {t("inventory.fromPm", { id: x.refId })}
                        </Link>
                      ) : (
                        <Link to="/predictive/$predictionId" params={{ predictionId: x.refId }} className="text-accent underline">
                          {t("inventory.fromPrediction", { probability: formatProbability(x.probability ?? 0) })}
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="part-orders" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="part-orders" className="mb-3 font-semibold">
          {t("inventory.ordersTitle")}
        </h2>
        {d.orders.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("inventory.noOrders")}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {d.orders.map((o) => (
              <li key={o.id}>
                <span className="font-mono">{o.id}</span>:{" "}
                {t(o.status === "open" ? "inventory.orderOpen" : "inventory.orderReceived", {
                  qty: o.quantity,
                  site: o.siteId,
                  ordered: formatDate(o.orderedAt),
                  eta: formatDate(o.eta),
                })}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
