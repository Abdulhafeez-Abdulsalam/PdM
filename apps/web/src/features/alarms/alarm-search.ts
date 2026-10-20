/** Alarms page filters, kept in the URL so a filtered view can be shared: ?show=unacked&priority=p1,p2 */
import { AlarmPriority, type AlarmState } from "@pdm/contracts";
import { useSearch } from "@tanstack/react-router";
import { z } from "zod";

export const ALARM_VIEWS = ["list", "timeline"] as const;
export const ALARM_SHOW = ["active", "unacked", "shelved", "suppressed", "all"] as const;

const schema = z.object({
  view: z.enum(ALARM_VIEWS).catch("list"),
  show: z.enum(ALARM_SHOW).catch("active"),
  /** Comma-separated, e.g. "p1,p2". Empty = all priorities. */
  priority: z
    .string()
    .optional()
    .transform((v) => (v ?? "").split(",").filter((p): p is AlarmPriority => AlarmPriority.safeParse(p).success))
    .catch([]),
  group: z.enum(["none", "asset"]).catch("none"),
});
export type AlarmSearch = z.output<typeof schema>;

export function useAlarmSearch(): AlarmSearch {
  return schema.parse(useSearch({ strict: false }));
}

/** Which ISA-18.2 states each "show" choice includes. */
export const STATES_FOR: Record<(typeof ALARM_SHOW)[number], AlarmState[] | undefined> = {
  active: ["active_unacked", "active_acked", "rtn_unacked"],
  unacked: ["active_unacked", "rtn_unacked"],
  shelved: ["shelved"],
  suppressed: ["suppressed", "out_of_service"],
  all: ["active_unacked", "active_acked", "rtn_unacked", "cleared", "shelved", "suppressed", "out_of_service"],
};
