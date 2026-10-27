/**
 * Edit a tag's alert / alarm / trip limits (Phase 4, chunk 8), for roles with `threshold.edit`.
 * Values are typed in the user's units and sent in SI. The alarm engine uses the new limits from
 * its next check, including for faults already developing, and the change goes in the audit log.
 */
import { useApiMutation } from "@pdm/api-client";
import type { TagLimits, TagRow } from "@pdm/contracts";
import { Button, Field, Modal, inputClass } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../shared/preferences";
import { useToasts } from "../../shared/toast";
import { formatMeasurement, fromDisplay, toDisplay } from "../../shared/units";

/** Lowest to highest: each set limit must be above the one before. */
const ORDER = ["lowTrip", "lowAlarm", "lowAlert", "highAlert", "highAlarm", "highTrip"] as const;
type LimitKey = (typeof ORDER)[number];

export function EditLimitsDialog({ tag, onClose }: { tag: TagRow; onClose: () => void }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const unit = t(`unitSymbol.${toDisplay(0, tag.quantity, units).unit}`);
  const [values, setValues] = useState<Record<LimitKey, string>>(() => {
    const shown = (v: number | undefined) =>
      v === undefined ? "" : formatMeasurement(toDisplay(v, tag.quantity, units).value).replace(/,/g, "");
    return Object.fromEntries(ORDER.map((k) => [k, shown(tag.limits[k])])) as Record<LimitKey, string>;
  });
  const [error, setError] = useState<string | null>(null);
  const save = useApiMutation("admin.setLimits", {
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["data.tags"] });
      void client.invalidateQueries({ queryKey: ["assets.tags"] });
      void client.invalidateQueries({ queryKey: ["admin.audit"] });
      toast("success", t("limits.saved", { tag: tag.id }));
      onClose();
    },
    onError: (e) => setError(e.message),
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const limits: TagLimits = {};
    for (const k of ORDER) {
      const text = values[k].trim();
      if (text === "") continue;
      const n = Number(text);
      if (!Number.isFinite(n)) return setError(t("limits.notNumber", { limit: t(`limits.label.${k}`) }));
      limits[k] = fromDisplay(n, tag.quantity, units);
    }
    const set = ORDER.filter((k) => limits[k] !== undefined);
    if (set.some((k, i) => i > 0 && limits[k]! <= limits[set[i - 1]!]!)) return setError(t("limits.order"));
    setError(null);
    save.mutate({ tagId: tag.id, limits });
  };

  return (
    <Modal
      open
      onOpenChange={(open) => !open && onClose()}
      title={t("limits.title", { tag: tag.id })}
      description={t("limits.description", { what: tag.description })}
      closeLabel={t("common.close")}
    >
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <div className="grid grid-cols-2 gap-3">
          {ORDER.map((k) => (
            <Field key={k} label={t("limits.withUnit", { limit: t(`limits.label.${k}`), unit })}>
              {(p) => (
                <input
                  {...p}
                  inputMode="decimal"
                  value={values[k]}
                  onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))}
                  className={inputClass}
                />
              )}
            </Field>
          ))}
        </div>
        <p className="text-sm text-fg-muted">{t("limits.hint")}</p>
        {error && (
          <p role="alert" className="text-sm font-medium text-health-critical">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="primary" disabled={save.isPending}>
            {t("limits.save")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
