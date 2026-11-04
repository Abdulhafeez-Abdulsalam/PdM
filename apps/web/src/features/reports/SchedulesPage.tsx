/**
 * Scheduled reports (spec §6.13): pick a report and how often, and your bell says when it's ready.
 * Delivery is the bell only; email would need a mail service. A run links to the report, which
 * shows the figures as they are when opened (a frozen copy of each run is still open).
 */
import { useApiMutation, useApiQuery } from "@pdm/api-client";
import { ReportFrequency, ReportId, type ScheduledReport } from "@pdm/contracts";
import { Button, EmptyState, Modal, Select } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { useGlobalSearch } from "../../shared/time-range";
import { useToasts } from "../../shared/toast";
import { ReportsHeader } from "./ReportsPages";

export function SchedulesPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const { scopeId } = useGlobalSearch();
  const node = useApiQuery("hierarchy.node", { nodeId: scopeId });
  const list = useApiQuery("reportSchedules.list", {}, { refetchInterval: 15_000 });
  const [reportId, setReportId] = useState<ReportId>("weekly-reliability");
  const [frequency, setFrequency] = useState<ReportFrequency>("weekly");
  const [deleting, setDeleting] = useState<ScheduledReport | null>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ["reportSchedules.list"] });
  const failed = (error: Error) => toast("error", t("reports.schedule.failed", { reason: error.message }));
  const create = useApiMutation("reportSchedules.create", {
    onSuccess: () => {
      toast("success", t("reports.schedule.created"));
      void refresh();
    },
    onError: failed,
  });
  const setActive = useApiMutation("reportSchedules.setActive", { onSuccess: refresh, onError: failed });
  const remove = useApiMutation("reportSchedules.delete", {
    onSuccess: () => {
      setDeleting(null);
      void refresh();
    },
    onError: failed,
  });
  const items = list.data?.items ?? [];
  const tz = usePreferences((p) => p.timeZone);
  const format = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <ReportsHeader intro={t("reports.schedule.intro")} />
      <section aria-labelledby="schedule-new" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="schedule-new" className="mb-2 font-semibold">
          {t("reports.schedule.new")}
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <Select
            label={t("reports.schedule.report")}
            value={reportId}
            options={ReportId.options.map((r) => ({ value: r, label: t(`reports.report.${r}.title`) }))}
            onChange={setReportId}
          />
          <Select
            label={t("reports.schedule.frequency")}
            value={frequency}
            options={ReportFrequency.options.map((f) => ({ value: f, label: t(`reports.schedule.every.${f}`) }))}
            onChange={setFrequency}
          />
          <Button variant="primary" disabled={create.isPending} onClick={() => create.mutate({ reportId, frequency, scopeId })}>
            {t("reports.schedule.add")}
          </Button>
          <p className="text-sm text-fg-muted">{t("reports.schedule.scope", { scope: node.data?.name ?? scopeId })}</p>
        </div>
      </section>

      <section aria-labelledby="schedule-list" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="schedule-list" className="mb-2 font-semibold">
          {t("reports.schedule.yours")}
        </h2>
        {items.length === 0 ? (
          <EmptyState icon={<CalendarClock aria-hidden className="size-6" />} title={t("reports.schedule.none")}>
            {t("reports.schedule.noneHint")}
          </EmptyState>
        ) : (
          <div className="relative -mx-4 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">{t("reports.schedule.yours")}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th scope="col" className="px-4 py-1 font-medium">
                    {t("reports.schedule.report")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("reports.schedule.frequency")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("reports.schedule.next")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("reports.schedule.last")}
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    {t("reports.schedule.runs")}
                  </th>
                  <th scope="col" className="px-4 py-1 text-right font-medium">
                    {t("reports.schedule.actions")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((s) => {
                  const title = t(`reports.report.${s.reportId}.title`);
                  const last = s.runs[0];
                  return (
                    <tr key={s.id} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-2 text-left font-normal">
                        <Link
                          to="/reports/$reportId"
                          params={{ reportId: s.reportId }}
                          search={(prev) => ({ ...prev, scope: s.scopeId })}
                          className="text-accent hover:underline"
                        >
                          {title}
                        </Link>
                      </th>
                      <td className="py-2 pr-3">{t(`reports.schedule.every.${s.frequency}`)}</td>
                      <td className="py-2 pr-3">{s.nextRunAt ? format(Date.parse(s.nextRunAt)) : t("reports.schedule.paused")}</td>
                      <td className="py-2 pr-3">{last ? format(Date.parse(last.t)) : "—"}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{s.runCount}</td>
                      <td className="px-4 py-2">
                        <span className="flex justify-end gap-1">
                          <Button
                            size="sm"
                            onClick={() => setActive.mutate({ scheduleId: s.id, active: !s.active })}
                            aria-label={t(s.active ? "reports.schedule.pauseOne" : "reports.schedule.resumeOne", { title })}
                          >
                            {t(s.active ? "reports.schedule.pause" : "reports.schedule.resume")}
                          </Button>
                          <Button
                            size="sm"
                            variant="danger"
                            onClick={() => setDeleting(s)}
                            aria-label={t("reports.schedule.deleteOne", { title })}
                          >
                            {t("reports.schedule.delete")}
                          </Button>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("reports.schedule.confirmTitle")}
        closeLabel={t("common.close")}
      >
        <p className="text-sm">
          {t("reports.schedule.confirm", { title: deleting ? t(`reports.report.${deleting.reportId}.title`) : "" })}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button onClick={() => setDeleting(null)}>{t("common.cancel")}</Button>
          <Button variant="danger" onClick={() => deleting && remove.mutate({ scheduleId: deleting.id })}>
            {t("reports.schedule.delete")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
