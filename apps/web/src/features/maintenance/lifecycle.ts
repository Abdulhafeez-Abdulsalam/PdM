/**
 * Work-order lifecycle rules for the UI: which moves a role may make, how Kanban columns map
 * to statuses, and what dropping a card on a column means. Pure functions — easy to test.
 *
 * The moves themselves come from WORK_ORDER_TRANSITIONS in the contract, so the UI and the
 * backend can never disagree about what's allowed; this file only adds "who".
 */
import { WORK_ORDER_TRANSITIONS, canTransition, type RoleId, type WorkOrder, type WorkOrderStatus } from "@pdm/contracts";
import { canDo, type Action } from "../../shared/roles/roles";

/** The permission needed to move a work order INTO a status. */
const ACTION_FOR: Record<WorkOrderStatus, Action> = {
  requested: "workOrder.schedule",
  triaged: "workOrder.schedule",
  planned: "workOrder.schedule",
  scheduled: "workOrder.schedule",
  approved: "workOrder.approve",
  in_progress: "workOrder.execute",
  completed: "workOrder.close",
  verified: "workOrder.verify",
  closed: "workOrder.schedule",
  cancelled: "workOrder.cancel",
};

/** Reopening completed work (completed → in_progress) is a verifier's call, not the technician's. */
function actionFor(from: WorkOrderStatus, to: WorkOrderStatus): Action {
  return from === "completed" && to === "in_progress" ? "workOrder.verify" : ACTION_FOR[to];
}

export function mayMove(role: RoleId, from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  if (to === "completed") return from === "in_progress" && canDo(role, "workOrder.close");
  return canTransition(from, to) && canDo(role, actionFor(from, to));
}

/** Every next status this role may move this work order to (close-out included as "completed"). */
export function allowedMoves(role: RoleId, wo: Pick<WorkOrder, "status">): WorkOrderStatus[] {
  const next: WorkOrderStatus[] = [...WORK_ORDER_TRANSITIONS[wo.status]];
  if (wo.status === "in_progress") next.unshift("completed");
  return next.filter((to) => mayMove(role, wo.status, to));
}

/** Text-catalog key for a move's button: moving completed work back to in-progress is a "reopen". */
export function moveLabelKey(from: WorkOrderStatus, to: WorkOrderStatus): string {
  return `board.moveLabel.${from === "completed" && to === "in_progress" ? "reopen" : to}`;
}

// ─── Kanban ──────────────────────────────────────────────────────────────────

export interface BoardColumn {
  id: string;
  /** Statuses whose cards sit in this column. */
  statuses: readonly WorkOrderStatus[];
  /** The status a card gets when dropped here. */
  dropTo: WorkOrderStatus;
}

/** Closed and cancelled work leave the board (they're in the list view). */
export const BOARD_COLUMNS: readonly BoardColumn[] = [
  { id: "requested", statuses: ["requested", "triaged"], dropTo: "triaged" },
  { id: "planned", statuses: ["planned"], dropTo: "planned" },
  { id: "scheduled", statuses: ["scheduled"], dropTo: "scheduled" },
  { id: "approved", statuses: ["approved"], dropTo: "approved" },
  { id: "in_progress", statuses: ["in_progress"], dropTo: "in_progress" },
  { id: "done", statuses: ["completed", "verified"], dropTo: "completed" },
];

export const BOARD_STATUSES: WorkOrderStatus[] = BOARD_COLUMNS.flatMap((c) => c.statuses);

export function columnOf(status: WorkOrderStatus): BoardColumn | undefined {
  return BOARD_COLUMNS.find((c) => c.statuses.includes(status));
}

/** What dropping a card on a column should do. */
export type DropOutcome =
  | { kind: "none" } // dropped where it already is
  | { kind: "move"; to: WorkOrderStatus }
  | { kind: "schedule" } // needs a start time / assignee first
  | { kind: "closeOut" } // needs the technician's close-out form
  | { kind: "refuse"; reason: "notAllowed" | "role" };

export function resolveDrop(
  role: RoleId,
  wo: Pick<WorkOrder, "status" | "scheduledStart" | "assigneeId">,
  column: BoardColumn,
): DropOutcome {
  if (column.statuses.includes(wo.status)) return { kind: "none" };
  const to = column.dropTo;
  const possible = to === "completed" ? wo.status === "in_progress" : canTransition(wo.status, to);
  if (!possible) return { kind: "refuse", reason: "notAllowed" };
  if (!mayMove(role, wo.status, to)) return { kind: "refuse", reason: "role" };
  if (to === "completed") return { kind: "closeOut" };
  if (to === "scheduled" && (!wo.scheduledStart || !wo.assigneeId)) return { kind: "schedule" };
  return { kind: "move", to };
}
