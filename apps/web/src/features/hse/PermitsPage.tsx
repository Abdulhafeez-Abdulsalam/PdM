/**
 * Permits to work: raised when hazardous work is scheduled, issued by the HSE officer, needed
 * before the work can start, and closed when it's closed out. Waiting ones first, soonest
 * start first, so the officer works down the list. URL: /hse/permits?show=waiting|issued|all
 */
import { useApiMutation, useApiQuery } from "@pdm/api-client";
import type { Permit, PermitStatus } from "@pdm/contracts";
import { Button, Select, Skeleton } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatDate, makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { canDo } from "../../shared/roles/roles";
import { useGlobalSearch } from "../../shared/time-range";
import { useToasts } from "../../shared/toast";
import { HseHeader } from "./HseNav";

const SHOW: Record<"waiting" | "issued" | "all", PermitStatus[] | undefined> = {
  waiting: ["requested"],
  issued: ["issued"],
  all: undefined,
};
const searchSchema = z.object({ show: z.enum(["waiting", "issued", "all"]).catch("waiting").default("waiting") });

const ICON = { requested: Clock, issued: CheckCircle2, closed: CheckCircle2, cancelled: XCircle } as const;
const TONE = {
  requested: "text-health-warning",
  issued: "text-health-healthy",
  closed: "text-fg-muted",
  cancelled: "text-fg-muted",
} as const;

export function PermitStatusLabel({ status }: { status: PermitStatus }) {
  const { t } = useTranslation();
  const Icon = ICON[status];
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${TONE[status]}`}>
      <Icon aria-hidden className="size-3.5" />
      {t(`hse.permitStatus.${status}`)}
    </span>
  );
}

/** The HSE officer's Issue button. Everyone else sees nothing. */
export function IssuePermitButton({ permit }: { permit: Permit }) {
  const { t } = useTranslation();
  const role = usePreferences((p) => p.role);
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const issue = useApiMutation("hse.issuePermit", {
    onSuccess: (p) => {
      void client.invalidateQueries({ queryKey: ["hse.permits"] });
      void client.invalidateQueries({ queryKey: ["hse.overview"] });
      toast("success", t("hse.issued", { id: p.id, wo: p.workOrderNumber }));
    },
    onError: (e) => toast("error", e.message),
  });
  if (permit.status !== "requested" || !canDo(role, "permit.issue")) return null;
  return (
    <Button size="sm" variant="primary" disabled={issue.isPending} onClick={() => issue.mutate({ permitId: permit.id })}>
      {t("hse.issue")} <span className="sr-only">{permit.id}</span>
    </Button>
  );
}

export function PermitsPage() {
  const { t } = useTranslation();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();
  const { scopeId } = useGlobalSearch();
  const tz = usePreferences((p) => p.timeZone);
  const formatTime = makeTimeFormatter(tz === "site" ? "utc" : tz);
  const data = useApiQuery("hse.permits", { scopeId, status: SHOW[search.show] }, { refetchInterval: 30_000 });

  useEffect(() => {
    document.title = `${t("hse.nav.permits")} · ${t("app.name")}`;
  }, [t]);

  const permits = data.data?.items;
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <HseHeader intro={t("hse.permitsIntro")} />
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t("hse.show")}
          value={search.show}
          options={(["waiting", "issued", "all"] as const).map((v) => ({ value: v, label: t(`hse.permitShow.${v}`) }))}
          onChange={(v) => void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, show: v }), replace: true })}
        />
      </div>
      {!permits ? (
        <Skeleton className="h-96" />
      ) : (
        <section aria-labelledby="hse-permits" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="hse-permits" className="mb-3 font-semibold">
            {t("hse.permitsTitle", { count: permits.length })}
          </h2>
          {permits.length === 0 ? (
            <p className="text-sm text-fg-muted">{t("hse.noPermits")}</p>
          ) : (
            <div className="relative -mx-4 max-h-[40rem] overflow-auto">
              <table className="w-full min-w-[900px] text-sm">
                <caption className="sr-only">{t("hse.permitsCaption")}</caption>
                <thead className="sticky top-0 bg-surface">
                  <tr className="border-b border-line text-left text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-1 font-medium">
                      {t("hse.col.permit")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("hse.col.work")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("hse.col.asset")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("hse.col.start")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("hse.col.status")}
                    </th>
                    <th scope="col" className="py-1 pr-4 font-medium">
                      <span className="sr-only">{t("hse.col.actions")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {permits.map((p) => (
                    <tr key={p.id} className="border-b border-line last:border-0">
                      <th scope="row" className="px-4 py-1.5 text-left font-normal">
                        <span className="font-mono">{p.id}</span>
                        <span className="block text-xs text-fg-muted">{t(`hse.permitType.${p.type}`)}</span>
                      </th>
                      <td className="py-1.5 pr-3">
                        <Link to="/maintenance/$workOrderId" params={{ workOrderId: p.workOrderId }} className="text-accent underline">
                          {p.workOrderNumber}
                        </Link>
                        <span className="block text-xs">{p.workOrderTitle}</span>
                      </td>
                      <td className="py-1.5 pr-3">
                        <Link
                          to="/assets/$assetId/$tab"
                          params={{ assetId: p.assetId, tab: "overview" }}
                          className="font-mono text-accent underline"
                        >
                          {p.assetId}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3">{p.plannedStart ? formatTime(Date.parse(p.plannedStart)) : "—"}</td>
                      <td className="py-1.5 pr-3">
                        <PermitStatusLabel status={p.status} />
                        {p.issuedAt && <span className="block text-xs text-fg-muted">{formatDate(p.issuedAt)}</span>}
                      </td>
                      <td className="py-1.5 pr-4">
                        <IssuePermitButton permit={p} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
