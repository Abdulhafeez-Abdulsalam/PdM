/** Sites on a map, health-coloured, with a list view (always available, and the default when there's no WebGL). */
import { useApiQuery } from "@pdm/api-client";
import { Button, HealthBadge, Skeleton } from "@pdm/ui";
import { List, Map as MapIcon } from "lucide-react";
import { Suspense, lazy, useState } from "react";
import { useTranslation } from "react-i18next";
import { useSetGlobalSearch } from "../../shared/time-range";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";
import { webglAvailable } from "./map-style";

const MapCanvas = lazy(() => import("./MapCanvas"));

const BUSINESS_LINE_ORDER = { oil_gas: 0, gas_to_power: 1, solar: 2 } as const;

export function SiteMapWidget({ scopeId, className }: { scopeId: string; className?: string }) {
  const { t } = useTranslation();
  const setSearch = useSetGlobalSearch();
  const [canMap] = useState(webglAvailable);
  const [view, setView] = useState<"map" | "list">(() => (canMap ? "map" : "list"));
  const sites = useApiQuery("sites.list", {}, { refetchInterval: 30_000 });
  const all = sites.data?.items ?? [];
  const selectSite = (siteId: string) => setSearch({ scope: siteId });

  return (
    <DashboardWidget
      title={t("commandCenter.sites")}
      query={sites}
      className={className}
      actions={
        canMap && (
          <Button size="sm" variant="ghost" onClick={() => setView(view === "map" ? "list" : "map")}>
            {view === "map" ? <List aria-hidden className="size-4" /> : <MapIcon aria-hidden className="size-4" />}
            {view === "map" ? t("commandCenter.showList") : t("commandCenter.showMap")}
          </Button>
        )
      }
    >
      {view === "map" ? (
        <Suspense fallback={<Skeleton className="h-[320px] w-full" />}>
          <MapCanvas sites={all} onSelectSite={selectSite} />
        </Suspense>
      ) : (
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {[...all]
            .sort((a, b) => BUSINESS_LINE_ORDER[a.businessLine] - BUSINESS_LINE_ORDER[b.businessLine] || a.name.localeCompare(b.name))
            .map((site) => (
              <li key={site.id}>
                <button
                  type="button"
                  onClick={() => selectSite(site.id)}
                  aria-current={site.id === scopeId ? "true" : undefined}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunken aria-[current]:bg-sunken"
                >
                  <HealthBadge compact state={site.health} label={t(`health.${site.health}`)} />
                  <span className="min-w-0 flex-1 truncate">{site.name}</span>
                  <span className="text-xs text-fg-muted">{t(`businessLine.${site.businessLine}`)}</span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </DashboardWidget>
  );
}
