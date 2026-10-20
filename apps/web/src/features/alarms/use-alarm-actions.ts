/**
 * Operator actions on alarms. Acknowledge is OPTIMISTIC: the row updates immediately and
 * rolls back with a message if the server refuses (design system §9) — operators handling a
 * flood can't wait for a round trip per alarm.
 */
import { useApiMutation } from "@pdm/api-client";
import type { Alarm, EndpointOutput } from "@pdm/contracts";
import { useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToasts } from "../../shared/toast";

type AlarmPage = EndpointOutput<"alarms.list">;

export function useAlarmActions() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["alarms.list"] });
    void client.invalidateQueries({ queryKey: ["alarms.summary"] });
  };

  const acknowledge = useApiMutation("alarms.acknowledge", {
    onMutate: async ({ alarmIds }) => {
      await client.cancelQueries({ queryKey: ["alarms.list"] });
      const previous = client.getQueriesData<AlarmPage>({ queryKey: ["alarms.list"] });
      client.setQueriesData<AlarmPage>(
        { queryKey: ["alarms.list"] },
        (old) => old && { ...old, items: old.items.map((a) => (alarmIds.includes(a.id) ? acknowledgedLocally(a) : a)) },
      );
      return { previous };
    },
    onError: (_error, _input, context) => {
      (context as { previous?: [QueryKey, AlarmPage | undefined][] } | undefined)?.previous?.forEach(([key, data]) =>
        client.setQueryData(key, data),
      );
      toast("error", t("alarmActions.ackFailed"));
    },
    onSuccess: (data) => toast("success", t("alarmActions.acknowledged", { count: data.items.length })),
    onSettled: refresh,
  });

  const shelve = useApiMutation("alarms.shelve", {
    onSuccess: (alarm) => toast("success", t("alarmActions.shelved", { message: alarm.message })),
    onError: (error) => toast("error", t("alarmActions.failed", { reason: error.message })),
    onSettled: refresh,
  });

  const unshelve = useApiMutation("alarms.unshelve", {
    onSuccess: () => toast("success", t("alarmActions.unshelved")),
    onError: (error) => toast("error", t("alarmActions.failed", { reason: error.message })),
    onSettled: refresh,
  });

  return { acknowledge, shelve, unshelve };
}

function acknowledgedLocally(a: Alarm): Alarm {
  if (a.state === "active_unacked") return { ...a, state: "active_acked" };
  if (a.state === "rtn_unacked") return { ...a, state: "cleared" };
  return a;
}
