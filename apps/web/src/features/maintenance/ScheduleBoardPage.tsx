/**
 * Schedule board (spec §6.6: "drag-and-drop schedule board with resource constraints …
 * conflict detection"). Technicians down the side, one or two weeks across; each job is a bar as
 * long as its estimated hours (8 working hours a day). A day where someone is booked for more
 * than a working day is a conflict and is flagged in words, not just colour.
 *
 * Planners drag bars to another day or person, or drag planned work in from the
 * "Unscheduled" tray. Every drag has a keyboard route: "Reschedule…" and "Schedule…" open
 * the same dialog. Everyone else sees the board read-only.
 */
import { useApiQuery } from "@pdm/api-client";
import { WORKDAY_HOURS, type User, type WorkOrder } from "@pdm/contracts";
import { Button, Skeleton, cx } from "@pdm/ui";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { CalendarClock, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, GripVertical, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatDate } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { canDo } from "../../shared/roles/roles";
import { useSimNow } from "../../shared/sim-time";
import { useGlobalSearch } from "../../shared/time-range";
import { useUsers } from "../../shared/users";
import { PriorityLabel } from "./PriorityLabel";
import { DAY_MS, assignLanes, bookedHours, boardDays, dayKey, dayStart, overbooked, placeBar, startOnDay } from "./schedule";
import { useWorkOrderActions } from "./use-work-order-actions";
import { WorkOrderDialogs, type WorkOrderDialog } from "./WorkOrderDialogs";

const SPANS = { week: 7, "2weeks": 14 } as const;
type Span = keyof typeof SPANS;
const searchSchema = z.object({
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .catch(undefined),
  span: z.enum(["week", "2weeks"]).catch("week"),
});

const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const timeOfDay = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export function ScheduleBoardPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const navigate = useNavigate();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const { now } = useSimNow();
  const role = usePreferences((p) => p.role);
  const canSchedule = canDo(role, "workOrder.schedule");
  const { technicians } = useUsers();
  const { transition, reschedule } = useWorkOrderActions();
  const [dialog, setDialog] = useState<WorkOrderDialog>(null);

  const today = dayStart(now);
  const first = search.from ? Date.parse(`${search.from}T00:00:00Z`) : today;
  const count = SPANS[search.span];
  const days = useMemo(() => boardDays(first, count), [first, count]);
  const goTo = (from: number | undefined) =>
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({ ...prev, from: from === undefined ? undefined : dayKey(from) }),
    });
  const setSpan = (span: Span) => void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, span }) });

  // Jobs that started up to 10 days before the board still show if they run into it.
  const orders = useApiQuery(
    "workOrders.list",
    {
      scopeId,
      status: ["scheduled", "approved", "in_progress"],
      scheduledFrom: new Date(days[0]! - 10 * DAY_MS).toISOString(),
      scheduledTo: new Date(days.at(-1)! + DAY_MS).toISOString(),
      sort: "start",
      limit: 500,
    },
    { placeholderData: keepPreviousData },
  );
  const unscheduled = useApiQuery("workOrders.list", { scopeId, status: ["planned"], sort: "priority", limit: 100 });

  useEffect(() => {
    document.title = `${t("schedule.title")} · ${t("app.name")}`;
  }, [t]);

  // Rows: every technician, with their jobs, booked hours per day and conflicts.
  const rows = useMemo(
    () =>
      technicians.map((tech) => {
        const jobs = (orders.data?.items ?? []).filter((w) => w.assigneeId === tech.id);
        const booked = bookedHours(jobs, days);
        return { tech, jobs, booked, conflicts: overbooked(booked) };
      }),
    [technicians, orders.data, days],
  );
  const conflicts = rows.flatMap((r) => r.conflicts.map((c) => ({ tech: r.tech, day: days[c]!, hours: r.booked[c]! })));

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor));
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    const wo = (active.data.current as { wo?: WorkOrder } | undefined)?.wo;
    if (!wo || !over) return;
    const [assigneeId, column] = String(over.id).split("|");
    const day = days[Number(column)];
    if (!assigneeId || day === undefined) return;
    if (wo.status === "planned") {
      transition.mutate({ workOrderId: wo.id, to: "scheduled", scheduledStart: startOnDay(day, null), assigneeId });
      return;
    }
    const start = startOnDay(day, wo.scheduledStart);
    if (start === new Date(Date.parse(wo.scheduledStart ?? "")).toISOString() && assigneeId === wo.assigneeId) return; // dropped where it was
    reschedule.mutate({ workOrderId: wo.id, scheduledStart: start, assigneeId });
  };

  const rangeLabel = t("schedule.range", {
    from: formatDate(new Date(days[0]!).toISOString()),
    to: formatDate(new Date(days.at(-1)!).toISOString()),
  });

  return (
    <div className="mx-auto flex max-w-[1900px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <Link to="/maintenance" search={(prev) => prev} className="text-sm text-accent hover:underline">
            ← {t("modules.maintenance.name")}
          </Link>
          <h1 className="text-2xl font-semibold">{t("schedule.title")}</h1>
          <p className="text-fg-muted">{t(canSchedule ? "schedule.introPlanner" : "schedule.introViewer")}</p>
        </div>
        <nav aria-label={t("schedule.navigate")} className="flex items-center gap-2">
          <div role="tablist" aria-label={t("schedule.spanLabel")} className="flex rounded-md border border-line p-0.5">
            {(Object.keys(SPANS) as Span[]).map((sp) => (
              <button
                key={sp}
                type="button"
                role="tab"
                aria-selected={search.span === sp}
                onClick={() => setSpan(sp)}
                className={cx("rounded px-3 py-1 text-sm", search.span === sp ? "bg-sunken font-semibold" : "text-fg-muted hover:text-fg")}
              >
                {t(`schedule.span.${sp}`)}
              </button>
            ))}
          </div>
          <Button size="sm" onClick={() => goTo(days[0]! - count * DAY_MS)} aria-label={t(`schedule.previous.${search.span}`)}>
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <span className="text-sm tabular-nums" aria-live="polite">
            {rangeLabel}
          </span>
          <Button size="sm" onClick={() => goTo(days[0]! + count * DAY_MS)} aria-label={t(`schedule.next.${search.span}`)}>
            <ChevronRight aria-hidden className="size-4" />
          </Button>
          <Button size="sm" variant="ghost" onClick={() => goTo(undefined)} disabled={first === today}>
            {t("schedule.today")}
          </Button>
        </nav>
      </header>

      {conflicts.length > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-lg border border-health-warning p-3 text-sm">
          <TriangleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-health-warning" />
          <div>
            <p className="font-semibold">{t("schedule.conflicts", { count: conflicts.length, hours: WORKDAY_HOURS })}</p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-fg-muted">
              {conflicts.slice(0, 8).map((c) => (
                <li key={`${c.tech.id}${c.day}`}>
                  {t("schedule.conflictItem", { name: c.tech.name, day: weekday.format(c.day), hours: c.hours })}
                </li>
              ))}
              {conflicts.length > 8 && <li>{t("schedule.andMore", { count: conflicts.length - 8 })}</li>}
            </ul>
          </div>
        </div>
      )}

      <DndContext
        sensors={sensors}
        onDragEnd={onDragEnd}
        accessibility={{
          screenReaderInstructions: { draggable: t("schedule.srInstructions") },
          announcements: {
            onDragStart: ({ active }) => t("board.announce.start", { id: String(active.id) }),
            onDragOver: ({ over }) => (over ? t("schedule.announceOver", cellWords(String(over.id), rows, days)) : undefined),
            onDragEnd: ({ over }) =>
              over ? t("schedule.announceEnd", cellWords(String(over.id), rows, days)) : t("board.announce.cancel"),
            onDragCancel: () => t("board.announce.cancel"),
          },
        }}
      >
        <div className="grid grid-cols-1 gap-4 2xl:grid-cols-[1fr_20rem]">
          <section
            aria-label={t("schedule.boardLabel", { range: rangeLabel })}
            className="relative overflow-x-auto rounded-lg border border-line bg-surface"
          >
            {orders.isPending ? (
              <Skeleton className="m-4 h-96" />
            ) : (
              <div
                className={cx(
                  "transition-opacity",
                  count > 7 ? "min-w-[1500px]" : "min-w-[900px]",
                  orders.isPlaceholderData && "opacity-60",
                )}
              >
                <DayHeader days={days} today={today} />
                {rows.map((row) => (
                  <TechRow
                    key={row.tech.id}
                    {...row}
                    days={days}
                    canSchedule={canSchedule}
                    onReschedule={(wo) => setDialog({ kind: "schedule", workOrder: wo })}
                  />
                ))}
              </div>
            )}
          </section>
          <Tray
            orders={unscheduled.data?.items ?? []}
            pending={unscheduled.isPending}
            canSchedule={canSchedule}
            onSchedule={(wo) => setDialog({ kind: "schedule", workOrder: wo })}
          />
        </div>
      </DndContext>
      <WorkOrderDialogs dialog={dialog} onClose={() => setDialog(null)} />
    </div>
  );
}

/** "Hassan Bello, Tue 14 Oct" for screen-reader announcements while dragging. */
function cellWords(id: string, rows: readonly { tech: User }[], days: readonly number[]) {
  const [techId, column] = id.split("|");
  return { name: rows.find((r) => r.tech.id === techId)?.tech.name ?? "", day: weekday.format(days[Number(column)] ?? 0) };
}

/** Name column + one column per day, shared by the header and every row. */
const gridTemplate = (days: number) => ({ gridTemplateColumns: `12rem repeat(${days}, minmax(0, 1fr))` });

function DayHeader({ days, today }: { days: readonly number[]; today: number }) {
  const { t } = useTranslation();
  return (
    <div className="sticky top-0 z-10 grid border-b border-line bg-surface text-xs" style={gridTemplate(days.length)}>
      <div className="px-3 py-2 font-medium text-fg-muted">{t("schedule.technician")}</div>
      {days.map((d) => (
        <div key={d} className={cx("border-l border-line px-2 py-2 text-center", d === today && "bg-sunken font-semibold")}>
          {weekday.format(d)}
          {d === today && <span className="block text-[0.7rem] text-accent">{t("schedule.todayMark")}</span>}
        </div>
      ))}
    </div>
  );
}

function TechRow({
  tech,
  jobs,
  booked,
  conflicts,
  days,
  canSchedule,
  onReschedule,
}: {
  tech: User;
  jobs: readonly WorkOrder[];
  booked: readonly number[];
  conflicts: readonly number[];
  days: readonly number[];
  canSchedule: boolean;
  onReschedule: (wo: WorkOrder) => void;
}) {
  const { t } = useTranslation();
  const placed = assignLanes(jobs.flatMap((wo) => placeBar(wo, days) ?? []));
  const lanes = Math.max(1, ...placed.map((p) => p.lane + 1));
  const label = [
    t("schedule.rowLabel", { name: tech.name, count: placed.length }),
    conflicts.length > 0 && t("schedule.overbookedDays", { count: conflicts.length }),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section
      aria-label={label}
      className="grid border-b border-line last:border-0"
      style={{ ...gridTemplate(days.length), gridTemplateRows: `repeat(${lanes}, 3.25rem) 1.5rem` }}
    >
      <div className="flex flex-col justify-center px-3 py-1 text-sm" style={{ gridColumn: 1, gridRow: `1 / span ${lanes + 1}` }}>
        <span className="font-medium">{tech.name}</span>
        {conflicts.length > 0 && (
          <span className="flex items-center gap-1 text-xs font-medium text-health-warning">
            <TriangleAlert aria-hidden className="size-3" />
            {t("schedule.overbookedDays", { count: conflicts.length })}
          </span>
        )}
      </div>
      {days.map((day, i) => (
        <DayCell
          key={day}
          id={`${tech.id}|${i}`}
          column={i}
          lanes={lanes}
          hours={booked[i]!}
          over={conflicts.includes(i)}
          disabled={!canSchedule}
        />
      ))}
      {/* role="list" isn't redundant here: "display: contents" makes some browsers forget this is a list. */}
      {/* eslint-disable-next-line jsx-a11y/no-redundant-roles */}
      <ul role="list" className="contents">
        {placed.map(({ bar, lane }) => (
          <li
            key={bar.wo.id}
            className="relative z-[1] min-w-0 px-0.5 py-1"
            style={{ gridColumn: `${bar.column + 2} / span ${bar.span}`, gridRow: lane + 1 }}
          >
            <JobBar
              wo={bar.wo}
              continuesBefore={bar.continuesBefore}
              continuesAfter={bar.continuesAfter}
              movable={canSchedule && (bar.wo.status === "scheduled" || bar.wo.status === "approved")}
              onReschedule={() => onReschedule(bar.wo)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** One technician-day: a drop target, with the hours booked shown underneath. */
function DayCell({
  id,
  column,
  lanes,
  hours,
  over,
  disabled,
}: {
  id: string;
  column: number;
  lanes: number;
  hours: number;
  over: boolean;
  disabled: boolean;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id, disabled });
  return (
    <div
      ref={setNodeRef}
      className={cx(
        "flex items-end justify-center border-l border-line pb-0.5 text-[0.7rem] tabular-nums",
        isOver && "bg-sunken ring-2 ring-accent ring-inset",
      )}
      style={{ gridColumn: column + 2, gridRow: `1 / span ${lanes + 1}` }}
    >
      {hours > 0 && (
        <span className={cx(over ? "flex items-center gap-0.5 font-semibold text-health-warning" : "text-fg-muted")}>
          {over && <TriangleAlert aria-hidden className="size-3" />}
          {t("schedule.booked", { hours, max: WORKDAY_HOURS })}
        </span>
      )}
    </div>
  );
}

function JobBar({
  wo,
  continuesBefore,
  continuesAfter,
  movable,
  onReschedule,
}: {
  wo: WorkOrder;
  continuesBefore: boolean;
  continuesAfter: boolean;
  movable: boolean;
  onReschedule: () => void;
}) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: wo.id, data: { wo }, disabled: !movable });
  const start = Date.parse(wo.scheduledStart!);
  const when = `${weekday.format(start)} ${timeOfDay.format(start)}`;
  const status = wo.status !== "scheduled" ? t(`workOrders.statuses.${wo.status}`) : null;
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cx(
        "flex h-full items-center gap-1 overflow-hidden border border-line bg-raised px-1.5 text-xs shadow-1",
        continuesBefore ? "rounded-l-none" : "rounded-l-md",
        continuesAfter ? "rounded-r-none" : "rounded-r-md",
        wo.status === "in_progress" && "border-accent",
        isDragging && "relative z-20 opacity-80 shadow-2",
      )}
    >
      {continuesBefore && <ChevronsLeft aria-hidden className="size-3 shrink-0 text-fg-muted" />}
      {movable && (
        <button
          type="button"
          {...listeners}
          {...attributes}
          aria-label={t("board.dragHandle", { number: wo.number })}
          className="cursor-grab rounded text-fg-muted hover:bg-sunken"
        >
          <GripVertical aria-hidden className="size-3.5" />
        </button>
      )}
      <Link
        to="/maintenance/$workOrderId"
        params={{ workOrderId: wo.id }}
        search={(prev) => prev}
        className="min-w-0 flex-1 leading-tight hover:underline"
        title={`${wo.number} · ${wo.title} · ${when} · ${wo.estimatedHours} h`}
      >
        {/* The {" "} are real spaces, so the text reads "WO-10362 03:10 …" rather than
            "WO-1036203:10…" (a flex layout doesn't draw them). */}
        <span className="flex items-center gap-1 text-[0.7rem] text-fg-muted">
          <span className="font-mono whitespace-nowrap">{wo.number}</span> <span className="tabular-nums">{timeOfDay.format(start)}</span>
          {status && (
            <>
              {" "}
              <span className="truncate rounded border border-line px-1">{status}</span>
            </>
          )}
        </span>{" "}
        <span className="block truncate">{wo.title}</span>
        {/* The link's name is its own text (so voice control matches what's on screen), plus
            the day and length, which the bar only shows by its position and width. */}
        <span className="sr-only">{t("schedule.barExtra", { day: weekday.format(start), hours: wo.estimatedHours })}</span>
      </Link>
      {continuesAfter && <ChevronsRight aria-hidden className="size-3 shrink-0 text-fg-muted" />}
      {movable && (
        <button
          type="button"
          onClick={onReschedule}
          className="shrink-0 rounded p-0.5 text-fg-muted hover:bg-sunken"
          aria-label={t("schedule.rescheduleOne", { number: wo.number })}
          title={t("schedule.reschedule")}
        >
          <CalendarClock aria-hidden className="size-3.5" />
        </button>
      )}
    </div>
  );
}

/** Planned work that has no date yet: drag it onto the board, or use "Schedule…". */
function Tray({
  orders,
  pending,
  canSchedule,
  onSchedule,
}: {
  orders: readonly WorkOrder[];
  pending: boolean;
  canSchedule: boolean;
  onSchedule: (wo: WorkOrder) => void;
}) {
  const { t } = useTranslation();
  return (
    <section
      aria-label={t("schedule.trayLabel", { count: orders.length })}
      className="flex flex-col rounded-lg border border-line bg-sunken"
    >
      <h2 className="flex items-center justify-between px-3 py-2 text-sm font-semibold">
        {t("schedule.tray")}
        <span className="rounded-full bg-surface px-2 text-xs font-normal text-fg-muted">{orders.length}</span>
      </h2>
      <p className="px-3 pb-2 text-xs text-fg-muted">{t(canSchedule ? "schedule.trayHint" : "schedule.trayHintViewer")}</p>
      {pending ? (
        <Skeleton className="m-2 h-40" />
      ) : orders.length === 0 ? (
        <p className="p-3 text-sm text-fg-muted">{t("schedule.trayEmpty")}</p>
      ) : (
        <ul className="flex max-h-[70vh] flex-col gap-2 overflow-y-auto p-2 pt-0">
          {orders.map((wo) => (
            <TrayCard key={wo.id} wo={wo} canSchedule={canSchedule} onSchedule={() => onSchedule(wo)} />
          ))}
        </ul>
      )}
    </section>
  );
}

function TrayCard({ wo, canSchedule, onSchedule }: { wo: WorkOrder; canSchedule: boolean; onSchedule: () => void }) {
  const { t } = useTranslation();
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: wo.id, data: { wo }, disabled: !canSchedule });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      aria-label={t("board.cardLabel", { number: wo.number, title: wo.title })}
      className={cx(
        "flex flex-col gap-1 rounded-md border border-line bg-surface p-2 text-sm",
        isDragging && "relative z-20 opacity-80 shadow-2",
      )}
    >
      <div className="flex items-center gap-1.5 text-xs text-fg-muted">
        {canSchedule && (
          <button
            type="button"
            {...listeners}
            {...attributes}
            aria-label={t("board.dragHandle", { number: wo.number })}
            className="-ml-1 cursor-grab rounded p-0.5 hover:bg-sunken"
          >
            <GripVertical aria-hidden className="size-4" />
          </button>
        )}
        <span className="font-mono">{wo.number}</span>
        <PriorityLabel priority={wo.priority} className="ml-auto" />
      </div>
      <Link
        to="/maintenance/$workOrderId"
        params={{ workOrderId: wo.id }}
        search={(prev) => prev}
        className="leading-snug font-medium hover:underline"
      >
        {wo.title}
      </Link>
      <Meta>
        <span className="font-mono">{wo.assetId}</span>
        <span>{t("schedule.hours", { hours: wo.estimatedHours })}</span>
        {wo.dueAt && <span>{t("field.due", { date: formatDate(wo.dueAt) })}</span>}
      </Meta>
      {canSchedule && (
        <Button size="sm" className="self-start" onClick={onSchedule}>
          {t("board.moveLabel.scheduled")}
        </Button>
      )}
    </li>
  );
}

const Meta = ({ children }: { children: ReactNode }) => <div className="flex flex-wrap gap-x-3 text-xs text-fg-muted">{children}</div>;
