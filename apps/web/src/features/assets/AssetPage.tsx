/**
 * Asset 360 (spec §6.2) — "the centerpiece". Header with identity, health and remaining life,
 * then tabs: Overview, Telemetry, Health & prediction, Alarms, Maintenance, Documents,
 * Related, Comments.
 * The tab is part of the URL: /assets/CBC-GT-101/telemetry.
 */
import { useApiQuery } from "@pdm/api-client";
import type { Asset } from "@pdm/contracts";
import { EmptyState, HealthBadge, Skeleton, cx } from "@pdm/ui";
import { Link, useParams } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, formatNumber } from "../../shared/format";
import { AlarmsTab, MaintenanceTab } from "./HistoryTabs";
import { FailuresTab } from "./FailuresTab";
import { HealthTab } from "./HealthTab";
import { CommentsTab, DocumentsTab, RelatedTab } from "./InfoTabs";
import { OverviewTab } from "./OverviewTab";
import { PERFORMANCE_CLASSES, PerformanceTab } from "./PerformanceTab";
import { TelemetryTab } from "./TelemetryTab";

export const ASSET_TABS = [
  "overview",
  "telemetry",
  "health",
  "performance",
  "failures",
  "alarms",
  "maintenance",
  "documents",
  "related",
  "comments",
] as const;
export type AssetTab = (typeof ASSET_TABS)[number];

export function AssetPage() {
  const { t } = useTranslation();
  const { assetId, tab } = useParams({ from: "/assets/$assetId/$tab" });
  const asset = useApiQuery("assets.get", { assetId }, { refetchInterval: 30_000 });
  const sites = useApiQuery("sites.list", {});
  const path = useApiQuery("hierarchy.path", { nodeId: assetId });

  useEffect(() => {
    document.title = `${assetId} · ${t("modules.assets.name")} · ${t("app.name")}`;
  }, [assetId, t]);

  if (asset.isError) {
    return (
      <EmptyState icon={<SearchX className="size-8" />} title={t("assets.notFoundTitle")}>
        <p>{t("assets.notFound", { id: assetId })}</p>
        <Link to="/assets" search={(prev) => prev} className="mt-2 inline-block text-accent underline">
          {t("assets.backToRegistry")}
        </Link>
      </EmptyState>
    );
  }

  const site = sites.data?.items.find((s) => s.id === asset.data?.siteId);
  const area = path.data?.items.find((n) => n.level === "area");
  // Performance only for the kinds of equipment that have performance measures so far.
  const tabs = ASSET_TABS.filter((tb) => tb !== "performance" || (asset.data && PERFORMANCE_CLASSES.has(asset.data.assetClass)));
  const current = (tabs as readonly string[]).includes(tab) ? (tab as AssetTab) : "overview";

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      {asset.data ? <AssetHeader asset={asset.data} siteName={site?.name} areaName={area?.name} /> : <Skeleton className="h-28" />}

      <nav aria-label={t("assets.tabsLabel")} className="flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((tb) => (
          <Link
            key={tb}
            to="/assets/$assetId/$tab"
            params={{ assetId, tab: tb }}
            search={(prev) => prev}
            aria-current={tb === current ? "page" : undefined}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              tb === current ? "border-accent font-semibold text-fg" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t(`assets.tabs.${tb}`)}
          </Link>
        ))}
      </nav>

      {asset.data &&
        {
          overview: <OverviewTab asset={asset.data} siteTimeZone={site?.timezone} />,
          telemetry: <TelemetryTab asset={asset.data} siteTimeZone={site?.timezone} />,
          health: <HealthTab asset={asset.data} />,
          performance: <PerformanceTab asset={asset.data} />,
          failures: <FailuresTab asset={asset.data} />,
          alarms: <AlarmsTab asset={asset.data} siteTimeZone={site?.timezone} />,
          maintenance: <MaintenanceTab asset={asset.data} />,
          documents: <DocumentsTab asset={asset.data} />,
          related: <RelatedTab asset={asset.data} />,
          comments: <CommentsTab asset={asset.data} />,
        }[current]}
    </div>
  );
}

function AssetHeader({ asset, siteName, areaName }: { asset: Asset; siteName?: string; areaName?: string }) {
  const { t } = useTranslation();
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-line bg-surface p-4">
      <div className="min-w-0">
        <p className="text-xs text-fg-muted">{[siteName, areaName].filter(Boolean).join(" › ")}</p>
        <h1 className="text-2xl font-semibold">
          {t(`assetClass.${asset.assetClass}`)} <span className="font-mono">{asset.id}</span>
        </h1>
        <p className="text-sm text-fg-muted">
          {asset.manufacturer} {asset.model} · {t("assets.serial", { serial: asset.serialNumber })} ·{" "}
          {t("assets.commissioned", { date: formatDate(asset.commissionedAt) })}
        </p>
      </div>
      <dl className="flex flex-wrap gap-6 text-sm">
        <div>
          <dt className="text-xs text-fg-muted">{t("assets.col.health")}</dt>
          <dd className="flex items-center gap-2">
            <HealthBadge state={asset.health.state} label={t(`health.${asset.health.state}`)} />
            <span className="text-xl font-semibold">{formatNumber(asset.health.score)}</span>
          </dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("assets.col.rul")}</dt>
          <dd className="text-xl font-semibold">{asset.rul ? t("prediction.days", { count: Math.round(asset.rul.p50Days) }) : "—"}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("assets.col.status")}</dt>
          <dd className="text-xl font-semibold">{t(`operatingStatus.${asset.operatingStatus}`)}</dd>
        </div>
        <div>
          <dt className="text-xs text-fg-muted">{t("assets.col.criticality")}</dt>
          <dd className="text-xl font-semibold">{asset.criticality}/5</dd>
        </div>
      </dl>
    </header>
  );
}
