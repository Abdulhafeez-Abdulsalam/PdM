/** A work order on the board: what, where, who, when — plus its allowed moves. */
import type { User, WorkOrder, WorkOrderStatus } from "@pdm/contracts";
import { Popover, cx } from "@pdm/ui";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Link } from "@tanstack/react-router";
import { ArrowRightLeft, CalendarClock, GripVertical, User as UserIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../shared/format";
import { moveLabelKey } from "./lifecycle";
import { PriorityLabel } from "./PriorityLabel";

interface Props {
  wo: WorkOrder;
  assignee: User | undefined;
  moves: WorkOrderStatus[];
  now: number;
  onMove: (to: WorkOrderStatus) => void;
}

export function WorkOrderCard({ wo, assignee, moves, now, onMove }: Props) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: wo.id,
    data: { wo },
    disabled: moves.length === 0,
  });
  const overdue = wo.dueAt !== null && Date.parse(wo.dueAt) < now && !["completed", "verified", "closed"].includes(wo.status);

  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      aria-label={t("board.cardLabel", { number: wo.number, title: wo.title })}
      className={cx(
        "flex flex-col gap-1.5 rounded-md border border-line bg-surface p-2.5 text-sm shadow-1",
        isDragging && "relative z-10 opacity-80 shadow-2",
      )}
    >
      <div className="flex items-center gap-1.5">
        {moves.length > 0 && (
          <button
            type="button"
            {...listeners}
            {...attributes}
            aria-label={t("board.dragHandle", { number: wo.number })}
            className="-ml-1 cursor-grab rounded p-0.5 text-fg-muted hover:bg-sunken active:cursor-grabbing"
          >
            <GripVertical aria-hidden className="size-4" />
          </button>
        )}
        <span className="font-mono text-xs text-fg-muted">{wo.number}</span>
        <PriorityLabel priority={wo.priority} className="ml-auto" />
      </div>
      <Link
        to="/maintenance/$workOrderId"
        params={{ workOrderId: wo.id }}
        search={(prev) => prev}
        className="leading-snug font-medium hover:underline"
      >
        {wo.title}
      </Link>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fg-muted">
        <span className="font-mono">{wo.assetId}</span>
        {assignee && (
          <span className="inline-flex items-center gap-1">
            <UserIcon aria-hidden className="size-3" />
            {assignee.name}
          </span>
        )}
        {wo.dueAt && (
          <span className={cx("inline-flex items-center gap-1", overdue && "font-semibold text-health-warning")}>
            <CalendarClock aria-hidden className="size-3" />
            {overdue ? t("board.overdue", { date: formatDate(wo.dueAt) }) : formatDate(wo.dueAt)}
          </span>
        )}
        {wo.status === "verified" && <span className="rounded border border-line px-1">{t("workOrders.statuses.verified")}</span>}
        {wo.status === "triaged" && <span className="rounded border border-line px-1">{t("workOrders.statuses.triaged")}</span>}
      </div>
      {moves.length > 0 && (
        <Popover
          align="start"
          className="w-56 p-1"
          trigger={
            <button
              type="button"
              aria-label={`${t("board.moveTo")} ${wo.number}`}
              className="mt-0.5 inline-flex items-center gap-1 self-start rounded px-1 text-xs text-accent hover:bg-sunken"
            >
              <ArrowRightLeft aria-hidden className="size-3" />
              {t("board.moveTo")}
            </button>
          }
        >
          <ul aria-label={t("board.moveTo")}>
            {moves.map((to) => (
              <li key={to}>
                <button type="button" onClick={() => onMove(to)} className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-sunken">
                  {t(moveLabelKey(wo.status, to))}
                </button>
              </li>
            ))}
          </ul>
        </Popover>
      )}
    </article>
  );
}
