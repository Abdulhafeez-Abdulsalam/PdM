/**
 * One work order (/maintenance/wo-10370): what to do, where it came from, what the readings
 * were, what was found, and every step of its history.
 */
import { useApiQuery } from "@pdm/api-client";
import { isChecklistItemDone, type WorkOrder } from "@pdm/contracts";
import { Button, EmptyState, Skeleton } from "@pdm/ui";
import { Link, useParams } from "@tanstack/react-router";
import { Check, Circle, SearchX } from "lucide-react";
import { useEffect, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { useUsers } from "../../shared/users";
import { formatMeasurement, toDisplay } from "../../shared/units";
import { allowedMoves, moveLabelKey } from "./lifecycle";
import { PriorityLabel } from "./PriorityLabel";
import { WorkOrderDialogs } from "./WorkOrderDialogs";
import { useMove } from "./use-move";

export function WorkOrderPage() {
  const { t } = useTranslation();
  const { workOrderId } = useParams({ from: "/maintenance/$workOrderId" });
  const wo = useApiQuery("workOrders.get", { workOrderId });

  useEffect(() => {
    document.title = `${wo.data?.number ?? workOrderId} · ${t("modules.maintenance.name")} · ${t("app.name")}`;
  }, [wo.data?.number, workOrderId, t]);

  if (wo.isError) {
    return (
      <EmptyState icon={<SearchX className="size-8" />} title={t("workOrderPage.notFound")}>
        <Link to="/maintenance" search={(prev) => prev} className="text-accent underline">
          {t("workOrderPage.back")}
        </Link>
      </EmptyState>
    );
  }
  if (!wo.data) return <Skeleton className="h-96" />;
  return <WorkOrderView wo={wo.data} />;
}

function WorkOrderView({ wo }: { wo: WorkOrder }) {
  const { t } = useTranslation();
  const role = usePreferences((p) => p.role);
  const tz = usePreferences((p) => p.timeZone);
  const { byId } = useUsers();
  const { move, dialog, closeDialog } = useMove();
  const moves = allowedMoves(role, wo);
  const name = (id: string | null) => (id ? (byId.get(id)?.name ?? (id === "system" ? t("workOrderPage.system") : id)) : "—");
  const formatTime = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);

  return (
    <div className="mx-auto flex max-w-[1200px] flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/maintenance" search={(prev) => prev} className="text-sm text-accent hover:underline">
            ← {t("workOrderPage.back")}
          </Link>
          <h1 className="text-2xl font-semibold">{wo.title}</h1>
          <p className="flex flex-wrap items-center gap-x-3 text-fg-muted">
            <span className="font-mono">{wo.number}</span>
            <span>{t(`workOrders.statuses.${wo.status}`)}</span>
            <PriorityLabel priority={wo.priority} />
            <span>{t(`workOrders.types.${wo.type}`)}</span>
          </p>
        </div>
        {moves.length > 0 && (
          <div className="flex flex-wrap gap-2" role="group" aria-label={t("workOrderPage.actions")}>
            {moves.map((to) => (
              <Button
                key={to}
                variant={to === "cancelled" ? "danger" : to === moves[0] ? "primary" : "secondary"}
                onClick={() => move(wo, to)}
              >
                {t(moveLabelKey(wo.status, to))}
              </Button>
            ))}
          </div>
        )}
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title={t("workOrderPage.details")} className="lg:col-span-2">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-3">
            <Item label={t("assets.col.asset")}>
              <Link to="/assets/$assetId" params={{ assetId: wo.assetId }} search={(prev) => prev} className="font-mono hover:underline">
                {wo.assetId}
              </Link>
            </Item>
            <Item label={t("createWo.assignee")}>{name(wo.assigneeId)}</Item>
            <Item label={t("createWo.due")}>{wo.dueAt ? formatDate(wo.dueAt) : "—"}</Item>
            <Item label={t("workOrderPage.scheduled")}>{wo.scheduledStart ? formatTime(Date.parse(wo.scheduledStart)) : "—"}</Item>
            <Item label={t("workOrderPage.createdBy")}>{name(wo.createdBy)}</Item>
            <Item label={t("workOrderPage.source")}>
              <Source wo={wo} />
            </Item>
          </dl>
          {wo.description && <p className="mt-4 text-sm whitespace-pre-line">{wo.description}</p>}
        </Card>

        <Card title={t("workOrderPage.history")}>
          <ol className="flex flex-col gap-2 border-l border-line pl-3 text-sm">
            {[...wo.history].reverse().map((e, i) => (
              <li key={i}>
                <span className="font-medium">{t(`workOrders.statuses.${e.to}`)}</span>
                <span className="block text-xs text-fg-muted">
                  {formatTime(Date.parse(e.at))} · {name(e.by)}
                </span>
                {e.note && <span className="block text-xs">“{e.note}”</span>}
              </li>
            ))}
          </ol>
        </Card>

        <Checklist wo={wo} />
        {wo.evidence && <Evidence wo={wo} />}
        {wo.closeOut && <CloseOutCard wo={wo} name={name} />}
      </div>
      <WorkOrderDialogs dialog={dialog} onClose={closeDialog} />
    </div>
  );
}

function Source({ wo }: { wo: WorkOrder }) {
  const { t } = useTranslation();
  const { kind, refId } = wo.source;
  if (kind === "prediction" && refId) {
    return (
      <Link to="/predictive/$predictionId" params={{ predictionId: refId }} search={(prev) => prev} className="text-accent hover:underline">
        {t("workOrderPage.fromPrediction", { id: refId })}
      </Link>
    );
  }
  if (kind === "alarm" && refId) {
    return (
      <Link
        to="/assets/$assetId/$tab"
        params={{ assetId: wo.assetId, tab: "alarms" }}
        search={(prev) => prev}
        className="text-accent hover:underline"
      >
        {t("workOrderPage.fromAlarm", { id: refId })}
      </Link>
    );
  }
  if (kind === "rca" && refId) {
    return (
      <Link to="/reliability/rca/$rcaId" params={{ rcaId: refId }} className="text-accent hover:underline">
        {t("workOrderPage.fromRca", { id: refId })}
      </Link>
    );
  }
  if (kind === "pm" && refId) {
    return (
      <Link to="/maintenance/pm/$planId" params={{ planId: refId }} className="text-accent hover:underline">
        {t("workOrderPage.fromPm", { id: refId })}
      </Link>
    );
  }
  return <>{t(`workOrderPage.sourceKind.${kind}`)}</>;
}

/** Safety checks, steps and readings — filled in on the field task page, shown here read-only. */
function Checklist({ wo }: { wo: WorkOrder }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  const tags = useApiQuery("assets.tags", { assetId: wo.assetId });
  const byId = new Map((tags.data?.items ?? []).map((tg) => [tg.id, tg]));
  if (wo.checklist.length === 0) return null;
  return (
    <Card title={t("field.checklistTitle")} className="lg:col-span-2">
      <ul className="flex flex-col gap-1.5 text-sm">
        {wo.checklist.map((item) => {
          const done = isChecklistItemDone(item);
          const tag = item.tagId ? byId.get(item.tagId) : undefined;
          const shown = item.value !== null && tag ? toDisplay(item.value, tag.quantity, units) : null;
          return (
            <li key={item.id} className="flex items-start gap-2">
              {done ? (
                <Check aria-hidden className="mt-0.5 size-4 shrink-0" />
              ) : (
                <Circle aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
              )}
              <span className="sr-only">{done ? t("common.done") : t("common.notDone")}</span>
              <span className="text-xs text-fg-muted">{t(`field.checklistKind.${item.kind}`)}</span>
              <span className="flex-1">{item.label}</span>
              {shown && (
                <span className="tabular-nums">
                  {formatMeasurement(shown.value)} {t(`unitSymbol.${shown.unit}`)}
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {["approved", "in_progress"].includes(wo.status) && (
        <Link
          to="/field/tasks/$taskId"
          params={{ taskId: wo.id }}
          search={(prev) => prev}
          className="mt-3 inline-block text-sm text-accent hover:underline"
        >
          {t("field.openTask")}
        </Link>
      )}
    </Card>
  );
}

/** The readings when the work was raised, in the user's units. */
function Evidence({ wo }: { wo: WorkOrder }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  const tags = useApiQuery("assets.tags", { assetId: wo.assetId });
  const byId = new Map((tags.data?.items ?? []).map((tg) => [tg.id, tg]));
  if (!wo.evidence) return null;
  return (
    <Card title={t("workOrderPage.evidence", { date: formatDate(wo.evidence.capturedAt) })} className="lg:col-span-2">
      <dl className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        {wo.evidence.values.map((v) => {
          const tag = byId.get(v.tagId);
          const shown = tag ? toDisplay(v.value, tag.quantity, units) : { value: v.value, unit: null };
          return (
            <div key={v.tagId} className="flex justify-between gap-3 border-b border-line py-1.5 text-sm">
              <dt className="truncate text-fg-muted">{tag?.description ?? v.tagId}</dt>
              <dd className="tabular-nums">
                {formatMeasurement(shown.value)} {shown.unit && t(`unitSymbol.${shown.unit}`)}
              </dd>
            </div>
          );
        })}
      </dl>
    </Card>
  );
}

function CloseOutCard({ wo, name }: { wo: WorkOrder; name: (id: string | null) => string }) {
  const { t } = useTranslation();
  const c = wo.closeOut;
  if (!c) return null;
  return (
    <Card title={t("workOrderPage.closeOut")}>
      <dl className="flex flex-col gap-2 text-sm">
        <Item label={t("woDialogs.failureMode")}>
          {c.failureMode} — {t(`iso14224.mode.${c.failureMode}`)}
        </Item>
        <Item label={t("woDialogs.cause")}>
          {c.cause} — {t(`iso14224.cause.${c.cause.replace(".", "_")}`)}
        </Item>
        <Item label={t("woDialogs.remedy")}>{t(`iso14224.remedy.${c.remedy}`)}</Item>
        <Item label={t("woDialogs.laborHours")}>{c.laborHours}</Item>
        {c.predictionVerdict && <Item label={t("woDialogs.verdict")}>{t(`feedback.option.${c.predictionVerdict}`)}</Item>}
        <Item label={t("woDialogs.findings")}>{c.findings}</Item>
        <Item label={t("workOrderPage.completedBy")}>
          {name(c.completedBy)} · {formatDate(c.completedAt)}
        </Item>
      </dl>
    </Card>
  );
}

function Card({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-line bg-surface p-4 ${className ?? ""}`} aria-label={title}>
      <h2 className="mb-3 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
