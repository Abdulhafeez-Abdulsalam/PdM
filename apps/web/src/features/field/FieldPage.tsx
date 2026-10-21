/**
 * Field (spec §6.14, online only — ADR-0007): "What are my jobs today?" A phone-sized list of
 * the work assigned to me, grouped by what I can do next. Each row opens the task page.
 */
import { useApiQuery } from "@pdm/api-client";
import { isChecklistItemDone, type WorkOrder, type WorkOrderStatus } from "@pdm/contracts";
import { EmptyState, Skeleton, cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ChevronRight, ClipboardCheck } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../shared/format";
import { useSimNow } from "../../shared/sim-time";
import { PriorityLabel } from "../maintenance/PriorityLabel";

/** In the order a technician cares about: carry on, then start, then what's coming. */
const GROUPS: readonly WorkOrderStatus[] = ["in_progress", "approved", "scheduled"];

export function FieldPage() {
  const { t } = useTranslation();
  const me = useApiQuery("me.get", {});
  const orders = useApiQuery(
    "workOrders.list",
    { assigneeId: me.data?.id, status: [...GROUPS], sort: "due", limit: 100 },
    { enabled: me.data !== undefined, refetchInterval: 30_000 },
  );

  useEffect(() => {
    document.title = `${t("field.myJobs")} · ${t("app.name")}`;
  }, [t]);

  const items = orders.data?.items ?? [];
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5">
      <header>
        <h1 className="text-2xl font-semibold">{t("field.myJobs")}</h1>
        {me.data && <p className="text-fg-muted">{t("field.assignedTo", { name: me.data.name, count: items.length })}</p>}
      </header>

      {orders.isPending ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : orders.isError ? (
        <p className="text-health-warning">{t("widget.failed")}</p>
      ) : items.length === 0 ? (
        <EmptyState icon={<ClipboardCheck className="size-8" />} title={t("field.noJobs")}>
          {t("field.noJobsHint")}
        </EmptyState>
      ) : (
        GROUPS.map((status) => {
          const group = items.filter((w) => w.status === status);
          if (group.length === 0) return null;
          return (
            <section key={status} aria-labelledby={`field-${status}`}>
              <h2 id={`field-${status}`} className="mb-2 text-sm font-semibold tracking-wide text-fg-muted uppercase">
                {t(`field.group.${status}`)} · {group.length}
              </h2>
              <ul className="flex flex-col gap-3">
                {group.map((wo) => (
                  <li key={wo.id}>
                    <JobRow wo={wo} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}

function JobRow({ wo }: { wo: WorkOrder }) {
  const { t } = useTranslation();
  const { now } = useSimNow();
  const done = wo.checklist.filter(isChecklistItemDone).length;
  const overdue = wo.dueAt !== null && Date.parse(wo.dueAt) < now;
  return (
    <Link
      to="/field/tasks/$taskId"
      params={{ taskId: wo.id }}
      search={(prev) => prev}
      className="flex min-h-12 items-center gap-3 rounded-lg border border-line bg-surface p-4 shadow-1 hover:bg-sunken"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2 text-xs text-fg-muted">
          <span className="font-mono">{wo.number}</span>
          <PriorityLabel priority={wo.priority} className="ml-auto" />
        </div>
        <span className="leading-snug font-medium">{wo.title}</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fg-muted">
          <span className="font-mono">{wo.assetId}</span>
          {wo.dueAt && (
            <span className={cx("inline-flex items-center gap-1", overdue && "font-semibold text-health-warning")}>
              <CalendarClock aria-hidden className="size-4" />
              {overdue ? t("board.overdue", { date: formatDate(wo.dueAt) }) : t("field.due", { date: formatDate(wo.dueAt) })}
            </span>
          )}
          <span>{t("field.progress", { done, total: wo.checklist.length })}</span>
        </div>
      </div>
      <ChevronRight aria-hidden className="size-5 shrink-0 text-fg-muted" />
    </Link>
  );
}
