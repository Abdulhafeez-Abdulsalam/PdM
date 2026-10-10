/**
 * Command Center (spec §6.1, IA §5). Layout: KPI strip → top risks + briefing → site map.
 * Everything follows the scope chosen in the top bar.
 */
import { useApiQuery } from "@pdm/api-client";
import { HealthBadge, Skeleton } from "@pdm/ui";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { groupHealthLabel } from "../../shared/health";
import { usePreferences } from "../../shared/preferences";
import { useGlobalSearch } from "../../shared/time-range";
import { DailyBriefing } from "./DailyBriefing";
import { KpiStrip } from "./KpiStrip";
import { SiteMapWidget } from "./SiteMapWidget";
import { TopRisks } from "./TopRisks";

export function CommandCenterPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const role = usePreferences((p) => p.role);
  const node = useApiQuery("hierarchy.node", { nodeId: scopeId });
  const title = t("modules.command-center.name");

  useEffect(() => {
    document.title = `${title} · ${t("app.name")}`;
  }, [title, t]);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {node.data ? (
          <span className="flex items-center gap-2 text-fg-muted">
            {node.data.name}
            <HealthBadge state={node.data.health} label={groupHealthLabel(t, node.data.health, node.data.healthCounts)} />
          </span>
        ) : (
          <Skeleton className="h-5 w-48" />
        )}
      </header>

      <KpiStrip scopeId={scopeId} role={role} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <TopRisks scopeId={scopeId} className="lg:col-span-7" />
        <DailyBriefing scopeId={scopeId} className="lg:col-span-5" />
        <SiteMapWidget scopeId={scopeId} className="lg:col-span-12" />
      </div>
    </div>
  );
}
