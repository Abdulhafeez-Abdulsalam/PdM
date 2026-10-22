import { INSPECTION_SOON_DAYS, type GasTurbineRow } from "@pdm/contracts";
import { cx } from "@pdm/ui";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../shared/format";
import { useSimNow } from "../../shared/sim-time";

/** "Hot gas path in 1,367 EOH, about 4 Dec 2026", flagged when it's close. */
export function InspectionCell({ eoh }: { eoh: GasTurbineRow["eoh"] }) {
  const { t } = useTranslation();
  const { now } = useSimNow();
  const days = eoh.nextDueAt ? (Date.parse(eoh.nextDueAt) - now) / 86_400_000 : null;
  const soon = days !== null && days <= INSPECTION_SOON_DAYS;
  return (
    <span className="text-xs">
      <span className="block">
        {t(`power.inspection.${eoh.nextType}`)} {t("power.inEoh", { eoh: eoh.remaining.toLocaleString("en-US") })}
      </span>
      <span className={cx("flex items-center gap-1", soon ? "text-health-warning" : "text-fg-muted")}>
        {soon && <AlertTriangle aria-hidden className="size-3.5" />}
        {eoh.nextDueAt ? t(soon ? "power.dueSoon" : "power.dueAbout", { date: formatDate(eoh.nextDueAt) }) : t("power.notAccumulating")}
      </span>
    </span>
  );
}
