/** Number formats for the reliability screens. */
import { formatNumber } from "../../shared/format";

type T = (key: string, options?: Record<string, unknown>) => string;

/** Hours as hours when short ("6.5 h"), as days when long ("910 days"): MTBF reads better in days. */
export function formatDuration(hours: number | null, t: T): string {
  if (hours === null) return "—";
  if (hours < 48) return t("reliability.hours", { value: formatNumber(hours, 1) });
  return t("reliability.days", { value: formatNumber(hours / 24) });
}

/** ISO 14224 cause codes are "2.4"; the text catalog keys are "2_4". */
export const causeKey = (code: string) => `iso14224.cause.${code.replace(".", "_")}`;
