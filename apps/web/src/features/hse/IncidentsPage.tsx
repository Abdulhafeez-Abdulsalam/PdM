/**
 * Incidents over the last year: process safety events (losses of containment, tier 1 or 2),
 * environmental releases, equipment damage and near misses, newest first. Anyone on site can
 * report a near miss: lots of reported near misses is a sign of a healthy safety culture,
 * because each one is a warning heard before something worse happens.
 */
import { useApiMutation, useApiQuery } from "@pdm/api-client";
import type { Incident, ReportIncidentRequest } from "@pdm/contracts";
import { Button, Field, Select, Skeleton } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { canDo } from "../../shared/roles/roles";
import { useGlobalSearch } from "../../shared/time-range";
import { useToasts } from "../../shared/toast";
import { HseHeader } from "./HseNav";

const FIRST = 100;

function kindText(i: Incident, t: (k: string, o?: Record<string, unknown>) => string) {
  return i.tier ? t("hse.tier", { tier: i.tier }) : t(`hse.incidentKind.${i.kind}`);
}

export function IncidentsPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const role = usePreferences((p) => p.role);
  const data = useApiQuery("hse.incidents", { scopeId }, { refetchInterval: 60_000 });
  const [all, setAll] = useState(false);

  useEffect(() => {
    document.title = `${t("hse.nav.incidents")} · ${t("app.name")}`;
  }, [t]);

  const items = data.data?.items;
  const shown = all ? items : items?.slice(0, FIRST);
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <HseHeader intro={t("hse.incidentsIntro")} />
      {canDo(role, "incident.report") && <ReportForm />}
      {!items || !shown ? (
        <Skeleton className="h-96" />
      ) : (
        <section aria-labelledby="hse-incidents" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="hse-incidents" className="mb-3 font-semibold">
            {t("hse.incidentsTitle", { count: items.length })}
          </h2>
          <div className="relative -mx-4 max-h-[40rem] overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">{t("hse.incidentsCaption")}</caption>
              <thead className="sticky top-0 bg-surface">
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th scope="col" className="px-4 py-1 font-medium">
                    {t("hse.col.when")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("hse.col.kind")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("hse.col.what")}
                  </th>
                  <th scope="col" className="py-1 pr-4 font-medium">
                    {t("hse.col.site")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => (
                  <tr key={i.id} className="border-b border-line last:border-0">
                    <th scope="row" className="px-4 py-1.5 text-left font-normal">
                      {formatDate(i.occurredAt)}
                      <span className="block font-mono text-xs text-fg-muted">{i.id}</span>
                    </th>
                    <td className={`py-1.5 pr-3 ${i.tier ? "font-semibold text-health-warning" : ""}`}>{kindText(i, t)}</td>
                    <td className="py-1.5 pr-3">
                      {i.title}
                      {i.assetId && (
                        <span className="block text-xs">
                          <Link
                            to="/assets/$assetId/$tab"
                            params={{ assetId: i.assetId, tab: i.failureId ? "failures" : "overview" }}
                            className="text-accent underline"
                          >
                            {i.failureId ? t("hse.seeFailure", { id: i.assetId }) : i.assetId}
                          </Link>
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-4 font-mono">{i.siteId}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {shown.length < items.length && (
            <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAll(true)}>
              {t("hse.showAll", { count: items.length })}
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

function ReportForm() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const [kind, setKind] = useState<ReportIncidentRequest["kind"]>("near_miss");
  const [assetId, setAssetId] = useState("");
  const [title, setTitle] = useState("");
  const report = useApiMutation("hse.reportIncident", {
    onSuccess: (i) => {
      void client.invalidateQueries({ queryKey: ["hse.incidents"] });
      void client.invalidateQueries({ queryKey: ["hse.overview"] });
      toast("success", t("hse.reported", { id: i.id }));
      setTitle("");
    },
    onError: (e) => toast("error", e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    report.mutate({ kind, assetId: assetId.trim(), title: title.trim() });
  };
  const valid = assetId.trim().length > 0 && title.trim().length >= 5;
  return (
    <section aria-labelledby="hse-report" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="hse-report" className="mb-1 font-semibold">
        {t("hse.reportTitle")}
      </h2>
      <p className="mb-3 text-sm text-fg-muted">{t("hse.reportIntro")}</p>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <Select
          label={t("hse.reportKind")}
          value={kind}
          options={(["near_miss", "equipment_damage", "environmental_release"] as const).map((k) => ({
            value: k,
            label: t(`hse.incidentKind.${k}`),
          }))}
          onChange={setKind}
        />
        <Field label={t("hse.reportAsset")}>
          {(p) => (
            <input
              {...p}
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="h-8 w-40 rounded-md border border-line bg-surface px-2 font-mono text-sm"
            />
          )}
        </Field>
        <div className="min-w-0 flex-1">
          <Field label={t("hse.reportWhat")}>
            {(p) => (
              <input
                {...p}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="h-8 w-full rounded-md border border-line bg-surface px-2 text-sm"
              />
            )}
          </Field>
        </div>
        <Button type="submit" variant="primary" disabled={!valid || report.isPending}>
          {t("hse.report")}
        </Button>
      </form>
    </section>
  );
}
