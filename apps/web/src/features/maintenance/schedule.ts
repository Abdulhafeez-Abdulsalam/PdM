/**
 * The arithmetic behind the schedule board and calendar, kept apart from React so it can be
 * tested on its own. All days are UTC days, like the rest of the app's site times.
 *
 * A job fills a technician's working day (WORKDAY_HOURS) and continues the next day:
 * a 20-hour job that starts Monday books 8 + 8 + 4 hours, Monday to Wednesday.
 */
import { WORKDAY_HOURS, type WorkOrder } from "@pdm/contracts";

export const DAY_MS = 86_400_000;

/** Midnight UTC of the day `ms` falls in. */
export const dayStart = (ms: number) => Math.floor(ms / DAY_MS) * DAY_MS;

/** "2026-10-14" for a timestamp (UTC). */
export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** `count` consecutive day starts, beginning with the day `from` falls in. */
export function boardDays(from: number, count: number): number[] {
  const first = dayStart(from);
  return Array.from({ length: count }, (_, i) => first + i * DAY_MS);
}

/** How many days a job covers, at WORKDAY_HOURS a day. */
export const spanDays = (hours: number) => Math.max(1, Math.ceil(hours / WORKDAY_HOURS));

/** Hours booked on each day of the job, e.g. 20 h → [8, 8, 4]. */
export function hoursPerDay(hours: number): number[] {
  return Array.from({ length: spanDays(hours) }, (_, i) => Math.min(WORKDAY_HOURS, hours - i * WORKDAY_HOURS));
}

export interface Bar {
  wo: WorkOrder;
  /** Column of the first visible day (0 = first board day). */
  column: number;
  /** Visible days covered. */
  span: number;
  /** The job started before the board's first day, or carries on after its last. */
  continuesBefore: boolean;
  continuesAfter: boolean;
}

/** Where a job sits on a board of `days`, or null if it's entirely outside it (or unscheduled). */
export function placeBar(wo: WorkOrder, days: readonly number[]): Bar | null {
  if (!wo.scheduledStart || days.length === 0) return null;
  const startDay = dayStart(Date.parse(wo.scheduledStart));
  const first = days[0]!;
  const startColumn = Math.round((startDay - first) / DAY_MS);
  const endColumn = startColumn + spanDays(wo.estimatedHours) - 1;
  if (endColumn < 0 || startColumn > days.length - 1) return null;
  const column = Math.max(0, startColumn);
  const last = Math.min(days.length - 1, endColumn);
  return { wo, column, span: last - column + 1, continuesBefore: startColumn < 0, continuesAfter: endColumn > days.length - 1 };
}

/** Puts overlapping bars on separate lines (lanes), first free lane first, in start order. */
export function assignLanes(bars: readonly Bar[]): { bar: Bar; lane: number }[] {
  const laneEnds: number[] = []; // last column used in each lane
  return [...bars]
    .sort((a, b) => a.column - b.column || (a.wo.scheduledStart ?? "").localeCompare(b.wo.scheduledStart ?? ""))
    .map((bar) => {
      let lane = laneEnds.findIndex((end) => end < bar.column);
      if (lane === -1) lane = laneEnds.push(0) - 1;
      laneEnds[lane] = bar.column + bar.span - 1;
      return { bar, lane };
    });
}

/** Hours booked per board day for one technician's jobs. */
export function bookedHours(orders: readonly WorkOrder[], days: readonly number[]): number[] {
  const booked = days.map(() => 0);
  if (days.length === 0) return booked;
  for (const wo of orders) {
    if (!wo.scheduledStart) continue;
    const startColumn = Math.round((dayStart(Date.parse(wo.scheduledStart)) - days[0]!) / DAY_MS);
    hoursPerDay(wo.estimatedHours).forEach((h, i) => {
      const column = startColumn + i;
      if (column >= 0 && column < booked.length) booked[column]! += h;
    });
  }
  return booked;
}

/** Days (columns) where someone is booked for more than a working day: the board's conflicts. */
export const overbooked = (booked: readonly number[]) => booked.flatMap((h, i) => (h > WORKDAY_HOURS ? [i] : []));

/**
 * Moving a job to another day keeps its time of day (a 13:00 start stays at 13:00).
 * Unscheduled work dropped on a day starts at 07:00.
 */
export function startOnDay(day: number, previousStart: string | null): string {
  const timeOfDay = previousStart ? Date.parse(previousStart) - dayStart(Date.parse(previousStart)) : 7 * 3_600_000;
  return new Date(day + timeOfDay).toISOString();
}

/** The weeks of a calendar month as rows of 7 day starts (Monday first), padded with the neighbouring months' days. */
export function monthWeeks(year: number, month: number): number[][] {
  const first = Date.UTC(year, month, 1);
  const mondayOffset = (new Date(first).getUTCDay() + 6) % 7;
  const gridStart = first - mondayOffset * DAY_MS;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const weeks = Math.ceil((mondayOffset + daysInMonth) / 7);
  return Array.from({ length: weeks }, (_, w) => Array.from({ length: 7 }, (_, d) => gridStart + (w * 7 + d) * DAY_MS));
}
