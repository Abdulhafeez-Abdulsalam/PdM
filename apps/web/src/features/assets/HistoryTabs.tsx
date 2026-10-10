/**
 * Asset 360 · Alarms and Maintenance tabs (read-only lists for now — acting on alarms
 * arrives with the Alarms page in chunk 4; the work-order lifecycle in Phase 2).
 */
import { useApiQuery } from "@pdm/api-client";
import type { Asset, WorkOrderStatus } from "@pdm/contracts";
import { PriorityIcon, Skeleton } from "@pdm/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";

export const WORK_ORDER_OPEN: readonly WorkOrderStatus[] = ["requested", "triaged", "planned", "scheduled", "approved", "in_progress"];

const rows = <div className="flex flex-col gap-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-8" />)}</div>;

export function AlarmsTab({ asset, siteTimeZone }: { asset: Asset; siteTimeZone?: string }) {
  const { t } = useTranslation();
  const tz = usePreferences((p) => p.timeZone);
  const formatTime = useMemo(() => makeTimeFormatter(tz, siteTimeZone), [tz, siteTimeZone]);
  const alarms = useApiQuery("alarms.list", { assetId: asset.id, sort: "newest", limit: 100 }, { refetchInterval: 15_000 });
  const items = alarms.data?.items ?? [];

  return (
    <DashboardWidget title={t("assets.alarmsTitle", { count: alarms.data?.total ?? 0 })} query={alarms} isEmpty={items.length === 0} emptyText={t("assets.noAlarms")} skeleton={rows}>
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="px-4 py-2 font-medium">{t("alarmList.priority")}</th>
              <th scope="col" className="py-2 font-medium">{t("alarmList.message")}</th>
              <th scope="col" className="py-2 font-medium">{t("alarmList.state")}</th>
              <th scope="col" className="px-4 py-2 font-medium">{t("alarmList.raised")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2">
                  <span className="flex items-center gap-1.5">
                    <PriorityIcon priority={a.priority} />
                    {t(`alarms.priority.${a.priority}`)}
                  </span>
                </td>
                <td className="py-2">
                  {a.message}
                  {a.occurrenceCount > 5 && <span className="ml-2 text-xs text-health-warning">{t("alarmList.chattering", { count: a.occurrenceCount })}</span>}
                </td>
                <td className="py-2">{t(`alarmList.states.${a.state}`)}</td>
                <td className="px-4 py-2 tabular-nums">{formatTime(Date.parse(a.raisedAt))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardWidget>
  );
}

export function MaintenanceTab({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const orders = useApiQuery("workOrders.list", { assetId: asset.id, limit: 100 });
  const items = orders.data?.items ?? [];

  return (
    <DashboardWidget title={t("assets.workOrdersTitle", { count: orders.data?.total ?? 0 })} query={orders} isEmpty={items.length === 0} emptyText={t("assets.noWorkOrders")} skeleton={rows}>
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="px-4 py-2 font-medium">{t("workOrders.number")}</th>
              <th scope="col" className="py-2 font-medium">{t("workOrders.title")}</th>
              <th scope="col" className="py-2 font-medium">{t("workOrders.type")}</th>
              <th scope="col" className="py-2 font-medium">{t("workOrders.status")}</th>
              <th scope="col" className="px-4 py-2 font-medium">{t("workOrders.created")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((w) => (
              <tr key={w.id} className="border-b border-line last:border-0">
                <td className="whitespace-nowrap px-4 py-2 font-mono text-xs">{w.number}</td>
                <td className="py-2">{w.title}</td>
                <td className="py-2">{t(`workOrders.types.${w.type}`)}</td>
                <td className="py-2">{t(`workOrders.statuses.${w.status}`)}</td>
                <td className="whitespace-nowrap px-4 py-2 tabular-nums">{formatDate(w.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardWidget>
  );
}
