/**
 * Shelve = temporarily hide an alarm (ISA-18.2). Always needs a reason and an expiry —
 * a shelved alarm must never be forgotten. Max 24 hours (enforced by the backend too).
 */
import type { Alarm } from "@pdm/contracts";
import { Button, Field, Modal, inputClass } from "@pdm/ui";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { zodResolver } from "../../shared/forms";
import { toIso, useSimNow } from "../../shared/sim-time";
import { useAlarmActions } from "./use-alarm-actions";

const DURATIONS = ["1", "4", "8", "12", "24"] as const;

const schema = z.object({
  reason: z.string().trim().min(5, { error: "forms.reasonTooShort" }).max(500, { error: "forms.tooLong" }),
  hours: z.enum(DURATIONS),
});
type Values = z.infer<typeof schema>;

export function ShelveDialog({ alarm, onClose }: { alarm: Alarm | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { now } = useSimNow();
  const { shelve } = useAlarmActions();
  const form = useForm<z.input<typeof schema>, unknown, Values>({ resolver: zodResolver(schema), defaultValues: { reason: "", hours: "4" } });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async (values) => {
    if (!alarm) return;
    try {
      await shelve.mutateAsync({ alarmId: alarm.id, reason: values.reason, until: toIso(now + Number(values.hours) * 3_600_000) });
      form.reset();
      onClose();
    } catch {
      // The error message is shown by useAlarmActions; keep the dialog open so the user can retry.
    }
  });

  return (
    <Modal
      open={alarm !== null}
      onOpenChange={(open) => !open && onClose()}
      title={t("shelve.title")}
      description={alarm ? `${alarm.message} — ${alarm.assetId}` : undefined}
      closeLabel={t("common.close")}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label={t("shelve.reason")} hint={t("shelve.reasonHint")} error={errors.reason?.message && t(errors.reason.message)} required>
          {(p) => <textarea {...p} {...form.register("reason")} rows={3} className={inputClass} />}
        </Field>
        <Field label={t("shelve.duration")} required>
          {(p) => (
            <select {...p} {...form.register("hours")} className={inputClass}>
              {DURATIONS.map((h) => (
                <option key={h} value={h}>{t("shelve.hours", { count: Number(h) })}</option>
              ))}
            </select>
          )}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          <Button type="submit" variant="primary" disabled={isSubmitting}>{t("shelve.submit")}</Button>
        </div>
      </form>
    </Modal>
  );
}
