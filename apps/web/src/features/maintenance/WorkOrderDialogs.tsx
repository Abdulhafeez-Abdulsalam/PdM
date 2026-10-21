/**
 * Moves that need more than a click:
 *  - Schedule: when, and who (both required).
 *  - Cancel: a reason, for the audit trail.
 * (Completing work needs the checklist and close-out: see features/field/TaskPage.)
 */
import type { WorkOrder } from "@pdm/contracts";
import { Button, Field, Modal, inputClass } from "@pdm/ui";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { zodResolver } from "../../shared/forms";
import { useSimNow } from "../../shared/sim-time";
import { useUsers } from "../../shared/users";
import { useWorkOrderActions } from "./use-work-order-actions";

export type WorkOrderDialog = { kind: "schedule" | "cancel"; workOrder: WorkOrder } | null;

export function WorkOrderDialogs({ dialog, onClose }: { dialog: WorkOrderDialog; onClose: () => void }) {
  return (
    <>
      <ScheduleDialog workOrder={dialog?.kind === "schedule" ? dialog.workOrder : null} onClose={onClose} />
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

/** Planned work gets scheduled; scheduled or approved work gets rescheduled (same questions). */
const isReschedule = (wo: WorkOrder | null) => wo !== null && (wo.status === "scheduled" || wo.status === "approved");

function ScheduleDialog({ workOrder, onClose }: { workOrder: WorkOrder | null; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal
      open={workOrder !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t(isReschedule(workOrder) ? "woDialogs.rescheduleTitle" : "woDialogs.scheduleTitle")}
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
  const { transition, reschedule } = useWorkOrderActions();
  const moving = isReschedule(workOrder);
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
      if (moving) await reschedule.mutateAsync({ workOrderId: workOrder.id, scheduledStart: `${start}:00Z`, assigneeId });
      else await transition.mutateAsync({ workOrderId: workOrder.id, to: "scheduled", scheduledStart: `${start}:00Z`, assigneeId });
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
      {moving && workOrder.status === "approved" && <p className="text-sm text-fg-muted">{t("woDialogs.reapprovalNote")}</p>}
      <Actions onCancel={onClose} submitLabel={t(moving ? "woDialogs.reschedule" : "woDialogs.schedule")} />
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
