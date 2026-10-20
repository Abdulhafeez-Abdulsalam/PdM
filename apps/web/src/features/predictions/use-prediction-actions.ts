/** Feedback and triage on predictions; refreshes everything that shows predictions afterwards. */
import { useApiMutation } from "@pdm/api-client";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { useToasts } from "../../shared/toast";

const AFFECTED = ["predictions.list", "predictions.get", "predictions.feedbackSummary", "risks.top", "events.list"];

export function usePredictionActions() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const refresh = () => AFFECTED.forEach((key) => void client.invalidateQueries({ queryKey: [key] }));
  const failed = (error: Error) => toast("error", t("alarmActions.failed", { reason: error.message }));

  const feedback = useApiMutation("predictions.feedback", {
    onSuccess: (p) => toast("success", t("feedback.saved", { label: t(`feedback.short.${p.feedback ?? "true_positive"}`) })),
    onError: failed,
    onSettled: refresh,
  });
  const triage = useApiMutation("predictions.triage", {
    onSuccess: (p) => toast("success", t("triage.done", { status: t(`prediction.status.${p.status}`) })),
    onError: failed,
    onSettled: refresh,
  });
  return { feedback, triage };
}
