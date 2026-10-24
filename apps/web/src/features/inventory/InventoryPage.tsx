/**
 * Inventory (Phase 4, chunk 2): "do we have the parts we'll need?" Every stock line (one part at
 * one site) with its reorder point, what's on order, and the parts PM plans and failure
 * predictions will need in the next 90 days. Lines that will run short come first, then those
 * at their reorder point; each says what to order and by when.
 * URL: /inventory?show=action|all|excess&q=…  Procurement's home page.
 */
import { useApiQuery } from "@pdm/api-client";
import { DEMAND_HORIZON_DAYS, type StockStatus } from "@pdm/contracts";
import { KpiCard, Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatCurrency, formatDate, formatNumber } from "../../shared/format";
import { useGlobalSearch } from "../../shared/time-range";
import { StockStatusLabel, Suggestion } from "./inventory-ui";

const SHOW = { action: ["short", "reorder"], excess: ["excess"], all: undefined } as const satisfies Record<
  string,
  StockStatus[] | undefined
>;
const searchSchema = z.object({
  show: z.enum(["action", "all", "excess"]).catch("action").default("action"),
  q: z.string().max(100).optional().catch(undefined),
});

export function InventoryPage() {
  const { t } = useTranslation();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();
  const { scopeId } = useGlobalSearch();
  const [text, setText] = useState(search.q ?? "");
  const data = useApiQuery(
    "inventory.overview",
    { scopeId, status: SHOW[search.show] ? [...SHOW[search.show]!] : undefined, search: search.q },
    { placeholderData: keepPreviousData, refetchInterval: 60_000 },
  );
  const set = (patch: Partial<z.infer<typeof searchSchema>>) =>
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }), replace: true });

  useEffect(() => {
    document.title = `${t("modules.inventory.name")} · ${t("app.name")}`;
  }, [t]);
  // Search as you type, a moment after the last key.
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((search.q ?? "") !== text) set({ q: text || undefined });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `set` is a fresh closure each render
  }, [text, search.q]);

  const o = data.data;
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.inventory.name")}</h1>
        <p className="text-fg-muted">{t("inventory.intro", { days: DEMAND_HORIZON_DAYS })}</p>
      </header>
      {!o ? (
        <Skeleton className="h-96" />
      ) : (
        <div className={cx("flex flex-col gap-4", data.isPlaceholderData && "opacity-60")}>
          <section aria-label={t("inventory.kpisLabel")} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            <KpiCard label={t("inventory.kpi.short")} value={formatNumber(o.counts.short)} lineage={t("inventory.kpi.shortHow")} />
            <KpiCard label={t("inventory.kpi.reorder")} value={formatNumber(o.counts.reorder)} lineage={t("inventory.kpi.reorderHow")} />
            <KpiCard
              label={t("inventory.kpi.value")}
              value={formatCurrency(o.stockValue, o.currency)}
              target={t("inventory.kpi.lines", { count: o.counts.lines })}
            />
            <KpiCard
              label={t("inventory.kpi.orders")}
              value={formatNumber(o.counts.openOrders)}
              target={t("inventory.kpi.excess", { count: o.counts.excess })}
            />
          </section>

          <section aria-labelledby="inv-lines" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="inv-lines" className="font-semibold">
              {t("inventory.linesTitle")}
            </h2>
            <p className="mb-3 text-sm text-fg-muted">{t("inventory.linesIntro")}</p>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <Select
                label={t("inventory.show")}
                value={search.show}
                options={(["action", "all", "excess"] as const).map((v) => ({ value: v, label: t(`inventory.showOption.${v}`) }))}
                onChange={(v) => set({ show: v })}
              />
              <label className="flex items-center gap-2 text-sm">
                <span className="text-xs text-fg-muted">{t("inventory.search")}</span>
                <input
                  type="search"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  className="h-8 w-56 max-w-full rounded-md border border-line bg-surface px-2 text-sm"
                />
              </label>
            </div>
            {o.lines.length === 0 ? (
              <p className="text-sm text-fg-muted">{t("inventory.none")}</p>
            ) : (
              <div className="relative -mx-4 max-h-[40rem] overflow-auto">
                <table className="w-full min-w-[1080px] text-sm">
                  <caption className="sr-only">{t("inventory.linesCaption")}</caption>
                  <thead className="sticky top-0 bg-surface">
                    <tr className="border-b border-line text-left text-xs text-fg-muted">
                      <th scope="col" className="px-4 py-1 font-medium">
                        {t("inventory.col.part")}
                      </th>
                      <th scope="col" className="py-1 pr-3 font-medium">
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
                    {o.lines.map((l) => (
                      <tr key={`${l.partNumber}@${l.siteId}`} className="border-b border-line align-top last:border-0">
                        <th scope="row" className="px-4 py-1.5 text-left font-normal">
                          <Link
                            to="/inventory/parts/$partNumber"
                            params={{ partNumber: l.partNumber }}
                            search={(prev) => prev}
                            className="font-mono text-accent underline"
                          >
                            {l.partNumber}
                          </Link>
                          <span className="block text-xs">{l.description}</span>
                          <span className="block text-xs text-fg-muted">{t(`inventory.criticality.${l.criticality}`)}</span>
                        </th>
                        <td className="py-1.5 pr-3 font-mono">{l.siteId}</td>
                        <td className="py-1.5 pr-3">
                          <StockStatusLabel status={l.status} />
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(l.onHand)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {formatNumber(l.onOrder)}
                          {l.nextArrival && (
                            <span className="block text-xs text-fg-muted">
                              {t("inventory.arrives", { date: formatDate(l.nextArrival) })}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {formatNumber(l.reorderPoint)} / {formatNumber(l.max)}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {formatNumber(l.demand)}
                          {l.firstNeed && (
                            <span className="block text-xs text-fg-muted">
                              {t("inventory.firstNeed", { date: formatDate(l.firstNeed) })}
                            </span>
                          )}
                        </td>
                        <td className="py-1.5 pr-4">
                          <Suggestion line={l} />
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
