/**
 * Always-visible alarm counts per priority (ISA-18.2). Fetched once, then kept current by
 * live alarm_summary messages. Clicking a count opens the alarm list.
 */
import { useAlarmSummary } from "@pdm/api-client";
import { AlarmPriority } from "@pdm/contracts";
import { PriorityIcon, Skeleton, cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { useGlobalSearch } from "../../shared/time-range";

// Written out in full: Tailwind only generates classes it can find as complete words in the code.
const DOT = { p1: "bg-alarm-p1", p2: "bg-alarm-p2", p3: "bg-alarm-p3", p4: "bg-alarm-p4" } as const;

export function AlarmBar() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const { data: summary, isPending } = useAlarmSummary(scopeId);

  return (
    <section aria-label={t("alarms.barLabel")} className="flex h-10 shrink-0 items-center gap-1 overflow-x-auto border-b border-line bg-surface px-3 text-sm">
      {isPending || !summary ? (
        <span className="flex gap-3" aria-label={t("alarms.loading")}>
          {AlarmPriority.options.map((p) => (
            <Skeleton key={p} className="h-5 w-16" />
          ))}
        </span>
      ) : (
        <>
          {AlarmPriority.options.map((p) => {
            const active = summary.active[p];
            const unacked = summary.unacknowledged[p];
            return (
              <Link
                key={p}
                to="/alarms"
                // Opens the list filtered to this priority, keeping scope and time range.
                search={(prev) => ({ ...prev, view: "list", show: "active", priority: p })}
                aria-label={t("alarms.countLabel", { priority: t(`alarms.priority.${p}`), active, unacked })}
                className={cx(
                  "flex items-center gap-1.5 rounded-md px-2 py-1 hover:bg-sunken",
                  active === 0 && "text-fg-muted",
                  unacked > 0 && "font-semibold",
                )}
              >
                <PriorityIcon priority={p} className={cx(active === 0 && "opacity-40")} />
                <span>{p.toUpperCase()}</span>
                <span className="tabular-nums">{active}</span>
                {unacked > 0 && (
                  // Unacknowledged = needs an operator. A dot, plus the pulse unless reduced motion is on.
                  <span aria-hidden className={cx("size-1.5 rounded-full motion-safe:animate-pulse", DOT[p])} />
                )}
              </Link>
            );
          })}
          <span aria-hidden className="mx-2 h-5 w-px bg-line" />
          <span className="whitespace-nowrap px-2 text-fg-muted">{t("alarms.shelved", { count: summary.shelved })}</span>
          <span className="whitespace-nowrap px-2 text-fg-muted">{t("alarms.suppressed", { count: summary.suppressed })}</span>
        </>
      )}
    </section>
  );
}
