/**
 * Moving work orders. Simple moves are optimistic — the card jumps column immediately and
 * snaps back with a message if the server refuses — so dragging feels instant.
 */
import { useApiMutation } from "@pdm/api-client";
import type { EndpointOutput, WorkOrder } from "@pdm/contracts";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToasts } from "../../shared/toast";

type WorkOrderPage = EndpointOutput<"workOrders.list">;
const AFFECTED = [
  "workOrders.list",
  "workOrders.get",
  "predictions.list",
  "predictions.get",
  "predictions.feedbackSummary",
  "kpis.get",
  "events.list",
];

export function useWorkOrderActions() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const refresh = () => AFFECTED.forEach((key) => void client.invalidateQueries({ queryKey: [key] }));

  const transition = useApiMutation("workOrders.transition", {
    onMutate: async ({ workOrderId, to }) => {
      await client.cancelQueries({ queryKey: ["workOrders.list"] });
      const previous = client.getQueriesData<WorkOrderPage>({ queryKey: ["workOrders.list"] });
      client.setQueriesData<WorkOrderPage>(
        { queryKey: ["workOrders.list"] },
        (old) => old && { ...old, items: old.items.map((w): WorkOrder => (w.id === workOrderId ? { ...w, status: to } : w)) },
      );
      return { previous };
    },
    onError: (error, _input, context) => {
      (context as { previous?: [QueryKey, WorkOrderPage | undefined][] } | undefined)?.previous?.forEach(([key, data]) =>
        client.setQueryData(key, data),
      );
      toast("error", t("alarmActions.failed", { reason: error.message }));
    },
    onSuccess: (wo) => toast("success", t("workOrderActions.moved", { number: wo.number, status: t(`workOrders.statuses.${wo.status}`) })),
    onSettled: refresh,
  });

  const closeOut = useApiMutation("workOrders.closeOut", {
    onSuccess: (wo) => toast("success", t("workOrderActions.closedOut", { number: wo.number })),
    onError: (error) => toast("error", t("alarmActions.failed", { reason: error.message })),
    onSettled: refresh,
  });

  return { transition, closeOut };
}
