/**
 * Maintenance (spec §6.6): the work-order lifecycle as a Kanban board, a sortable list that
 * also shows closed and cancelled work, or a month calendar of planned starts. The schedule
 * board (who does what, when) has its own page. Follows the scope from the top bar.
 */
import { useApiQuery } from "@pdm/api-client";
import { type WorkOrderStatus } from "@pdm/contracts";
import { Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { GanttChart, Repeat } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatDate } from "../../shared/format";
import { useGlobalSearch } from "../../shared/time-range";
import { useUsers } from "../../shared/users";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";
import { BOARD_STATUSES } from "./lifecycle";
import { MaintenanceCalendar } from "./MaintenanceCalendar";
import { PriorityLabel } from "./PriorityLabel";
import { WorkOrderBoard } from "./WorkOrderBoard";

const SHOW = ["open", "done", "cancelled", "all"] as const;
const STATUSES: Record<(typeof SHOW)[number], WorkOrderStatus[] | undefined> = {
  open: ["requested", "triaged", "planned", "scheduled", "approved", "in_progress"],
  done: ["completed", "verified", "closed"],
  cancelled: ["cancelled"],
  all: undefined,
};

const searchSchema = z.object({
  view: z.enum(["board", "list", "calendar"]).catch("board"),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional()
    .catch(undefined),
  show: z.enum(SHOW).catch("open"),
  mine: z.enum(["yes", "no"]).catch("no"),
});

export function MaintenancePage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();
  const set = (patch: Partial<z.output<typeof searchSchema>>) =>
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) });
  const me = useApiQuery("me.get", {});
  const assigneeId = search.mine === "yes" ? me.data?.id : undefined;

  useEffect(() => {
    document.title = `${t("modules.maintenance.name")} · ${t("app.name")}`;
  }, [t]);

  return (
    <div className="mx-auto flex max-w-[1800px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("modules.maintenance.name")}</h1>
          <p className="text-fg-muted">{t("maintenance.intro")}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to="/maintenance/schedule"
            search={(prev) => prev}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken"
          >
            <GanttChart aria-hidden className="size-4" />
            {t("schedule.title")}
          </Link>
          <Link
            to="/maintenance/pm"
            search={(prev) => prev}
            className="inline-flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-sm hover:bg-sunken"
          >
            <Repeat aria-hidden className="size-4" />
            {t("pm.title.page")}
          </Link>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={search.mine === "yes"} onChange={(e) => set({ mine: e.target.checked ? "yes" : "no" })} />
            {t("maintenance.onlyMine")}
          </label>
          <div role="tablist" aria-label={t("alarmsPage.views")} className="flex rounded-md border border-line p-0.5">
            {(["board", "list", "calendar"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={search.view === v}
                onClick={() => set({ view: v })}
                className={cx("rounded px-3 py-1 text-sm", search.view === v ? "bg-sunken font-semibold" : "text-fg-muted hover:text-fg")}
              >
                {t(`maintenance.view.${v}`)}
              </button>
            ))}
          </div>
        </div>
      </header>

      {search.view === "board" ? (
        <BoardView scopeId={scopeId} assigneeId={assigneeId} />
      ) : search.view === "calendar" ? (
        <MaintenanceCalendar scopeId={scopeId} assigneeId={assigneeId} month={search.month} onMonth={(month) => set({ month })} />
      ) : (
        <ListView scopeId={scopeId} assigneeId={assigneeId} show={search.show} onShow={(show) => set({ show })} />
      )}
    </div>
  );
}

function BoardView({ scopeId, assigneeId }: { scopeId: string; assigneeId?: string }) {
  const { t } = useTranslation();
  const orders = useApiQuery(
    "workOrders.list",
    { scopeId, assigneeId, status: BOARD_STATUSES, sort: "priority", limit: 500 },
    { placeholderData: keepPreviousData, refetchInterval: 30_000 },
  );
  if (orders.isPending) {
    return (
      <div className="flex gap-3 overflow-hidden">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-96 w-72 shrink-0" />
        ))}
      </div>
    );
  }
  if (orders.isError) return <p className="text-health-warning">{t("widget.failed")}</p>;
  return (
    <div className={cx("transition-opacity", orders.isPlaceholderData && "opacity-60")}>
      <p className="mb-2 text-xs text-fg-muted">{t("board.hint")}</p>
      <WorkOrderBoard orders={orders.data.items} />
    </div>
  );
}

function ListView({
  scopeId,
  assigneeId,
  show,
  onShow,
}: {
  scopeId: string;
  assigneeId?: string;
  show: (typeof SHOW)[number];
  onShow: (s: (typeof SHOW)[number]) => void;
}) {
  const { t } = useTranslation();
  const { byId } = useUsers();
  const orders = useApiQuery(
    "workOrders.list",
    { scopeId, assigneeId, status: STATUSES[show], sort: show === "open" ? "priority" : "newest", limit: 300 },
    { placeholderData: keepPreviousData },
  );
  const items = orders.data?.items ?? [];

  return (
    <>
      <Select
        label={t("alarmsPage.show")}
        value={show}
        options={SHOW.map((s) => ({ value: s, label: t(`maintenance.show.${s}`) }))}
        onChange={onShow}
      />
      <DashboardWidget
        title={t("maintenance.count", { count: orders.data?.total ?? 0 })}
        query={orders}
        isEmpty={items.length === 0}
        emptyText={t("assets.noWorkOrders")}
      >
        <div className="relative -mx-4 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("workOrders.number")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("workOrders.title")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("assets.col.asset")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("createWo.priority")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("workOrders.status")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("createWo.assignee")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("createWo.due")}
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((w) => (
                <tr key={w.id} className="border-b border-line last:border-0 hover:bg-sunken">
                  <td className="px-4 py-2 font-mono text-xs whitespace-nowrap">{w.number}</td>
                  <td className="py-2 pr-3">
                    <Link to="/maintenance/$workOrderId" params={{ workOrderId: w.id }} search={(prev) => prev} className="hover:underline">
                      {w.title}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 font-mono text-xs">{w.assetId}</td>
                  <td className="py-2 pr-3">
                    <PriorityLabel priority={w.priority} />
                  </td>
                  <td className="py-2 pr-3">{t(`workOrders.statuses.${w.status}`)}</td>
                  <td className="py-2 pr-3">{w.assigneeId ? (byId.get(w.assigneeId)?.name ?? w.assigneeId) : "—"}</td>
                  <td className="px-4 py-2 whitespace-nowrap">{w.dueAt ? formatDate(w.dueAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DashboardWidget>
    </>
  );
}
