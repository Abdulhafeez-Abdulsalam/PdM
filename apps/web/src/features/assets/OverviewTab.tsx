/** Asset 360 · Overview: key live values, open predictions, and what's going on around the asset. */
import { useApiQuery } from "@pdm/api-client";
import type { Asset, Tag } from "@pdm/contracts";
import { Skeleton } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatProbability } from "../../shared/format";
import { useSetGlobalSearch } from "../../shared/time-range";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";
import { WORK_ORDER_OPEN } from "./HistoryTabs";
import { LiveTagValue } from "../telemetry/LiveTagValue";

/** Tags with limits first (they say most about condition), then the rest. */
export function keyTags(tags: readonly Tag[], max: number): Tag[] {
  const withLimits = tags.filter((t) => Object.keys(t.limits).length > 0);
  const rest = tags.filter((t) => Object.keys(t.limits).length === 0);
  return [...withLimits, ...rest].slice(0, max);
}

export function OverviewTab({ asset }: { asset: Asset; siteTimeZone?: string }) {
  const { t } = useTranslation();
  const setSearch = useSetGlobalSearch();
  const tags = useApiQuery("assets.tags", { assetId: asset.id });
  const predictions = useApiQuery("predictions.list", { assetId: asset.id, status: ["open", "acknowledged", "actioned"] });
  const alarms = useApiQuery("alarms.list", { assetId: asset.id, states: ["active_unacked", "active_acked", "rtn_unacked"], limit: 1 });
  const workOrders = useApiQuery("workOrders.list", { assetId: asset.id, status: [...WORK_ORDER_OPEN], limit: 1 });

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <DashboardWidget
        title={t("assets.keyValues")}
        query={tags}
        className="lg:col-span-7"
        skeleton={
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-7" />
            ))}
          </div>
        }
      >
        <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {keyTags(tags.data?.items ?? [], 8).map((tag) => (
            <div key={tag.id} className="flex items-center justify-between gap-3 border-b border-line py-2 text-sm">
              <dt className="min-w-0 truncate text-fg-muted" title={tag.description}>
                {tag.description}
              </dt>
              <dd>
                <LiveTagValue tag={tag} />
              </dd>
            </div>
          ))}
        </dl>
        <Link
          to="/assets/$assetId/$tab"
          params={{ assetId: asset.id, tab: "telemetry" }}
          search={(prev) => prev}
          className="mt-3 inline-flex items-center gap-1 text-sm text-accent hover:underline"
        >
          {t("assets.allTelemetry")}
          <ChevronRight aria-hidden className="size-4" />
        </Link>
      </DashboardWidget>

      <div className="flex flex-col gap-4 lg:col-span-5">
        <DashboardWidget
          title={t("assets.openPredictions")}
          query={predictions}
          isEmpty={predictions.data?.items.length === 0}
          emptyText={t("assets.noPredictions")}
        >
          <ul className="flex flex-col gap-2">
            {predictions.data?.items.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSearch({ prediction: p.id })}
                  className="flex w-full items-center gap-3 rounded-md border border-line p-3 text-left hover:bg-sunken"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{p.failureMode.label}</span>
                    <span className="block text-xs text-fg-muted">
                      {t("prediction.probabilityWithin", { probability: formatProbability(p.probability), count: p.horizonDays })}
                      {p.workOrderId && ` · ${t("prediction.hasWorkOrder")}`}
                    </span>
                  </span>
                  <ChevronRight aria-hidden className="size-4 text-fg-muted" />
                </button>
              </li>
            ))}
          </ul>
        </DashboardWidget>

        <div className="grid grid-cols-2 gap-4">
          <CountCard label={t("assets.activeAlarms")} value={alarms.data?.total} to="alarms" assetId={asset.id} />
          <CountCard label={t("assets.openWorkOrders")} value={workOrders.data?.total} to="maintenance" assetId={asset.id} />
        </div>
      </div>
    </div>
  );
}

function CountCard({
  label,
  value,
  to,
  assetId,
}: {
  label: string;
  value: number | undefined;
  to: "alarms" | "maintenance";
  assetId: string;
}) {
  return (
    <Link
      to="/assets/$assetId/$tab"
      params={{ assetId, tab: to }}
      search={(prev) => prev}
      className="rounded-lg border border-line bg-surface p-4 hover:bg-sunken"
    >
      <span className="block text-xs text-fg-muted">{label}</span>
      {value === undefined ? <Skeleton className="mt-1 h-7 w-10" /> : <span className="text-2xl font-semibold">{value}</span>}
    </Link>
  );
}
