/**
 * One field task: a work order as the technician works through it, on a phone or tablet.
 *
 *   1. Safety checks — all confirmed before "Start work" is allowed (the server checks too).
 *   2. Steps and readings — readings in the user's units, with the expected range shown.
 *   3. Close-out — ISO 14224 coding, findings, hours; then "Complete job".
 *
 * Everything typed is kept in the tab (draft.ts), and submitting waits for a connection
 * (acceptance criterion D).
 */
import { useApiQuery, useConnectionState } from "@pdm/api-client";
import {
  FailureCauseCode,
  FailureModeCode,
  PredictionFeedback,
  RemedyCode,
  isChecklistItemDone,
  type ChecklistItem,
  type ChecklistResult,
  type Tag,
  type WorkOrder,
} from "@pdm/contracts";
import { Button, EmptyState, Field, Skeleton, inputClass } from "@pdm/ui";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { CloudOff, History, SearchX, TriangleAlert } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences, type UnitSystem } from "../../shared/preferences";
import { canDo } from "../../shared/roles/roles";
import { useSimNow } from "../../shared/sim-time";
import { formatMeasurement, fromDisplay, toDisplay } from "../../shared/units";
import { PriorityLabel } from "../maintenance/PriorityLabel";
import { useWorkOrderActions } from "../maintenance/use-work-order-actions";
import { clearDraft, readDraft, useKeepDraft } from "./draft";

export function TaskPage() {
  const { t } = useTranslation();
  const { taskId } = useParams({ from: "/field/tasks/$taskId" });
  const wo = useApiQuery("workOrders.get", { workOrderId: taskId });
  const tags = useApiQuery("assets.tags", { assetId: wo.data?.assetId ?? "" }, { enabled: wo.data !== undefined });

  useEffect(() => {
    document.title = `${wo.data?.number ?? taskId} · ${t("field.myJobs")} · ${t("app.name")}`;
  }, [wo.data?.number, taskId, t]);

  if (wo.isError) {
    return (
      <EmptyState icon={<SearchX className="size-8" />} title={t("workOrderPage.notFound")}>
        <Link to="/field" search={(prev) => prev} className="text-accent underline">
          {t("field.back")}
        </Link>
      </EmptyState>
    );
  }
  if (!wo.data || !tags.data) return <Skeleton className="mx-auto h-96 max-w-xl" />;
  return <TaskView wo={wo.data} tags={tags.data.items} />;
}

// ─── The form ────────────────────────────────────────────────────────────────

interface TaskValues {
  /** Safety and step lines, by checklist item id. */
  checks: Record<string, boolean>;
  /** Readings as typed, in the user's units. Kept as text so "4," mid-typing isn't lost. */
  readings: Record<string, string>;
  failureMode: FailureModeCode;
  cause: FailureCauseCode;
  remedy: RemedyCode;
  findings: string;
  laborHours: string;
  predictionVerdict: PredictionFeedback | "";
}

const closeOutFields = z.object({
  findings: z.string().trim().min(10, { error: "forms.findingsTooShort" }).max(4000, { error: "forms.tooLong" }),
  laborHours: z.coerce
    .number({ error: "forms.hoursRequired" })
    .min(0, { error: "forms.hoursRequired" })
    .max(1000, { error: "forms.hoursRequired" }),
});

/** "4,5" and "4.5" both mean four and a half; empty or junk is null. */
function parseReading(text: string | undefined): number | null {
  if (text === undefined || text.trim() === "") return null;
  const n = Number(text.trim().replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Hours since the job was started, to the nearest half hour — a starting point the technician can correct. */
function hoursSinceStart(wo: WorkOrder, now: number): string {
  const started = [...wo.history].reverse().find((e) => e.to === "in_progress");
  if (!started) return "";
  return String(Math.max(0.5, Math.round(((now - Date.parse(started.at)) / 3_600_000) * 2) / 2));
}

function initialValues(wo: WorkOrder, tagsById: ReadonlyMap<string, Tag>, units: UnitSystem, now: number): TaskValues {
  const checks: Record<string, boolean> = {};
  const readings: Record<string, string> = {};
  for (const item of wo.checklist) {
    if (item.kind !== "reading") checks[item.id] = item.done;
    else {
      const tag = item.tagId ? tagsById.get(item.tagId) : undefined;
      readings[item.id] =
        item.value === null ? "" : tag ? formatMeasurement(toDisplay(item.value, tag.quantity, units).value) : String(item.value);
    }
  }
  return {
    checks,
    readings,
    failureMode: "OTH",
    cause: "6.0",
    remedy: "repair",
    findings: "",
    laborHours: hoursSinceStart(wo, now),
    predictionVerdict: "",
  };
}

function TaskView({ wo, tags }: { wo: WorkOrder; tags: readonly Tag[] }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const role = usePreferences((p) => p.role);
  const units = usePreferences((p) => p.units);
  const tz = usePreferences((p) => p.timeZone);
  const { now } = useSimNow();
  const offline = useConnectionState() === "offline";
  const { transition, closeOut } = useWorkOrderActions();
  const tagsById = useMemo(() => new Map(tags.map((tag) => [tag.id, tag])), [tags]);
  const formatTime = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);

  const canStart = wo.status === "approved" && canDo(role, "workOrder.execute");
  const canFinish = wo.status === "in_progress" && canDo(role, "workOrder.close");
  const finished = ["completed", "verified", "closed"].includes(wo.status);

  const draftKey = `task:${wo.id}`;
  // Read once, on first render: was something typed here before (a reload, or a lost connection)?
  // Finished work shows what the server recorded, never an old draft.
  const [restored] = useState(() => (finished ? null : readDraft<TaskValues>(draftKey)));
  const form = useForm<TaskValues>({ defaultValues: restored ?? initialValues(wo, tagsById, units, now) });
  useKeepDraft(form, draftKey);
  // Re-renders as the technician types, so progress counts and range warnings stay current.
  const values = useWatch({ control: form.control });
  const { errors } = form.formState;
  const safety = wo.checklist.filter((i) => i.kind === "safety");
  const work = wo.checklist.filter((i) => i.kind !== "safety");
  const predictive = wo.source.kind === "prediction" && wo.source.refId !== null;

  /** The checklist as the server wants it: done flags and readings converted back to SI. */
  const results = (items: readonly ChecklistItem[]): ChecklistResult[] =>
    items.map((item) => {
      if (item.kind !== "reading") return { itemId: item.id, done: values.checks?.[item.id] === true, value: null };
      const shown = parseReading(values.readings?.[item.id]);
      const tag = item.tagId ? tagsById.get(item.tagId) : undefined;
      const value = shown === null ? null : tag ? fromDisplay(shown, tag.quantity, units) : shown;
      return { itemId: item.id, done: value !== null, value };
    });

  const safetyDone = safety.every((i) => values.checks?.[i.id] === true);
  const workResults = results(work);
  const doneCount = workResults.filter((r, i) => isChecklistItemDone({ kind: work[i]!.kind, done: r.done, value: r.value })).length;

  const start = async () => {
    try {
      await transition.mutateAsync({ workOrderId: wo.id, to: "in_progress", checklist: results(safety) });
    } catch {
      // shown by useWorkOrderActions; the ticks stay where they are
    }
  };

  const finish = form.handleSubmit(async (v) => {
    let ok = true;
    work.forEach((item, i) => {
      if (!item.required || isChecklistItemDone({ kind: item.kind, done: workResults[i]!.done, value: workResults[i]!.value })) return;
      ok = false;
      if (item.kind === "reading") form.setError(`readings.${item.id}`, { message: "field.readingRequired" });
      else form.setError(`checks.${item.id}`, { message: "field.stepRequired" });
    });
    const parsed = closeOutFields.safeParse({ findings: v.findings, laborHours: v.laborHours });
    if (!parsed.success) {
      ok = false;
      for (const issue of parsed.error.issues) form.setError(issue.path[0] as "findings" | "laborHours", { message: issue.message });
    }
    if (!ok || !parsed.success) return;
    try {
      await closeOut.mutateAsync({
        workOrderId: wo.id,
        failureMode: v.failureMode,
        cause: v.cause,
        remedy: v.remedy,
        findings: parsed.data.findings,
        laborHours: parsed.data.laborHours,
        predictionVerdict: v.predictionVerdict === "" ? null : v.predictionVerdict,
        checklist: [...results(safety), ...workResults],
      });
      clearDraft(draftKey);
      void navigate({ to: "/field", search: (prev) => prev });
    } catch {
      // shown by useWorkOrderActions; everything typed stays in the form and the draft
    }
  });

  const err = (key?: string) => (key ? t(key) : undefined);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 pb-8">
      <header className="flex flex-col gap-1">
        <Link to="/field" search={(prev) => prev} className="text-sm text-accent hover:underline">
          ← {t("field.back")}
        </Link>
        <p className="flex flex-wrap items-center gap-x-3 text-sm text-fg-muted">
          <span className="font-mono">{wo.number}</span>
          <span>{t(`workOrders.statuses.${wo.status}`)}</span>
          <PriorityLabel priority={wo.priority} />
        </p>
        <h1 className="text-2xl leading-tight font-semibold">{wo.title}</h1>
        <p className="text-sm text-fg-muted">
          <Link to="/assets/$assetId" params={{ assetId: wo.assetId }} search={(prev) => prev} className="font-mono hover:underline">
            {wo.assetId}
          </Link>
          {wo.scheduledStart && <> · {t("field.plannedStart", { time: formatTime(Date.parse(wo.scheduledStart)) })}</>}
        </p>
        {wo.description && <p className="mt-2 text-sm whitespace-pre-line">{wo.description}</p>}
        {predictive && (
          <Link
            to="/predictive/$predictionId"
            params={{ predictionId: wo.source.refId! }}
            search={(prev) => prev}
            className="text-sm text-accent hover:underline"
          >
            {t("field.whyRaised")}
          </Link>
        )}
      </header>

      {offline && (canStart || canFinish) && (
        <Notice tone="warning" icon={<CloudOff aria-hidden className="size-5 shrink-0" />}>
          {t("field.offlineKept")}
        </Notice>
      )}
      {restored && (
        <Notice tone="info" icon={<History aria-hidden className="size-5 shrink-0" />}>
          {t("field.restored")}
        </Notice>
      )}
      {wo.status === "scheduled" && <Notice tone="info">{t("field.waitingApproval")}</Notice>}
      {finished && <Notice tone="info">{t("field.finished", { status: t(`workOrders.statuses.${wo.status}`) })}</Notice>}

      <form onSubmit={finish} noValidate className="flex flex-col gap-5">
        <Section title={t("field.safetyTitle")} hint={canStart ? t("field.safetyHint") : undefined}>
          {safety.map((item) => (
            <Check key={item.id} label={item.label} disabled={!canStart} {...form.register(`checks.${item.id}`)} />
          ))}
          {canStart && (
            <div className="mt-2 flex flex-col gap-1">
              <Button size="lg" variant="primary" disabled={!safetyDone || offline || transition.isPending} onClick={() => void start()}>
                {t("field.startWork")}
              </Button>
              <p className="text-sm text-fg-muted" aria-live="polite">
                {offline ? t("field.waitingForConnection") : !safetyDone ? t("field.confirmSafetyFirst") : null}
              </p>
            </div>
          )}
        </Section>

        {(canFinish || finished) && (
          <Section title={t("field.workTitle")} hint={t("field.progress", { done: doneCount, total: work.length })}>
            {work.map((item) =>
              item.kind === "reading" ? (
                <Reading
                  key={item.id}
                  item={item}
                  tag={item.tagId ? tagsById.get(item.tagId) : undefined}
                  units={units}
                  typed={values.readings?.[item.id]}
                  error={err(errors.readings?.[item.id]?.message)}
                  disabled={!canFinish}
                  register={form.register(`readings.${item.id}`)}
                />
              ) : (
                <Check
                  key={item.id}
                  label={item.label}
                  error={err(errors.checks?.[item.id]?.message)}
                  disabled={!canFinish}
                  {...form.register(`checks.${item.id}`)}
                />
              ),
            )}
          </Section>
        )}

        {canFinish && (
          <Section title={t("field.closeOutTitle")} hint={t("woDialogs.closeOutIntro")}>
            <Field label={t("woDialogs.failureMode")} required>
              {(p) => (
                <select {...p} {...form.register("failureMode")} className={`${inputClass} h-12`}>
                  {FailureModeCode.options.map((c) => (
                    <option key={c} value={c}>
                      {c} — {t(`iso14224.mode.${c}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t("woDialogs.cause")} required>
              {(p) => (
                <select {...p} {...form.register("cause")} className={`${inputClass} h-12`}>
                  {FailureCauseCode.options.map((c) => (
                    <option key={c} value={c}>
                      {c} — {t(`iso14224.cause.${c.replace(".", "_")}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t("woDialogs.remedy")} required>
              {(p) => (
                <select {...p} {...form.register("remedy")} className={`${inputClass} h-12`}>
                  {RemedyCode.options.map((c) => (
                    <option key={c} value={c}>
                      {t(`iso14224.remedy.${c}`)}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label={t("woDialogs.findings")} hint={t("woDialogs.findingsHint")} error={err(errors.findings?.message)} required>
              {(p) => <textarea {...p} {...form.register("findings")} rows={5} className={inputClass} />}
            </Field>
            <Field label={t("woDialogs.laborHours")} hint={t("field.hoursHint")} error={err(errors.laborHours?.message)} required>
              {(p) => <input {...p} type="text" inputMode="decimal" {...form.register("laborHours")} className={`${inputClass} h-12`} />}
            </Field>
            {predictive && (
              <fieldset className="flex flex-col gap-1 rounded-md border border-line p-3">
                <legend className="px-1 text-sm font-medium">{t("woDialogs.verdict")}</legend>
                <p className="mb-1 text-xs text-fg-muted">{t("woDialogs.verdictHint")}</p>
                {PredictionFeedback.options.map((f) => (
                  <label key={f} className="flex min-h-12 items-center gap-3 text-base">
                    <input type="radio" value={f} {...form.register("predictionVerdict")} className="size-5" />
                    {t(`feedback.option.${f}`)}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="flex flex-col gap-1">
              <Button type="submit" size="lg" variant="primary" disabled={offline || closeOut.isPending}>
                {t("field.completeJob")}
              </Button>
              {offline && (
                <p className="text-sm text-fg-muted" aria-live="polite">
                  {t("field.waitingForConnection")}
                </p>
              )}
            </div>
          </Section>
        )}
      </form>
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2 rounded-lg border border-line bg-surface p-4">
      <legend className="px-1 text-lg font-semibold">{title}</legend>
      {hint && <p className="-mt-1 text-sm text-fg-muted">{hint}</p>}
      {children}
    </fieldset>
  );
}

function Notice({ tone, icon, children }: { tone: "info" | "warning"; icon?: ReactNode; children: ReactNode }) {
  return (
    <div
      role={tone === "warning" ? "alert" : "status"}
      className={
        tone === "warning"
          ? "flex items-start gap-2 rounded-lg border border-health-warning bg-[color-mix(in_srgb,var(--pdm-health-warning)_12%,transparent)] p-3 text-sm"
          : "flex items-start gap-2 rounded-lg border border-line bg-sunken p-3 text-sm"
      }
    >
      {icon}
      <span>{children}</span>
    </div>
  );
}

type CheckProps = { label: string; error?: string; disabled?: boolean } & ReturnType<ReturnType<typeof useForm<TaskValues>>["register"]>;

/** A big, glove-friendly checkbox row (48 px tall). */
function Check({ label, error, disabled, ...field }: CheckProps) {
  return (
    <div>
      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-1 text-base hover:bg-sunken has-[:disabled]:cursor-default has-[:disabled]:hover:bg-transparent">
        <input
          type="checkbox"
          {...field}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className="size-6 shrink-0 accent-[var(--pdm-accent)]"
        />
        <span>{label}</span>
      </label>
      {error && <p className="ml-10 text-sm text-health-critical">{error}</p>}
    </div>
  );
}

function Reading({
  item,
  tag,
  units,
  typed,
  error,
  disabled,
  register,
}: {
  item: ChecklistItem;
  tag: Tag | undefined;
  units: UnitSystem;
  typed: string | undefined;
  error?: string;
  disabled: boolean;
  register: ReturnType<ReturnType<typeof useForm<TaskValues>>["register"]>;
}) {
  const { t } = useTranslation();
  const unit = tag ? toDisplay(0, tag.quantity, units).unit : null;
  const show = (v: number | undefined) =>
    v === undefined || !tag ? undefined : formatMeasurement(toDisplay(v, tag.quantity, units).value);
  const low = show(tag?.limits.lowAlert);
  const high = show(tag?.limits.highAlert);
  const symbol = unit ? t(`unitSymbol.${unit}`) : "";
  const hint =
    low && high
      ? t("field.expectedBetween", { low, high, unit: symbol })
      : high
        ? t("field.expectedBelow", { high, unit: symbol })
        : undefined;

  const shown = parseReading(typed);
  const si = shown !== null && tag ? fromDisplay(shown, tag.quantity, units) : null;
  const outside =
    si !== null &&
    tag &&
    ((tag.limits.highAlert !== undefined && si > tag.limits.highAlert) || (tag.limits.lowAlert !== undefined && si < tag.limits.lowAlert));

  return (
    <div className="flex flex-col gap-1">
      <Field label={symbol ? `${item.label} (${symbol})` : item.label} hint={hint} error={error} required={item.required}>
        {(p) => (
          <input
            {...p}
            {...register}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            disabled={disabled}
            className={`${inputClass} h-12 text-base`}
          />
        )}
      </Field>
      {outside && (
        <p className="flex items-center gap-1.5 text-sm font-medium text-health-warning" aria-live="polite">
          <TriangleAlert aria-hidden className="size-4" />
          {t("field.outsideRange")}
        </p>
      )}
    </div>
  );
}
