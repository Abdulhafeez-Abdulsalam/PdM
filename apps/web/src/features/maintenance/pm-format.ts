/** How PM plans read on screen: their names and how often they come round. */
import type { PmPlanSummary } from "@pdm/contracts";
import type { TFunction } from "i18next";
import { formatNumber } from "../../shared/format";

export function planTitle(p: Pick<PmPlanSummary, "task" | "mode">, t: TFunction): string {
  return t(`pm.title.${p.task}`, { mode: t(`iso14224.mode.${p.mode}`) });
}

export function triggerText(p: Pick<PmPlanSummary, "trigger">, t: TFunction): string {
  return p.trigger.kind === "calendar"
    ? t("pm.trigger.calendar", { count: p.trigger.days })
    : t("pm.trigger.running_hours", { hours: formatNumber(p.trigger.hours), days: formatNumber(p.trigger.typicalDays) });
}

export function pct(v: number | null): string {
  return v === null ? "—" : `${formatNumber(v, 1)} %`;
}
