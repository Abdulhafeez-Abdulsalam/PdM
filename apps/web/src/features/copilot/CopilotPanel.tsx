/**
 * The copilot (Phase 4, chunk 10; ADR-0010): ask the data a question in plain words. Answers come
 * from the scripted provider, each paragraph with chips pointing at its evidence. Suggested
 * actions are only suggestions: "open" is a link, and raising a work order asks first, in a
 * dialog that says exactly what will be created. Open it from the top bar or with ".".
 */
import { useApiMutation } from "@pdm/api-client";
import type { CopilotAction, CopilotAnswer } from "@pdm/contracts";
import { Button, Modal, Sheet, inputClass } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { CitationChip } from "../../shared/CitationChip";
import { useOverlays } from "../../shared/overlays";
import { usePreferences } from "../../shared/preferences";
import { canDo } from "../../shared/roles/roles";
import { useGlobalSearch } from "../../shared/time-range";
import { useToasts } from "../../shared/toast";

const EXAMPLES = ["example1", "example2", "example3", "example4"] as const;

export function CopilotPanel() {
  const { t } = useTranslation();
  const open = useOverlays((s) => s.open === "copilot");
  const { show, close, answers, addAnswer, takePending } = useOverlays();
  const { scopeId } = useGlobalSearch();
  const [question, setQuestion] = useState("");
  const [confirming, setConfirming] = useState<Extract<CopilotAction, { kind: "create_work_order" }> | null>(null);
  const toast = useToasts((s) => s.show);
  const end = useRef<HTMLDivElement>(null);

  const askMutation = useApiMutation("copilot.ask", {
    onSuccess: (a) => {
      addAnswer(a);
      setQuestion("");
    },
    onError: (e) => toast("error", e.message),
  });
  const { mutate } = askMutation;
  const ask = useCallback((q: string) => q.trim() && mutate({ question: q.trim(), scopeId }), [mutate, scopeId]);

  // A question sent from the command palette is asked as soon as the panel opens.
  useEffect(() => {
    if (!open) return;
    const pending = takePending();
    if (pending) ask(pending);
  }, [open, takePending, ask]);
  // Keep the newest answer in view (scrollIntoView is missing in some test environments).
  useEffect(() => {
    if (answers.length) end.current?.scrollIntoView?.({ block: "end" });
  }, [answers.length]);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(question);
  };

  return (
    <>
      <Sheet
        open={open}
        onOpenChange={(o) => (o ? show("copilot") : close())}
        title={t("copilot.title")}
        description={t("copilot.description")}
        closeLabel={t("common.close")}
      >
        <div className="flex min-h-full flex-col gap-4">
          {answers.length === 0 ? (
            <div className="flex flex-col gap-2 text-sm">
              <p className="text-fg-muted">{t("copilot.empty")}</p>
              <ul className="flex flex-col gap-1">
                {EXAMPLES.map((k) => (
                  <li key={k}>
                    <Button size="sm" variant="ghost" onClick={() => ask(t(`copilot.${k}`))}>
                      {t(`copilot.${k}`)}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <ol aria-label={t("copilot.conversation")} className="flex flex-col gap-4">
              {answers.map((a, i) => (
                <li key={`${a.answeredAt}-${i}`}>
                  <AnswerView answer={a} onAsk={ask} onRaise={setConfirming} onNavigate={close} />
                </li>
              ))}
            </ol>
          )}
          <div ref={end} />
          <p aria-live="polite" className="sr-only">
            {askMutation.isPending ? t("copilot.thinking") : (answers.at(-1)?.paragraphs[0]?.text ?? "")}
          </p>
          <form onSubmit={submit} className="mt-auto flex gap-2 border-t border-line pt-3">
            <label htmlFor="copilot-question" className="sr-only">
              {t("copilot.ask")}
            </label>
            <input
              id="copilot-question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              placeholder={t("copilot.placeholder")}
              className={inputClass}
              autoComplete="off"
            />
            <Button type="submit" variant="primary" disabled={!question.trim() || askMutation.isPending}>
              {t("copilot.send")}
            </Button>
          </form>
        </div>
      </Sheet>
      {confirming && <ConfirmWorkOrder action={confirming} onClose={() => setConfirming(null)} />}
    </>
  );
}

function AnswerView({
  answer,
  onAsk,
  onRaise,
  onNavigate,
}: {
  answer: CopilotAnswer;
  onAsk: (q: string) => void;
  onRaise: (a: Extract<CopilotAction, { kind: "create_work_order" }>) => void;
  onNavigate: () => void;
}) {
  const { t } = useTranslation();
  return (
    <article className="flex flex-col gap-2 text-sm">
      <p className="self-end rounded-lg bg-sunken px-3 py-1.5 font-medium">{answer.question}</p>
      {answer.understoodAs && <p className="text-xs text-fg-muted">{t("copilot.readAs", { what: answer.understoodAs })}</p>}
      {answer.paragraphs.map((p, i) => (
        <p key={i}>
          {p.text}{" "}
          {p.citations.map((c) => (
            <span key={`${c.kind}-${c.id}`} className="mr-1 inline-block">
              <CitationChip citation={c} />
            </span>
          ))}
        </p>
      ))}
      {answer.actions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {answer.actions.map((a) =>
            a.kind === "open" ? (
              <Link
                key={a.label}
                to={a.path as "/"}
                onClick={onNavigate}
                className="rounded-md border border-line px-2 py-1 text-accent underline"
              >
                {a.label}
              </Link>
            ) : (
              <Button key={a.label} size="sm" variant="primary" onClick={() => onRaise(a)}>
                {a.label}…
              </Button>
            ),
          )}
        </div>
      )}
      {answer.followUps.length > 0 && (
        <div className="flex flex-col gap-1">
          <p className="text-xs text-fg-muted">{t("copilot.followUps")}</p>
          <ul className="flex flex-wrap gap-1">
            {answer.followUps.map((f) => (
              <li key={f}>
                <Button size="sm" variant="ghost" onClick={() => onAsk(f)}>
                  {f}
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="flex items-center gap-1 text-xs text-fg-muted">
        <Sparkles aria-hidden className="size-3" />
        {t("copilot.generatedBy", { provider: answer.generatedBy })}
      </p>
    </article>
  );
}

/** The copilot never acts on its own: this says exactly what will be created and waits for a yes. */
function ConfirmWorkOrder({ action, onClose }: { action: Extract<CopilotAction, { kind: "create_work_order" }>; onClose: () => void }) {
  const { t } = useTranslation();
  const role = usePreferences((p) => p.role);
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const may = canDo(role, "prediction.createWorkOrder");
  const create = useApiMutation("workOrders.create", {
    onSuccess: (wo) => {
      void client.invalidateQueries({ queryKey: ["predictions.list"] });
      void client.invalidateQueries({ queryKey: ["workOrders.list"] });
      toast("success", t("copilot.raised", { number: wo.number }));
      onClose();
    },
    onError: (e) => toast("error", e.message),
  });
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("copilot.confirmTitle")}
      description={t("copilot.confirmIntro")}
      closeLabel={t("common.close")}
    >
      <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
        <dt className="text-fg-muted">{t("copilot.confirmWhat")}</dt>
        <dd>{action.title}</dd>
        <dt className="text-fg-muted">{t("copilot.confirmAsset")}</dt>
        <dd className="font-mono">{action.assetId}</dd>
        <dt className="text-fg-muted">{t("copilot.confirmFrom")}</dt>
        <dd className="font-mono">{action.predictionId}</dd>
      </dl>
      {!may && <p className="mb-3 text-sm text-health-warning">{t("copilot.notAllowed")}</p>}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          disabled={!may || create.isPending}
          onClick={() =>
            create.mutate({
              title: action.title,
              description: t("copilot.woDescription"),
              assetId: action.assetId,
              type: "predictive",
              priority: "high",
              assigneeId: null,
              dueAt: null,
              source: { kind: "prediction", refId: action.predictionId },
              evidence: null,
            })
          }
        >
          {t("copilot.confirm")}
        </Button>
      </div>
    </Modal>
  );
}
