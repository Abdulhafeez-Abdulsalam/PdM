/**
 * Work-order lifecycle rules for the UI: which moves a role may make, how Kanban columns map
 * to statuses, and what dropping a card on a column means. Pure functions — easy to test.
 *
 * The moves themselves, and who may make them, come from the contracts, so the UI and the
 * server can never disagree about what's allowed.
 */
import { canTransition, mayMove, type RoleId, type WorkOrder, type WorkOrderStatus } from "@pdm/contracts";

/** Who may make which move is decided in the contracts, so the board and the server agree (ADR-0014). */
export { allowedMoves, mayMove } from "@pdm/contracts";

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
