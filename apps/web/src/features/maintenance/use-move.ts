/**
 * One place that decides what "move this work order to X" means, used by the board's drag
 * and drop, the card menus, and the work-order page buttons.
 */
import type { WorkOrder, WorkOrderStatus } from "@pdm/contracts";
import { useState } from "react";
import type { WorkOrderDialog } from "./WorkOrderDialogs";
import { useWorkOrderActions } from "./use-work-order-actions";

export function useMove() {
  const { transition } = useWorkOrderActions();
  const [dialog, setDialog] = useState<WorkOrderDialog>(null);

  const move = (wo: WorkOrder, to: WorkOrderStatus) => {
    if (to === "completed") setDialog({ kind: "closeOut", workOrder: wo });
    else if (to === "cancelled") setDialog({ kind: "cancel", workOrder: wo });
    else if (to === "scheduled")
      setDialog({ kind: "schedule", workOrder: wo }); // always confirm when and who
    else transition.mutate({ workOrderId: wo.id, to });
  };

  return { move, dialog, closeDialog: () => setDialog(null), openDialog: setDialog };
}
