/**
 * One prediction, full page (/predictive/PRED-0022): what to decide, the anomaly history,
 * the complete evidence, and the feedback loop — "was the model right?".
 */
import { useApiQuery } from "@pdm/api-client";
import type { Prediction, PredictionFeedback } from "@pdm/contracts";
import { Button, EmptyState, Field, Modal, Skeleton, inputClass } from "@pdm/ui";
import { Link, useParams } from "@tanstack/react-router";
import { Check, ClipboardPlus, RotateCcw, SearchX, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatDate, formatProbability } from "../../shared/format";
import { zodResolver } from "../../shared/forms";
import { usePreferences } from "../../shared/preferences";
import { canDo } from "../../shared/roles/roles";
import { CreateWorkOrderDialog, type WorkOrderTarget } from "../alarms/CreateWorkOrderDialog";
import { AnomalyChart } from "./AnomalyChart";
import { PredictionDetail } from "./PredictionDetail";
import { usePredictionActions } from "./use-prediction-actions";

const FEEDBACK: readonly PredictionFeedback[] = ["true_positive", "false_positive", "found_something_else"];

export function PredictionPage() {
  const { t } = useTranslation();
  const { predictionId } = useParams({ from: "/predictive/$predictionId" });
  const prediction = useApiQuery("predictions.get", { predictionId });

  useEffect(() => {
    document.title = `${predictionId} · ${t("modules.predictive.name")} · ${t("app.name")}`;
  }, [predictionId, t]);

  if (prediction.isError) {
    return (
      <EmptyState icon={<SearchX className="size-8" />} title={t("prediction.notFound")}>
        <Link to="/predictive" search={(prev) => prev} className="text-accent underline">
          {t("predictionPage.back")}
        </Link>
      </EmptyState>
    );
  }
  if (!prediction.data) return <Skeleton className="h-96" />;
  const p = prediction.data;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link to="/predictive" search={(prev) => prev} className="text-sm text-accent hover:underline">
            ← {t("predictionPage.back")}
          </Link>
          <h1 className="text-2xl font-semibold">{p.failureMode.label}</h1>
          <p className="text-fg-muted">
            <Link
              to="/assets/$assetId/$tab"
              params={{ assetId: p.assetId, tab: "health" }}
              search={(prev) => prev}
              className="font-mono hover:underline"
            >
              {p.assetId}
            </Link>{" "}
            · {p.id} · {t(`prediction.status.${p.status}`)}
          </p>
        </div>
        <Actions prediction={p} />
      </header>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        <div className="flex flex-col gap-4 xl:col-span-8">
          <section className="rounded-lg border border-line bg-surface p-4" aria-labelledby="anomaly-title">
            <h2 id="anomaly-title" className="mb-1 font-semibold">
              {t("anomaly.title")}
            </h2>
            <AnomalyChart assetId={p.assetId} />
          </section>
          <section className="rounded-lg border border-line bg-surface p-4" aria-label={t("assets.predictionDetail")}>
            <PredictionDetail predictionId={p.id} />
          </section>
        </div>
        <div className="flex flex-col gap-4 xl:col-span-4">
          <FeedbackPanel prediction={p} />
          <SimilarCases prediction={p} />
        </div>
      </div>
    </div>
  );
}

/** Acknowledge / dismiss / reopen and raise a work order — for the roles allowed to. */
function Actions({ prediction: p }: { prediction: Prediction }) {
  const { t } = useTranslation();
  const role = usePreferences((s) => s.role);
  const { triage } = usePredictionActions();
  const [dismissing, setDismissing] = useState(false);
  const [woTarget, setWoTarget] = useState<WorkOrderTarget | null>(null);
  const mayTriage = canDo(role, "prediction.triage");
  const mayRaise = canDo(role, "prediction.createWorkOrder") && !p.workOrderId && p.status !== "closed" && p.status !== "dismissed";

  return (
    <div className="flex flex-wrap gap-2">
      {mayTriage && p.status === "open" && (
        <Button onClick={() => triage.mutate({ predictionId: p.id, action: "acknowledge" })}>
          <Check aria-hidden className="size-4" />
          {t("triage.acknowledge")}
        </Button>
      )}
      {mayTriage && (p.status === "open" || p.status === "acknowledged") && (
        <Button variant="danger" onClick={() => setDismissing(true)}>
          <X aria-hidden className="size-4" />
          {t("triage.dismiss")}
        </Button>
      )}
      {mayTriage && (p.status === "dismissed" || p.status === "acknowledged") && (
        <Button onClick={() => triage.mutate({ predictionId: p.id, action: "reopen" })}>
          <RotateCcw aria-hidden className="size-4" />
          {t("triage.reopen")}
        </Button>
      )}
      {mayRaise && (
        <Button variant="primary" onClick={() => setWoTarget({ kind: "prediction", prediction: p })}>
          <ClipboardPlus aria-hidden className="size-4" />
          {t("createWo.title")}
        </Button>
      )}
      <DismissDialog prediction={dismissing ? p : null} onClose={() => setDismissing(false)} />
      <CreateWorkOrderDialog target={woTarget} onClose={() => setWoTarget(null)} />
    </div>
  );
}

const dismissSchema = z.object({
  reason: z.string().trim().min(5, { error: "forms.reasonTooShort" }).max(500, { error: "forms.tooLong" }),
});

function DismissDialog({ prediction, onClose }: { prediction: Prediction | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { triage } = usePredictionActions();
  const form = useForm<z.input<typeof dismissSchema>, unknown, z.output<typeof dismissSchema>>({
    resolver: zodResolver(dismissSchema),
    defaultValues: { reason: "" },
  });
  const submit = form.handleSubmit(async ({ reason }) => {
    if (!prediction) return;
    try {
      await triage.mutateAsync({ predictionId: prediction.id, action: "dismiss", reason });
      form.reset();
      onClose();
    } catch {
      // The message is shown by usePredictionActions; keep the dialog open.
    }
  });
  const error = form.formState.errors.reason?.message;
  return (
    <Modal
      open={prediction !== null}
      onOpenChange={(o) => !o && onClose()}
      title={t("triage.dismissTitle")}
      description={prediction?.failureMode.label}
      closeLabel={t("common.close")}
    >
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Field label={t("shelve.reason")} hint={t("triage.dismissHint")} error={error && t(error)} required>
          {(props) => <textarea {...props} {...form.register("reason")} rows={3} className={inputClass} />}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" variant="danger">
            {t("triage.dismiss")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

/** The feedback loop: one click to say whether the model was right. */
function FeedbackPanel({ prediction: p }: { prediction: Prediction }) {
  const { t } = useTranslation();
  const role = usePreferences((s) => s.role);
  const { feedback } = usePredictionActions();
  const may = canDo(role, "prediction.feedback");

  return (
    <section className="rounded-lg border border-line bg-surface p-4" aria-labelledby="feedback-title">
      <h2 id="feedback-title" className="font-semibold">
        {t("feedback.title")}
      </h2>
      <p className="mb-3 text-sm text-fg-muted">{t("feedback.intro")}</p>
      {may ? (
        <div role="group" aria-label={t("feedback.title")} className="flex flex-col gap-2">
          {FEEDBACK.map((f) => (
            <Button
              key={f}
              aria-pressed={p.feedback === f}
              variant={p.feedback === f ? "primary" : "secondary"}
              disabled={feedback.isPending}
              onClick={() => feedback.mutate({ predictionId: p.id, feedback: f })}
              className="justify-start"
            >
              {t(`feedback.option.${f}`)}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm">{p.feedback ? t(`feedback.option.${p.feedback}`) : t("feedback.none")}</p>
      )}
    </section>
  );
}

/** Past predictions of the same failure mode — "have we seen this before, and was it real?" */
function SimilarCases({ prediction: p }: { prediction: Prediction }) {
  const { t } = useTranslation();
  const others = useApiQuery("predictions.list", { status: ["closed", "dismissed", "actioned"], sort: "newest", limit: 200 });
  const similar = (others.data?.items ?? []).filter((x) => x.id !== p.id && x.failureMode.code === p.failureMode.code).slice(0, 6);

  return (
    <section className="rounded-lg border border-line bg-surface p-4" aria-labelledby="similar-title">
      <h2 id="similar-title" className="mb-2 font-semibold">
        {t("similar.title")}
      </h2>
      {others.isPending ? (
        <Skeleton className="h-24" />
      ) : similar.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("similar.none")}</p>
      ) : (
        <ul className="flex flex-col gap-2 text-sm">
          {similar.map((x) => (
            <li key={x.id}>
              <Link to="/predictive/$predictionId" params={{ predictionId: x.id }} search={(prev) => prev} className="hover:underline">
                {x.failureMode.label} · <span className="font-mono text-xs">{x.assetId}</span>
              </Link>
              <span className="block text-xs text-fg-muted">
                {formatDate(x.detectedAt)} · {formatProbability(x.probability)} · {t(`prediction.status.${x.status}`)}
                {x.feedback && ` · ${t(`feedback.short.${x.feedback}`)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
