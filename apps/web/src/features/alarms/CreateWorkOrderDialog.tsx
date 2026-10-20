/**
 * Alarm → work order (acceptance criterion C: under 30 seconds). Everything is pre-filled —
 * title, description, priority, due date, a technician from the asset's site, and a snapshot
 * of the readings at this moment — so the usual path is: open, check, Create.
 */
import { useApiMutation, useApiQuery } from "@pdm/api-client";
import { WorkOrderPriority, type Alarm, type EvidenceSnapshot } from "@pdm/contracts";
import { Button, Field, Modal, Skeleton, inputClass } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { zodResolver } from "../../shared/forms";
import { usePreferences } from "../../shared/preferences";
import { toIso, useSimNow } from "../../shared/sim-time";
import { useToasts } from "../../shared/toast";
import { formatMeasurement, toDisplay } from "../../shared/units";
import { keyTags } from "../assets/OverviewTab";
import { draftFromAlarm, suggestAssignees } from "./work-order-draft";

const schema = z.object({
  title: z.string().trim().min(3, { error: "forms.titleTooShort" }).max(120, { error: "forms.tooLong" }),
  description: z.string().max(4000, { error: "forms.tooLong" }),
  priority: WorkOrderPriority,
  assigneeId: z.string().min(1, { error: "forms.assigneeRequired" }),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "forms.dateRequired" }),
  attachSnapshot: z.boolean(),
});
type Values = z.infer<typeof schema>;

export function CreateWorkOrderDialog({ alarm, onClose }: { alarm: Alarm | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={alarm !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t("createWo.title")}
      description={alarm ? t("createWo.fromAlarm", { id: alarm.id }) : undefined}
      closeLabel={t("common.close")}
      className="max-w-xl"
    >
      {alarm && <WorkOrderForm alarm={alarm} onDone={onClose} />}
    </Modal>
  );
}

function WorkOrderForm({ alarm, onDone }: { alarm: Alarm; onDone: () => void }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const units = usePreferences((p) => p.units);
  const { now } = useSimNow();

  const asset = useApiQuery("assets.get", { assetId: alarm.assetId });
  const tags = useApiQuery("assets.tags", { assetId: alarm.assetId });
  const technicians = useApiQuery("users.list", { role: "field_technician", limit: 100 });
  const snapshotTags = useMemo(() => keyTags(tags.data?.items ?? [], 8), [tags.data]);
  const latest = useApiQuery("timeseries.latest", { tagIds: snapshotTags.map((tg) => tg.id) }, { enabled: snapshotTags.length > 0 });

  const assignees = useMemo(
    () => (technicians.data && asset.data ? suggestAssignees(technicians.data.items, asset.data.siteId) : []),
    [technicians.data, asset.data],
  );

  const valueText = useMemo(() => {
    if (alarm.value === null || !alarm.quantity) return null;
    const v = toDisplay(alarm.value, alarm.quantity, units);
    return `${formatMeasurement(v.value)} ${t(`unitSymbol.${v.unit}`)}`.trim();
  }, [alarm, units, t]);

  const form = useForm<z.input<typeof schema>, unknown, Values>({ resolver: zodResolver(schema) });
  // Ready only once the readings snapshot has arrived too — otherwise a quick "Create" would
  // attach no evidence (found by timing the flow in the browser).
  const snapshotReady = Boolean(tags.data) && (snapshotTags.length === 0 || Boolean(latest.data) || latest.isError);
  const ready = Boolean(asset.data && technicians.data) && snapshotReady;

  // Fill the form once the asset and technician list have loaded.
  useEffect(() => {
    if (!ready) return;
    const draft = draftFromAlarm(alarm, now, valueText);
    form.reset({ ...draft, assigneeId: assignees[0]?.id ?? "", attachSnapshot: true });
    // Deliberately runs only when the data first arrives (`ready`): later clock ticks must not
    // overwrite what the user has typed.
  }, [ready]);

  const create = useApiMutation("workOrders.create");
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    const evidence: EvidenceSnapshot | null =
      values.attachSnapshot && latest.data ? { capturedAt: toIso(now), values: latest.data.values, note: null } : null;
    try {
      const wo = await create.mutateAsync({
        title: values.title,
        description: values.description,
        assetId: alarm.assetId,
        type: alarm.kind === "prediction" ? "predictive" : "corrective",
        priority: values.priority,
        assigneeId: values.assigneeId,
        dueAt: `${values.dueDate}T23:59:59Z`,
        source: { kind: "alarm", refId: alarm.id },
        evidence,
      });
      const who = assignees.find((u) => u.id === values.assigneeId)?.name ?? "";
      toast("success", t("createWo.created", { number: wo.number, who }));
      void client.invalidateQueries({ queryKey: ["workOrders.list"] });
      void client.invalidateQueries({ queryKey: ["alarms.list"] });
      onDone();
    } catch (error) {
      toast("error", t("createWo.failed", { reason: (error as Error).message }));
    }
  });

  if (!ready) {
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}
      </div>
    );
  }

  const err = (key?: string) => (key ? t(key) : undefined);
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label={t("createWo.titleField")} error={err(errors.title?.message)} required>
        {(p) => <input {...p} {...form.register("title")} className={inputClass} />}
      </Field>
      <Field label={t("createWo.description")} error={err(errors.description?.message)}>
        {(p) => <textarea {...p} {...form.register("description")} rows={4} className={inputClass} />}
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={t("createWo.priority")} required>
          {(p) => (
            <select {...p} {...form.register("priority")} className={inputClass}>
              {WorkOrderPriority.options.map((v) => <option key={v} value={v}>{t(`workOrders.priorities.${v}`)}</option>)}
            </select>
          )}
        </Field>
        <Field label={t("createWo.due")} error={err(errors.dueDate?.message)} required>
          {(p) => <input {...p} type="date" {...form.register("dueDate")} className={inputClass} />}
        </Field>
      </div>
      <Field label={t("createWo.assignee")} hint={t("createWo.assigneeHint")} error={err(errors.assigneeId?.message)} required>
        {(p) => (
          <select {...p} {...form.register("assigneeId")} className={inputClass}>
            {assignees.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </select>
        )}
      </Field>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" {...form.register("attachSnapshot")} />
        <span>
          {t("createWo.attachSnapshot", { count: latest.data?.values.length ?? 0 })}
          <span className="block text-xs text-fg-muted">{t("createWo.snapshotHint")}</span>
        </span>
      </label>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>{t("common.cancel")}</Button>
        <Button type="submit" variant="primary" disabled={isSubmitting}>{t("createWo.submit")}</Button>
      </div>
    </form>
  );
}
