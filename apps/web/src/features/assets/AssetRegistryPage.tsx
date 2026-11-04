/**
 * Asset registry (spec §6.2): every asset in the current scope, searchable and filterable,
 * sorted by risk. Server-side paging — the browser never holds all ~1,900 at once.
 */
import { useApiContext, useApiQuery } from "@pdm/api-client";
import { HealthState, type Asset, type AssetListParams } from "@pdm/contracts";
import { Button, HealthBadge, Select, Skeleton } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import { AssetsNav } from "./AssetsNav";
import { ExportButton, type ExportColumn } from "../../shared/export/ExportButton";
import { formatNumber } from "../../shared/format";
import { useGlobalSearch } from "../../shared/time-range";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";

const PAGE_SIZE = 50;
const SORTS = ["risk_desc", "health_asc", "criticality_desc", "name_asc"] as const;

export function AssetRegistryPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const searchId = useId();
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [health, setHealth] = useState<"all" | HealthState>("all");
  const [sort, setSort] = useState<(typeof SORTS)[number]>("risk_desc");

  // Wait until typing pauses before searching (debounce).
  useEffect(() => {
    const id = setTimeout(() => setSearch(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);

  // The page number remembers which filters it belongs to. Change any filter and it's
  // page 1 again automatically — no effect needed to "reset" it afterwards.
  const filterKey = JSON.stringify([search, health, sort, scopeId]);
  const [paging, setPaging] = useState({ filterKey, page: 0 });
  const page = paging.filterKey === filterKey ? paging.page : 0;
  const setPage = (next: number) => setPaging({ filterKey, page: next });

  const params: AssetListParams = {
    scopeId,
    search: search || undefined,
    healthState: health === "all" ? undefined : [health],
    sort,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE,
  };
  const assets = useApiQuery("assets.list", params, { placeholderData: keepPreviousData });
  const { api } = useApiContext();
  const exportColumns: ExportColumn<Asset>[] = [
    { header: t("export.col.asset"), value: (a) => a.id },
    { header: t("export.col.name"), value: (a) => a.name },
    { header: t("export.col.class"), value: (a) => t(`assetClass.${a.assetClass}`) },
    { header: t("export.col.site"), value: (a) => a.siteId },
    { header: t("export.col.health"), value: (a) => t(`health.${a.health.state}`) },
    { header: t("export.col.score"), value: (a) => a.health.score },
    { header: t("export.col.status"), value: (a) => t(`operatingStatus.${a.operatingStatus}`) },
    { header: t("export.col.criticality"), value: (a) => a.criticality },
    { header: t("export.col.rul"), value: (a) => (a.rul ? Math.round(a.rul.p50Days) : null) },
  ];
  const total = assets.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    document.title = `${t("modules.assets.name")} · ${t("app.name")}`;
  }, [t]);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.assets.name")}</h1>
        <p className="text-fg-muted">{t("assets.registryIntro")}</p>
      </header>
      <AssetsNav />

      <div className="flex flex-wrap items-end gap-3">
        <label
          htmlFor={searchId}
          className="flex h-8 min-w-60 flex-1 items-center gap-2 rounded-md border border-line bg-surface px-2 sm:flex-none"
        >
          <Search aria-hidden className="size-4 text-fg-muted" />
          <span className="sr-only">{t("assets.search")}</span>
          <input
            id={searchId}
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("assets.searchPlaceholder")}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none"
          />
        </label>
        <Select
          label={t("assets.health")}
          value={health}
          options={[
            { value: "all", label: t("assets.allStates") },
            ...HealthState.options.map((h) => ({ value: h, label: t(`health.${h}`) })),
          ]}
          onChange={setHealth}
        />
        <Select
          label={t("assets.sortBy")}
          value={sort}
          options={SORTS.map((s) => ({ value: s, label: t(`assets.sort.${s}`) }))}
          onChange={setSort}
        />
      </div>

      <DashboardWidget
        title={t("assets.count", { count: total })}
        query={assets}
        actions={
          <ExportButton
            what={t("export.what.assets")}
            columns={exportColumns}
            load={(page) => api.request("assets.list", { ...params, ...page })}
          />
        }
        isEmpty={assets.data?.items.length === 0}
        emptyText={t("assets.noMatches")}
        skeleton={
          <div className="flex flex-col gap-2">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-9" />
            ))}
          </div>
        }
      >
        <div className={`relative -mx-4 overflow-x-auto ${assets.isPlaceholderData ? "opacity-60" : ""}`}>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("assets.col.asset")}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t("assets.col.class")}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t("assets.col.site")}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t("assets.col.health")}
                </th>
                <th scope="col" className="py-2 font-medium">
                  {t("assets.col.status")}
                </th>
                <th scope="col" className="py-2 text-right font-medium">
                  {t("assets.col.criticality")}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t("assets.col.rul")}
                </th>
              </tr>
            </thead>
            <tbody>
              {assets.data?.items.map((a) => (
                <tr key={a.id} className="border-b border-line last:border-0 hover:bg-sunken">
                  <td className="px-4 py-2">
                    <Link
                      to="/assets/$assetId"
                      params={{ assetId: a.id }}
                      search={(prev) => prev}
                      className="font-mono font-medium hover:underline"
                    >
                      {a.id}
                    </Link>
                  </td>
                  <td className="py-2">{t(`assetClass.${a.assetClass}`)}</td>
                  <td className="py-2 font-mono text-xs">{a.siteId}</td>
                  <td className="py-2">
                    <HealthBadge state={a.health.state} label={`${t(`health.${a.health.state}`)} · ${formatNumber(a.health.score)}`} />
                  </td>
                  <td className="py-2">{t(`operatingStatus.${a.operatingStatus}`)}</td>
                  <td className="py-2 text-right tabular-nums">{a.criticality}/5</td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {a.rul ? t("prediction.days", { count: Math.round(a.rul.p50Days) }) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <nav aria-label={t("assets.pagination")} className="mt-3 flex items-center justify-end gap-2 text-sm">
          <span className="text-fg-muted">{t("assets.page", { page: page + 1, pages })}</span>
          <Button size="sm" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label={t("assets.previous")}>
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <Button size="sm" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)} aria-label={t("assets.next")}>
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </nav>
      </DashboardWidget>
    </div>
  );
}
