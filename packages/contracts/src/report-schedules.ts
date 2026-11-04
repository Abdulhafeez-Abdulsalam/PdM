import { z } from "zod";
import { Id, ScopeId, Timestamp, list } from "./common";

/** The ready-made reports. */
export const ReportId = z.enum(["weekly-reliability", "monthly-esg", "monthly-financials", "management-summary"]);
export type ReportId = z.infer<typeof ReportId>;

export const ReportFrequency = z.enum(["daily", "weekly", "monthly"]);
export type ReportFrequency = z.infer<typeof ReportFrequency>;

export const ScheduledReport = z.object({
  id: Id,
  ownerId: Id,
  reportId: ReportId,
  scopeId: ScopeId,
  frequency: ReportFrequency,
  active: z.boolean(),
  createdAt: Timestamp,
  /** null while paused. */
  nextRunAt: Timestamp.nullable(),
  runCount: z.number().int().min(0),
  /** The latest runs, newest first. */
  runs: z.array(z.object({ n: z.number().int().min(1), t: Timestamp })).max(20),
});
export type ScheduledReport = z.infer<typeof ScheduledReport>;

export const ScheduledReportList = list(ScheduledReport);

export const CreateScheduleRequest = z.object({ reportId: ReportId, scopeId: ScopeId, frequency: ReportFrequency });
export type CreateScheduleRequest = z.infer<typeof CreateScheduleRequest>;

export const SetScheduleActiveRequest = z.object({ scheduleId: Id, active: z.boolean() });
export type SetScheduleActiveRequest = z.infer<typeof SetScheduleActiveRequest>;

export const DeleteScheduleRequest = z.object({ scheduleId: Id });
export type DeleteScheduleRequest = z.infer<typeof DeleteScheduleRequest>;
