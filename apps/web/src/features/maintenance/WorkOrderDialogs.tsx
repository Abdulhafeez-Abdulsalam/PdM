/**
 * The three moves that need more than a click:
 *  - Schedule: when, and who (both required).
 *  - Close-out: the technician's ISO 14224 coding, findings and hours — and, for predictive
 *    work, whether the predicted problem was really there (closes the feedback loop).
 *  - Cancel: a reason, for the audit trail.
 */
import { FailureCauseCode, FailureModeCode, PredictionFeedback, RemedyCode, type WorkOrder } from "@pdm/contracts";
import { Button, Field, Modal, inputClass } from "@pdm/ui";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { zodResolver } from "../../shared/forms";
import { useSimNow } from "../../shared/sim-time";
import { useUsers } from "../../shared/users";
import { useWorkOrderActions } from "./use-work-order-actions";

export type WorkOrderDialog = { kind: "schedule" | "closeOut" | "cancel"; workOrder: WorkOrder } | null;

export function WorkOrderDialogs({ dialog, onClose }: { dialog: WorkOrderDialog; onClose: () => void }) {
  return (
    <>
      <ScheduleDialog workOrder={dialog?.kind === "schedule" ? dialog.workOrder : null} onClose={onClose} />
      <CloseOutDialog workOrder={dialog?.kind === "closeOut" ? dialog.workOrder : null} onClose={onClose} />
      <CancelDialog workOrder={dialog?.kind === "cancel" ? dialog.workOrder : null} onClose={onClose} />
    </>
  );
}

// ─── Schedule ────────────────────────────────────────────────────────────────

const scheduleSchema = z.object({
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, { error: "forms.dateRequired" }),
  assigneeId: z.string().min(1, { error: "forms.assigneeRequired" }),
});

/** "2026-10-12T06:00" (what a datetime-local input uses, read as UTC) ↔ ISO. */
const toLocalInput = (ms: number) => new Date(ms).toISOString().slice(0, 16);

function ScheduleDialog({ workOrder, onClose }: { workOrder: WorkOrder | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={workOrder !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t("woDialogs.scheduleTitle")}
      description={workOrder?.title}
      closeLabel={t("common.close")}
    >
      {workOrder && <ScheduleForm workOrder={workOrder} onClose={onClose} />}
    </Modal>
  );
}

function ScheduleForm({ workOrder, onClose }: { workOrder: WorkOrder; onClose: () => void }) {
  const { t } = useTranslation();
  const { now } = useSimNow();
  const { technicians } = useUsers();
  const { transition } = useWorkOrderActions();
  const form = useForm<z.input<typeof scheduleSchema>, unknown, z.output<typeof scheduleSchema>>({
    resolver: zodResolver(scheduleSchema),
    defaultValues: {
      start: toLocalInput(
        workOrder.scheduledStart ? Date.parse(workOrder.scheduledStart) : Math.ceil(now / 3_600_000) * 3_600_000 + 86_400_000,
      ),
      assigneeId: workOrder.assigneeId ?? "",
    },
  });
  const { errors } = form.formState;
  const submit = form.handleSubmit(async ({ start, assigneeId }) => {
    try {
      await transition.mutateAsync({ workOrderId: workOrder.id, to: "scheduled", scheduledStart: `${start}:00Z`, assigneeId });
      onClose();
    } catch {
      // shown by useWorkOrderActions
    }
  });
  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label={t("woDialogs.start")} hint={t("woDialogs.startHint")} error={errors.start?.message && t(errors.start.message)} required>
        {(p) => <input {...p} type="datetime-local" {...form.register("start")} className={inputClass} />}
      </Field>
      <Field label={t("createWo.assignee")} error={errors.assigneeId?.message && t(errors.assigneeId.message)} required>
        {(p) => (
          <select {...p} {...form.register("assigneeId")} className={inputClass}>
            <option value="">{t("woDialogs.choose")}</option>
            {technicians.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Actions onCancel={onClose} submitLabel={t("woDialogs.schedule")} />
    </form>
  );
}

// ─── Close-out ───────────────────────────────────────────────────────────────

const closeOutSchema = z.object({
  failureMode: FailureModeCode,
  cause: FailureCauseCode,
  remedy: RemedyCode,
  findings: z.string().trim().min(10, { error: "forms.findingsTooShort" }).max(4000, { error: "forms.tooLong" }),
  laborHours: z.coerce
    .number({ error: "forms.hoursRequired" })
    .min(0, { error: "forms.hoursRequired" })
    .max(1000, { error: "forms.hoursRequired" }),
  predictionVerdict: z.union([PredictionFeedback, z.literal("")]),
});

function CloseOutDialog({ workOrder, onClose }: { workOrder: WorkOrder | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={workOrder !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t("woDialogs.closeOutTitle")}
      description={workOrder ? `${workOrder.number} · ${workOrder.title}` : undefined}
      closeLabel={t("common.close")}
      className="max-w-xl"
    >
      {workOrder && <CloseOutForm workOrder={workOrder} onClose={onClose} />}
    </Modal>
  );
}

function CloseOutForm({ workOrder, onClose }: { workOrder: WorkOrder; onClose: () => void }) {
  const { t } = useTranslation();
  const { closeOut } = useWorkOrderActions();
  const predictive = workOrder.source.kind === "prediction" && workOrder.source.refId !== null;
  const form = useForm<z.input<typeof closeOutSchema>, unknown, z.output<typeof closeOutSchema>>({
    resolver: zodResolver(closeOutSchema),
    defaultValues: { failureMode: "OTH", cause: "6.0", remedy: "repair", findings: "", laborHours: "", predictionVerdict: "" },
  });
  const { errors } = form.formState;
  const submit = form.handleSubmit(async (v) => {
    try {
      await closeOut.mutateAsync({
        workOrderId: workOrder.id,
        failureMode: v.failureMode,
        cause: v.cause,
        remedy: v.remedy,
        findings: v.findings,
        laborHours: v.laborHours,
        predictionVerdict: v.predictionVerdict === "" ? null : v.predictionVerdict,
      });
      onClose();
    } catch {
      // shown by useWorkOrderActions
    }
  });
  const err = (key?: string) => (key ? t(key) : undefined);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-fg-muted">{t("woDialogs.closeOutIntro")}</p>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label={t("woDialogs.failureMode")} required>
          {(p) => (
            <select {...p} {...form.register("failureMode")} className={inputClass}>
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
            <select {...p} {...form.register("cause")} className={inputClass}>
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
            <select {...p} {...form.register("remedy")} className={inputClass}>
              {RemedyCode.options.map((c) => (
                <option key={c} value={c}>
                  {t(`iso14224.remedy.${c}`)}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>
      <Field label={t("woDialogs.findings")} hint={t("woDialogs.findingsHint")} error={err(errors.findings?.message)} required>
        {(p) => <textarea {...p} {...form.register("findings")} rows={4} className={inputClass} />}
      </Field>
      <Field label={t("woDialogs.laborHours")} error={err(errors.laborHours?.message)} required>
        {(p) => (
          <input {...p} type="number" step="0.5" min="0" inputMode="decimal" {...form.register("laborHours")} className={inputClass} />
        )}
      </Field>
      {predictive && (
        <fieldset className="flex flex-col gap-1 rounded-md border border-line p-3">
          <legend className="px-1 text-sm font-medium">{t("woDialogs.verdict")}</legend>
          <p className="mb-1 text-xs text-fg-muted">{t("woDialogs.verdictHint")}</p>
          {PredictionFeedback.options.map((f) => (
            <label key={f} className="flex items-center gap-2 text-sm">
              <input type="radio" value={f} {...form.register("predictionVerdict")} />
              {t(`feedback.option.${f}`)}
            </label>
          ))}
        </fieldset>
      )}
      <Actions onCancel={onClose} submitLabel={t("woDialogs.complete")} />
    </form>
  );
}

// ─── Cancel ──────────────────────────────────────────────────────────────────

const cancelSchema = z.object({ note: z.string().trim().min(5, { error: "forms.reasonTooShort" }).max(1000, { error: "forms.tooLong" }) });

function CancelDialog({ workOrder, onClose }: { workOrder: WorkOrder | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { transition } = useWorkOrderActions();
  const form = useForm<z.input<typeof cancelSchema>, unknown, z.output<typeof cancelSchema>>({
    resolver: zodResolver(cancelSchema),
    defaultValues: { note: "" },
  });
  const submit = form.handleSubmit(async ({ note }) => {
    if (!workOrder) return;
    try {
      await transition.mutateAsync({ workOrderId: workOrder.id, to: "cancelled", note });
      form.reset();
      onClose();
    } catch {
      // shown by useWorkOrderActions
    }
  });
  const error = form.formState.errors.note?.message;
  return (
    <Modal
      open={workOrder !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t("woDialogs.cancelTitle")}
      description={workOrder?.title}
      closeLabel={t("common.close")}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label={t("shelve.reason")} error={error && t(error)} required>
          {(p) => <textarea {...p} {...form.register("note")} rows={3} className={inputClass} />}
        </Field>
        <Actions onCancel={onClose} submitLabel={t("woDialogs.cancelWo")} danger />
      </form>
    </Modal>
  );
}

function Actions({ onCancel, submitLabel, danger }: { onCancel: () => void; submitLabel: string; danger?: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="flex justify-end gap-2">
      <Button variant="ghost" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
      <Button type="submit" variant={danger ? "danger" : "primary"}>
        {submitLabel}
      </Button>
    </div>
  );
}
