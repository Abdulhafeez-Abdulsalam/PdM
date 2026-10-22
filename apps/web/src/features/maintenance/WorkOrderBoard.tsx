/**
 * Kanban board (spec §6.6): drag a card to the next column to move it through the lifecycle.
 * Only moves your role may make are possible; invalid drops snap back with a reason.
 * Keyboard and screen-reader users get the same through each card's "Move to…" menu, and
 * dnd-kit announces drag-and-drop progress.
 */
import type { WorkOrder, WorkOrderStatus } from "@pdm/contracts";
import { DndContext, KeyboardSensor, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { cx } from "@pdm/ui";
import { useCallback, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../shared/preferences";
import { useToasts } from "../../shared/toast";
import { useUsers } from "../../shared/users";
import { BOARD_COLUMNS, resolveDrop, type BoardColumn } from "./lifecycle";
import { WorkOrderCard } from "./WorkOrderCard";
import { WorkOrderDialogs } from "./WorkOrderDialogs";
import { useMove } from "./use-move";

export function WorkOrderBoard({ orders }: { orders: readonly WorkOrder[] }) {
  const { t } = useTranslation();
  const role = usePreferences((p) => p.role);
  const { byId } = useUsers();
  const toast = useToasts((s) => s.show);
  const { move, dialog, closeDialog, openDialog } = useMove();
  // One function for every card, for the life of the board: `move` itself is rebuilt each
  // render, so cards call it through a ref that always holds the latest one.
  const moveRef = useRef(move);
  useLayoutEffect(() => {
    moveRef.current = move;
  });
  const onMove = useCallback((wo: WorkOrder, to: WorkOrderStatus) => moveRef.current(wo, to), []);
  // A small move threshold so clicking the grip without dragging doesn't start a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const wo = (active.data.current as { wo?: WorkOrder } | undefined)?.wo;
    const column = BOARD_COLUMNS.find((c) => c.id === over?.id);
    if (!wo || !column) return;
    const outcome = resolveDrop(role, wo, column);
    switch (outcome.kind) {
      case "move":
        move(wo, outcome.to);
        break;
      case "schedule":
        openDialog({ kind: "schedule", workOrder: wo });
        break;
      case "closeOut":
        move(wo, "completed");
        break;
      case "refuse":
        toast("error", t(`board.refuse.${outcome.reason}`, { number: wo.number, column: t(`board.column.${column.id}`) }));
        break;
      case "none":
        break;
    }
  };

  return (
    <>
      <DndContext
        sensors={sensors}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: t("board.srInstructions") },
          announcements: {
            onDragStart: ({ active }) => t("board.announce.start", { id: String(active.id) }),
            onDragOver: ({ over }) => (over ? t("board.announce.over", { column: t(`board.column.${String(over.id)}`) }) : undefined),
            onDragEnd: ({ over }) =>
              over ? t("board.announce.end", { column: t(`board.column.${String(over.id)}`) }) : t("board.announce.cancel"),
            onDragCancel: () => t("board.announce.cancel"),
          },
        }}
      >
        <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
          {BOARD_COLUMNS.map((column) => (
            <Column key={column.id} column={column} orders={orders.filter((o) => column.statuses.includes(o.status))}>
              {(wo) => <WorkOrderCard key={wo.id} wo={wo} assignee={wo.assigneeId ? byId.get(wo.assigneeId) : undefined} onMove={onMove} />}
            </Column>
          ))}
        </div>
      </DndContext>
      <WorkOrderDialogs dialog={dialog} onClose={closeDialog} />
    </>
  );
}

function Column({
  column,
  orders,
  children,
}: {
  column: BoardColumn;
  orders: readonly WorkOrder[];
  children: (wo: WorkOrder) => React.ReactNode;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: column.id });
  const name = t(`board.column.${column.id}`);
  return (
    <section
      ref={setNodeRef}
      aria-label={t("board.columnLabel", { name, count: orders.length })}
      className={cx("flex w-72 shrink-0 flex-col rounded-lg border border-line bg-sunken", isOver && "ring-2 ring-accent")}
    >
      <h2 className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
        {name}
        <span className="rounded-full bg-surface px-2 text-xs font-normal text-fg-muted">{orders.length}</span>
      </h2>
      <div className="flex max-h-[65vh] min-h-24 flex-col gap-2 overflow-y-auto p-2 pt-0">
        {orders.length === 0 ? <p className="p-2 text-xs text-fg-muted">{t("board.emptyColumn")}</p> : orders.map(children)}
      </div>
    </section>
  );
}
