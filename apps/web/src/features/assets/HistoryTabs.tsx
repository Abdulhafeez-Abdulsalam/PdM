/**
 * Asset 360 · Alarms (with the same actions as the Alarms page) and Maintenance
 * (read-only until the work-order lifecycle arrives in Phase 2).
 */
import { useApiQuery } from "@pdm/api-client";
import type { Asset, WorkOrderStatus } from "@pdm/contracts";
import { Skeleton } from "@pdm/ui";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../shared/format";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";
import { AlarmTable } from "../alarms/AlarmTable";
import { STATES_FOR } from "../alarms/alarm-search";

export const WORK_ORDER_OPEN: readonly WorkOrderStatus[] = ["requested", "triaged", "planned", "scheduled", "approved", "in_progress"];

const rows = (
  <div className="flex flex-col gap-2">
    {[0, 1, 2, 3].map((i) => (
      <Skeleton key={i} className="h-8" />
    ))}
  </div>
);

export function AlarmsTab({ asset }: { asset: Asset; siteTimeZone?: string }) {
  const { t } = useTranslation();
  const alarms = useApiQuery(
    "alarms.list",
    { assetId: asset.id, states: STATES_FOR.all, sort: "newest", limit: 100 },
    { refetchInterval: 15_000 },
  );
  const items = alarms.data?.items ?? [];

  return (
    <DashboardWidget
      title={t("assets.alarmsTitle", { count: alarms.data?.total ?? 0 })}
      query={alarms}
      isEmpty={items.length === 0}
      emptyText={t("assets.noAlarms")}
      skeleton={rows}
    >
      <AlarmTable alarms={items} caption={t("assets.alarmsTitle", { count: items.length })} showAsset={false} />
    </DashboardWidget>
  );
}

export function MaintenanceTab({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const orders = useApiQuery("workOrders.list", { assetId: asset.id, limit: 100 });
  const items = orders.data?.items ?? [];

  return (
    <DashboardWidget
      title={t("assets.workOrdersTitle", { count: orders.data?.total ?? 0 })}
      query={orders}
      isEmpty={items.length === 0}
      emptyText={t("assets.noWorkOrders")}
      skeleton={rows}
    >
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="px-4 py-2 font-medium">
                {t("workOrders.number")}
              </th>
              <th scope="col" className="py-2 font-medium">
                {t("workOrders.title")}
              </th>
              <th scope="col" className="py-2 font-medium">
                {t("workOrders.type")}
              </th>
              <th scope="col" className="py-2 font-medium">
                {t("workOrders.status")}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t("workOrders.created")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{w.number}</td>
                <td className="py-2">{w.title}</td>
                <td className="py-2">{t(`workOrders.types.${w.type}`)}</td>
                <td className="py-2">{t(`workOrders.statuses.${w.status}`)}</td>
                <td className="px-4 py-2 whitespace-nowrap tabular-nums">{formatDate(w.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardWidget>
  );
}
