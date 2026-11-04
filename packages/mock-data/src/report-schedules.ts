/**
 * Scheduled reports. A schedule says what, how often and whose; when it comes due, a run is noted
 * and the owner's bell says the report is ready. Runs are worked out from the schedule's own times,
 * one at a time, so they're the same however the time was reached, and after a restart.
 */
import type { CreateScheduleRequest, ReportFrequency, ReportId, ScheduledReport } from "@pdm/contracts";
import { DAY, iso } from "./clock";
import { ApiFailure } from "./errors";

const EVERY: Record<ReportFrequency, number> = { daily: DAY, weekly: 7 * DAY, monthly: 30 * DAY };
const KEEP_RUNS = 20;

export const REPORT_TITLES: Record<ReportId, string> = {
  "weekly-reliability": "Weekly reliability report",
  "monthly-esg": "Monthly ESG report",
  "monthly-financials": "Monthly financial report",
  "management-summary": "Management summary",
};

export class ReportSchedules {
  private readonly items: ScheduledReport[] = [];
  private next = 1;

  mine(ownerId: string): ScheduledReport[] {
    return this.items.filter((s) => s.ownerId === ownerId);
  }

  create(ownerId: string, input: CreateScheduleRequest, now: number): ScheduledReport {
    const schedule: ScheduledReport = {
      id: `SCH-${String(this.next++).padStart(4, "0")}`,
      ownerId,
      ...input,
      active: true,
      createdAt: iso(now),
      nextRunAt: iso(now + EVERY[input.frequency]),
      runCount: 0,
      runs: [],
    };
    this.items.push(schedule);
    return schedule;
  }

  private find(id: string, ownerId: string): ScheduledReport {
    const schedule = this.items.find((s) => s.id === id && s.ownerId === ownerId);
    if (!schedule) throw new ApiFailure("not_found", `Schedule ${id} not found`);
    return schedule;
  }

  setActive(id: string, ownerId: string, active: boolean, now: number): ScheduledReport {
    const schedule = this.find(id, ownerId);
    if (schedule.active !== active) {
      schedule.active = active;
      schedule.nextRunAt = active ? iso(now + EVERY[schedule.frequency]) : null;
    }
    return schedule;
  }

  remove(id: string, ownerId: string): void {
    this.items.splice(this.items.indexOf(this.find(id, ownerId)), 1);
  }

  tick(now: number): void {
    for (const s of this.items) {
      while (s.nextRunAt !== null && Date.parse(s.nextRunAt) <= now) {
        s.runCount++;
        s.runs = [{ n: s.runCount, t: s.nextRunAt }, ...s.runs].slice(0, KEEP_RUNS);
        s.nextRunAt = iso(Date.parse(s.nextRunAt) + EVERY[s.frequency]);
      }
    }
  }
}
