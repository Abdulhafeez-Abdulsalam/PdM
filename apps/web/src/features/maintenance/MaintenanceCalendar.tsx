/**
 * Calendar view of maintenance (spec §6.6: "Kanban, list, calendar and Gantt views"): when
 * work is planned to start, a month at a time. A real table on wide screens; on a phone, a
 * list of the days that have work. Unscheduled work isn't on a calendar; the schedule board's
 * tray holds it.
 */
import { useApiQuery } from "@pdm/api-client";
import type { WorkOrder } from "@pdm/contracts";
import { Button, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useSimNow } from "../../shared/sim-time";
import { PriorityLabel } from "./PriorityLabel";
import { DAY_MS, dayKey, dayStart, monthWeeks } from "./schedule";

const SHOWN_PER_DAY = 3;
const monthName = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
const weekdayName = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const fullDay = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const timeOfDay = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/** "2026-10" → [2026, 9] (JavaScript months count from 0). */
function parseMonth(month: string | undefined, now: number): [number, number] {
  const match = month ? /^(\d{4})-(\d{2})$/.exec(month) : null;
  if (match) return [Number(match[1]), Number(match[2]) - 1];
  const d = new Date(now);
  return [d.getUTCFullYear(), d.getUTCMonth()];
}
const monthKey = (year: number, month: number) => new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7);

export function MaintenanceCalendar({
  scopeId,
  assigneeId,
  month,
  onMonth,
}: {
  scopeId: string;
  assigneeId?: string;
  month?: string;
  onMonth: (month: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { now } = useSimNow();
  const [year, m] = parseMonth(month, now);
  const weeks = monthWeeks(year, m);
  const first = weeks[0]![0]!;
  const last = weeks.at(-1)!.at(-1)!;
  const today = dayStart(now);
  const orders = useApiQuery(
    "workOrders.list",
    {
      scopeId,
      assigneeId,
      status: ["scheduled", "approved", "in_progress", "completed", "verified", "closed"],
      scheduledFrom: new Date(first).toISOString(),
      scheduledTo: new Date(last + DAY_MS).toISOString(),
      sort: "start",
      limit: 500,
    },
    { placeholderData: keepPreviousData },
  );
  const byDay = new Map<string, WorkOrder[]>();
  for (const wo of orders.data?.items ?? []) {
    const key = dayKey(Date.parse(wo.scheduledStart!));
    byDay.set(key, [...(byDay.get(key) ?? []), wo]);
  }
  const title = monthName.format(Date.UTC(year, m, 1));
  const isThisMonth = monthKey(year, m) === monthKey(...parseMonth(undefined, now));

  return (
    <section aria-label={t("calendar.label", { month: title })} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => onMonth(monthKey(year, m - 1))} aria-label={t("calendar.previous")}>
          <ChevronLeft aria-hidden className="size-4" />
        </Button>
        <h2 className="min-w-40 text-center text-lg font-semibold" aria-live="polite">
          {title}
        </h2>
        <Button size="sm" onClick={() => onMonth(monthKey(year, m + 1))} aria-label={t("calendar.next")}>
          <ChevronRight aria-hidden className="size-4" />
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onMonth(undefined)} disabled={isThisMonth}>
          {t("calendar.thisMonth")}
        </Button>
        <span className="text-xs text-fg-muted">{t("calendar.utc")}</span>
      </div>

      {orders.isPending ? (
        <Skeleton className="h-[32rem]" />
      ) : (
        <div className={cx("transition-opacity", orders.isPlaceholderData && "opacity-60")}>
          {/* Wide screens: the month as a table. */}
          <table className="hidden w-full table-fixed border-collapse text-sm md:table">
            <caption className="sr-only">{t("calendar.caption", { month: title })}</caption>
            <thead>
              <tr>
                {weeks[0]!.map((d) => (
                  <th key={d} scope="col" className="pb-1 text-left text-xs font-medium text-fg-muted">
                    {weekdayName.format(d)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weeks.map((week) => (
                <tr key={week[0]}>
                  {week.map((d) => (
                    <DayCell
                      key={d}
                      day={d}
                      inMonth={new Date(d).getUTCMonth() === m}
                      today={d === today}
                      orders={byDay.get(dayKey(d)) ?? []}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          {/* Phones: just the days that have work. */}
          <ol className="flex flex-col gap-3 md:hidden">
            {weeks.flat().filter((d) => new Date(d).getUTCMonth() === m && byDay.has(dayKey(d))).length === 0 && (
              <li className="text-sm text-fg-muted">{t("calendar.nothing")}</li>
            )}
            {weeks
              .flat()
              .filter((d) => new Date(d).getUTCMonth() === m && byDay.has(dayKey(d)))
              .map((d) => (
                <li key={d}>
                  <h3 className={cx("mb-1 text-sm font-semibold", d === today && "text-accent")}>{fullDay.format(d)}</h3>
                  <ul className="flex flex-col gap-1">
                    {byDay.get(dayKey(d))!.map((wo) => (
                      <li key={wo.id}>
                        <Chip wo={wo} />
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
          </ol>
        </div>
      )}
    </section>
  );
}

function DayCell({ day, inMonth, today, orders }: { day: number; inMonth: boolean; today: boolean; orders: readonly WorkOrder[] }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? orders : orders.slice(0, SHOWN_PER_DAY);
  const date = new Date(day).getUTCDate();
  return (
    <td
      className={cx("h-28 border border-line p-1 align-top", inMonth ? "bg-surface" : "bg-sunken")}
      aria-current={today ? "date" : undefined}
    >
      <div
        className={cx(
          "mb-1 flex size-6 items-center justify-center rounded-full text-xs",
          today && "bg-accent font-semibold text-accent-fg",
          !inMonth && "text-fg-muted",
        )}
      >
        <span aria-hidden>{date}</span>
        <span className="sr-only">{fullDay.format(day)}</span>
      </div>
      {orders.length > 0 && (
        <ul className="flex flex-col gap-0.5">
          {shown.map((wo) => (
            <li key={wo.id}>
              <Chip wo={wo} compact />
            </li>
          ))}
        </ul>
      )}
      {orders.length > SHOWN_PER_DAY && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-0.5 rounded px-1 text-xs text-accent hover:bg-sunken"
          aria-expanded={expanded}
        >
          {expanded ? t("calendar.showLess") : t("calendar.more", { count: orders.length - SHOWN_PER_DAY })}
        </button>
      )}
    </td>
  );
}

function Chip({ wo, compact }: { wo: WorkOrder; compact?: boolean }) {
  const { t } = useTranslation();
  const start = Date.parse(wo.scheduledStart!);
  const done = ["completed", "verified", "closed"].includes(wo.status);
  return (
    <Link
      to="/maintenance/$workOrderId"
      params={{ workOrderId: wo.id }}
      search={(prev) => prev}
      title={`${wo.number} · ${wo.title}`}
      className={cx(
        "flex items-center gap-1 rounded border border-line px-1 py-0.5 text-xs hover:bg-sunken",
        done && "text-fg-muted line-through decoration-fg-muted",
        compact ? "truncate" : "bg-surface p-2 text-sm",
      )}
    >
      <PriorityLabel priority={wo.priority} iconOnly />
      <span className="tabular-nums">{timeOfDay.format(start)}</span>
      <span className="truncate">
        <span className="font-mono">{wo.number}</span> {wo.title}
      </span>
      {done && <span className="sr-only">({t(`workOrders.statuses.${wo.status}`)})</span>}
    </Link>
  );
}
