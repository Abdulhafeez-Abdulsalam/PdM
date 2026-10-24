/**
 * One PM plan: what it does and how often, why it exists (its FMEA scores and Weibull life),
 * the parts it uses, and every asset it covers with its next due date, overdue first. The
 * planner can raise the work orders for everything due in the next 30 days in one go; the
 * plan then shows them as planned, and as done once they're closed out.
 */
import { useApiMutation, useApiQuery } from "@pdm/api-client";
import { PM_HORIZON_DAYS, type PmAssetStatus } from "@pdm/contracts";
import { Button, EmptyState, Skeleton } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardList, SearchX } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, formatNumber } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { canDo } from "../../shared/roles/roles";
import { useGlobalSearch } from "../../shared/time-range";
import { useToasts } from "../../shared/toast";
import { ColumnChart } from "../../shared/widgets/ColumnChart";
import { pct, planTitle, triggerText } from "./pm-format";

const STEPS = { planned_remedy: 4, condition_check: 3 } as const;
const STATUS_ICON = { overdue: AlertTriangle, planned: ClipboardList, due_soon: CalendarClock, ok: CheckCircle2 } as const;
const STATUS_TONE = { overdue: "text-health-warning", planned: "text-fg", due_soon: "text-fg", ok: "text-health-healthy" } as const;

export function PmPlanPage() {
  const { t } = useTranslation();
  const { planId } = useParams({ from: "/maintenance/pm/$planId" });
  const { scopeId } = useGlobalSearch();
  const role = usePreferences((p) => p.role);
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const [created, setCreated] = useState<{ workOrderId: string; number: string; assetId: string }[]>([]);
  const plan = useApiQuery("pm.plan", { planId, scopeId }, { refetchInterval: 120_000 });
  const generate = useApiMutation("pm.generate", {
    onSuccess: (r) => {
      setCreated(r.created);
      void client.invalidateQueries({ queryKey: ["pm.plan"] });
      void client.invalidateQueries({ queryKey: ["pm.overview"] });
      void client.invalidateQueries({ queryKey: ["workOrders.list"] });
      toast("success", t("pm.generated", { count: r.created.length }));
    },
    onError: (e) => toast("error", e.message),
  });

  const p = plan.data;
  useEffect(() => {
    document.title = `${p ? planTitle(p, t) : planId} · ${t("pm.title.page")} · ${t("app.name")}`;
  }, [p, planId, t]);

  if (plan.isError) {
    return (
      <EmptyState icon={<SearchX className="size-8" />} title={t("pm.notFound", { id: planId })}>
        <Link to="/maintenance/pm" search={(prev) => prev} className="text-accent underline">
          {t("pm.backToPlans")}
        </Link>
      </EmptyState>
    );
  }
  if (!p) return <Skeleton className="h-96" />;

  const toRaise = p.counts.overdue + p.counts.dueSoon;
  const mayGenerate = canDo(role, "workOrder.schedule");
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <p className="text-sm">
          <Link to="/maintenance/pm" search={(prev) => prev} className="text-accent underline">
            {t("pm.title.page")}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">{planTitle(p, t)}</h1>
        <p className="text-fg-muted">
          <span className="font-mono">{p.id}</span> · {t(`assetClass.${p.assetClass}`)} · {triggerText(p, t)} ·{" "}
          {t("pm.hours", { hours: formatNumber(p.estimatedHours, 1) })}
        </p>
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <section aria-labelledby="pm-why" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="pm-why" className="mb-2 font-semibold">
            {t("pm.whyTitle")}
          </h2>
          <p className="text-sm">
            {t(`pm.why.${p.strategy}`, {
              mode: t(`iso14224.mode.${p.mode}`),
              b10: p.why.b10Days === null ? "—" : formatNumber(p.why.b10Days),
            })}
          </p>
          <dl className="mt-3 grid grid-cols-4 gap-2 text-sm">
            {(["severity", "occurrence", "detection", "rpn"] as const).map((k) => (
              <div key={k}>
                <dt className="text-xs text-fg-muted">{t(`pm.score.${k}`)}</dt>
                <dd className="text-lg font-semibold tabular-nums">{p.why[k]}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-3 text-sm">
            <Link to="/reliability/fmea" search={(prev) => ({ ...prev, class: p.assetClass })} className="text-accent underline">
              {t("pm.seeFmea")}
            </Link>
          </p>
        </section>

        <section aria-labelledby="pm-task" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="pm-task" className="mb-2 font-semibold">
            {t("pm.taskTitle")}
          </h2>
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {Array.from({ length: STEPS[p.task] }, (_, i) => (
              <li key={i}>{t(`pm.steps.${p.task}.${i + 1}`)}</li>
            ))}
          </ol>
          <h3 className="mt-3 mb-1 text-sm font-semibold">{t("pm.partsTitle")}</h3>
          {p.parts.length === 0 ? (
            <p className="text-sm text-fg-muted">{t("pm.noParts")}</p>
          ) : (
            <ul className="text-sm">
              {p.parts.map((part) => (
                <li key={part.partNumber}>
                  {t("pm.part", { quantity: part.quantity, description: part.description })}{" "}
                  <span className="font-mono text-xs text-fg-muted">{part.partNumber}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="pm-status" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="pm-status" className="mb-2 font-semibold">
            {t("pm.statusTitle")}
          </h2>
          <dl className="grid grid-cols-3 gap-2 text-sm">
            <div>
              <dt className="text-xs text-fg-muted">{t("pm.kpi.compliance")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{pct(p.counts.compliancePct)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t("pm.kpi.overdue")}</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatNumber(p.counts.overdue)}</dd>
            </div>
            <div>
              <dt className="text-xs text-fg-muted">{t("pm.kpi.dueSoon", { days: PM_HORIZON_DAYS })}</dt>
              <dd className="text-lg font-semibold tabular-nums">{formatNumber(p.counts.dueSoon)}</dd>
            </div>
          </dl>
          {mayGenerate && (
            <div className="mt-3">
              <Button variant="primary" disabled={toRaise === 0 || generate.isPending} onClick={() => generate.mutate({ planId, scopeId })}>
                {t("pm.generate", { count: toRaise })}
              </Button>
              <p className="mt-1 text-xs text-fg-muted">{t("pm.generateHelp", { days: PM_HORIZON_DAYS })}</p>
            </div>
          )}
          {created.length > 0 && (
            <div role="status" className="mt-3 text-sm">
              <p className="font-medium">{t("pm.generated", { count: created.length })}</p>
              <ul className="mt-1 flex flex-wrap gap-x-3">
                {created.map((c) => (
                  <li key={c.workOrderId}>
                    <Link to="/maintenance/$workOrderId" params={{ workOrderId: c.workOrderId }} className="text-accent underline">
                      {c.number}
                    </Link>{" "}
                    <span className="text-fg-muted">{c.assetId}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>

      <section aria-labelledby="pm-monthly" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="pm-monthly" className="font-semibold">
          {t("pm.monthlyTitle")}
        </h2>
        <ColumnChart
          columns={p.monthly.map((m) => {
            const decided = m.onTime + m.late + m.missed;
            const month = new Date(`${m.month}-01T00:00:00Z`);
            return {
              key: m.month,
              tick: month.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" }),
              name: month.toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }),
              value: decided,
            };
          })}
          format={(v) => formatNumber(v)}
          valueName={t("pm.dueCount")}
          label={t("pm.planMonthlyLabel", { id: p.id })}
          summary={t("pm.planMonthlySummary", { pct: pct(p.counts.compliancePct) })}
          height={160}
        />
      </section>

      <AssetTable rows={p.assetStatus} />
    </div>
  );
}

/** Long lists (a plan can cover 750 solar strings) show the first ones, overdue first, until asked for all. */
const FIRST_ROWS = 100;

function AssetTable({ rows }: { rows: readonly PmAssetStatus[] }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const shown = all ? rows : rows.slice(0, FIRST_ROWS);
  return (
    <section aria-labelledby="pm-assets" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="pm-assets" className="font-semibold">
        {t("pm.assetsTitle", { count: rows.length })}
      </h2>
      <p className="mb-3 text-sm text-fg-muted">{t("pm.assetsIntro")}</p>
      <div className="relative -mx-4 max-h-[32rem] overflow-auto">
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">{t("pm.assetsCaption")}</caption>
          <thead className="sticky top-0 bg-surface">
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="px-4 py-1 font-medium">
                {t("pm.col.asset")}
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                {t("pm.col.status")}
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                {t("pm.col.nextDue")}
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                {t("pm.col.lastDone")}
              </th>
              <th scope="col" className="py-1 pr-3 font-medium">
                {t("pm.col.workOrder")}
              </th>
              <th scope="col" className="py-1 pr-4 text-right font-medium">
                {t("pm.col.assetCompliance")}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => {
              const Icon = STATUS_ICON[r.status];
              return (
                <tr key={r.assetId} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-1 text-left font-normal">
                    <Link
                      to="/assets/$assetId/$tab"
                      params={{ assetId: r.assetId, tab: "maintenance" }}
                      className="font-mono text-accent underline"
                    >
                      {r.assetId}
                    </Link>
                  </th>
                  <td className={`py-1 pr-3 ${STATUS_TONE[r.status]}`}>
                    <span className="inline-flex items-center gap-1">
                      <Icon aria-hidden className="size-3.5" />
                      {t(`pm.status.${r.status}`)}
                    </span>
                  </td>
                  <td className="py-1 pr-3">{r.nextDue ? formatDate(r.nextDue) : "—"}</td>
                  <td className="py-1 pr-3">{r.lastDone ? formatDate(r.lastDone) : "—"}</td>
                  <td className="py-1 pr-3">
                    {r.workOrderId ? (
                      <Link to="/maintenance/$workOrderId" params={{ workOrderId: r.workOrderId }} className="text-accent underline">
                        {r.workOrderNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="py-1 pr-4 text-right tabular-nums">{pct(r.compliancePct)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shown.length < rows.length && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAll(true)}>
          {t("pm.showAll", { count: rows.length })}
        </Button>
      )}
    </section>
  );
}
