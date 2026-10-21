/**
 * A tag's live value in the user's units, flagged when beyond a limit and greyed when stale.
 * Subscribes while on screen; unsubscribes when it leaves (ADR-0005).
 */
import { useLiveValue, useSimulationSelector } from "@pdm/api-client";
import { STALE_AFTER_MS, type Tag } from "@pdm/contracts";
import { HealthBadge, Skeleton, cx } from "@pdm/ui";
import { Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../shared/preferences";
import { formatMeasurement, toDisplay } from "../../shared/units";
import { LIMIT_HEALTH, limitLevel } from "./limits";

export function LiveTagValue({ tag, className }: { tag: Tag; className?: string }) {
  const { t } = useTranslation();
  const live = useLiveValue(tag.id);
  const units = usePreferences((p) => p.units);
  // Staleness is judged in simulated time, so the threshold scales with the simulation speed.
  // Reading only the yes/no answer means the tile re-renders when it *becomes* stale, not
  // every second with the clock (that doubled the work with 300 tiles on screen).
  const stale = useSimulationSelector((s) =>
    s && live ? Date.parse(s.simTime) - Date.parse(live.t) > STALE_AFTER_MS * Math.max(1, s.speed) : false,
  );

  if (!live) return <Skeleton className="inline-block h-4 w-16" />;

  const shown = toDisplay(live.value, tag.quantity, units);
  const level = limitLevel(live.value, tag.limits);
  const symbol = t(`unitSymbol.${shown.unit}`);

  return (
    <span className={cx("inline-flex items-center gap-1.5 tabular-nums", stale && "text-fg-muted", className)}>
      {level && <HealthBadge compact state={LIMIT_HEALTH[level]} label={t(`telemetry.limit.${level}`)} />}
      <span className={cx("font-medium", live.quality !== "good" && "italic")}>
        {formatMeasurement(shown.value)}
        {symbol && <span className="ml-1 font-normal text-fg-muted">{symbol}</span>}
      </span>
      {stale && (
        <span title={t("telemetry.stale")} className="inline-flex">
          <Clock aria-hidden className="size-3.5" />
          <span className="sr-only">{t("telemetry.stale")}</span>
        </span>
      )}
      {live.quality !== "good" && <span className="text-xs text-health-warning">{t(`telemetry.quality.${live.quality}`)}</span>}
    </span>
  );
}
