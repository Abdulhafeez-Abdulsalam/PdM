/**
 * One root-cause analysis: what happened (the asset's timeline), why (5 Whys and a fishbone),
 * the root cause in one sentence, and the corrective actions, each of which can become a work
 * order. The form is edited locally and saved with one button; closing needs a root cause.
 */
import { useApiMutation, useApiQuery } from "@pdm/api-client";
import { FISHBONE_CATEGORIES, type FishboneCategory, type Fishbone, type Rca } from "@pdm/contracts";
import { Button, EmptyState, Field, Skeleton, inputClass } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useParams } from "@tanstack/react-router";
import { SearchX, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../shared/format";
import { useToasts } from "../../shared/toast";
import { FishboneDiagram } from "./Fishbone";
import { ReliabilityNav } from "./ReliabilityNav";

export function RcaPage() {
  const { t } = useTranslation();
  const { rcaId } = useParams({ from: "/reliability/rca/$rcaId" });
  const rca = useApiQuery("rca.get", { rcaId }, { retry: false });

  useEffect(() => {
    document.title = `${rcaId} · ${t("rca.listTitle")} · ${t("app.name")}`;
  }, [rcaId, t]);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <ReliabilityNav />
      {rca.isPending ? (
        <Skeleton className="h-96" />
      ) : !rca.data ? (
        <EmptyState icon={<SearchX className="size-8" />} title={t("rca.notFound", { id: rcaId })}>
          <Link to="/reliability/rca" className="text-accent underline">
            {t("rca.backToList")}
          </Link>
        </EmptyState>
      ) : (
        // A new editor for each investigation, so its form starts from that investigation's saved state.
        <Editor key={rca.data.id} rca={rca.data} />
      )}
    </div>
  );
}

function Editor({ rca }: { rca: Rca }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const [whys, setWhys] = useState(rca.whys);
  const [fishbone, setFishbone] = useState<Fishbone>(rca.fishbone);
  const [rootCause, setRootCause] = useState(rca.rootCause);
  const closed = rca.status === "closed";
  const dirty = JSON.stringify([whys, fishbone, rootCause]) !== JSON.stringify([rca.whys, rca.fishbone, rca.rootCause]);

  const done = (next: Rca, message: string) => {
    client.setQueryData(["rca.get", { rcaId: next.id }], next);
    void client.invalidateQueries({ queryKey: ["rca.list"] });
    toast("success", message);
  };
  const update = useApiMutation("rca.update", { onError: (e) => toast("error", e.message) });
  const save = (status?: Rca["status"]) =>
    update.mutate(
      { rcaId: rca.id, ...(closed ? {} : { whys, fishbone, rootCause }), status },
      { onSuccess: (next) => done(next, t(status ? `rca.statusChanged.${status}` : "rca.saved")) },
    );

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-line bg-surface p-4">
        <div>
          <p className="font-mono text-xs text-fg-muted">{rca.id}</p>
          <h1 className="text-2xl font-semibold">{rca.title}</h1>
          <p className="text-sm text-fg-muted">
            <Link to="/assets/$assetId/$tab" params={{ assetId: rca.assetId, tab: "failures" }} className="font-mono hover:underline">
              {rca.assetId}
            </Link>{" "}
            · {t(`assetClass.${rca.assetClass}`)} · {t("rca.startedOn", { date: formatDate(rca.createdAt) })}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <p className="text-sm">
            {t("rca.col.status")}: <strong>{t(`rca.status.${rca.status}`)}</strong>
          </p>
          <div className="flex flex-wrap gap-2">
            {!closed && (
              <Button onClick={() => save()} disabled={!dirty || update.isPending}>
                {t("rca.save")}
              </Button>
            )}
            {rca.status === "open" && (
              <Button variant="secondary" onClick={() => save("in_review")} disabled={update.isPending}>
                {t("rca.sendForReview")}
              </Button>
            )}
            {rca.status === "in_review" && (
              <Button variant="secondary" onClick={() => save("closed")} disabled={update.isPending || !rootCause.trim()}>
                {t("rca.close")}
              </Button>
            )}
            {closed && (
              <Button variant="secondary" onClick={() => save("open")} disabled={update.isPending}>
                {t("rca.reopen")}
              </Button>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[1fr_2fr]">
        <Timeline rca={rca} />
        <section aria-labelledby="rca-whys" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="rca-whys" className="font-semibold">
            {t("rca.whysTitle")}
          </h2>
          <p className="mb-3 text-sm text-fg-muted">{t("rca.whysIntro")}</p>
          <ol className="flex flex-col gap-2">
            {whys.map((w, i) => (
              <li key={i}>
                <Field label={t("rca.whyN", { n: i + 1 })}>
                  {(p) => (
                    <input
                      {...p}
                      className={inputClass}
                      value={w}
                      maxLength={300}
                      readOnly={closed}
                      onChange={(e) => setWhys(whys.map((x, j) => (j === i ? e.target.value : x)))}
                    />
                  )}
                </Field>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <section aria-labelledby="rca-fishbone" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="rca-fishbone" className="font-semibold">
          {t("rca.fishboneTitle")}
        </h2>
        <p className="mb-3 text-sm text-fg-muted">{t("rca.fishboneIntro")}</p>
        <FishboneDiagram data={fishbone} problem={rca.title} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {FISHBONE_CATEGORIES.map((c) => (
            <CauseList
              key={c}
              category={c}
              causes={fishbone[c]}
              readOnly={closed}
              onChange={(next) => setFishbone({ ...fishbone, [c]: next })}
            />
          ))}
        </div>
      </section>

      <section aria-labelledby="rca-root" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="rca-root" className="font-semibold">
          {t("rca.rootTitle")}
        </h2>
        <Field label={t("rca.rootLabel")} hint={t("rca.rootHint")}>
          {(p) => (
            <textarea
              {...p}
              className={`${inputClass} min-h-20`}
              value={rootCause}
              maxLength={1000}
              readOnly={closed}
              onChange={(e) => setRootCause(e.target.value)}
            />
          )}
        </Field>
      </section>

      <Actions rca={rca} onDone={done} />
    </div>
  );
}

function CauseList({
  category,
  causes,
  readOnly,
  onChange,
}: {
  category: FishboneCategory;
  causes: readonly string[];
  readOnly: boolean;
  onChange: (next: string[]) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState("");
  const name = t(`rca.category.${category}`);
  const add = (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (text.length < 2 || causes.length >= 8) return;
    onChange([...causes, text]);
    setDraft("");
  };
  return (
    <div className="rounded border border-line p-3">
      <h3 className="text-sm font-semibold">{name}</h3>
      <p className="mb-1 text-xs text-fg-muted">{t(`rca.categoryHint.${category}`)}</p>
      {causes.length === 0 ? (
        <p className="text-xs text-fg-muted">{t("rca.noCauses")}</p>
      ) : (
        <ul className="mb-2 flex flex-col gap-1 text-sm">
          {causes.map((c, i) => (
            <li key={`${i}${c}`} className="flex items-start justify-between gap-2">
              <span>{c}</span>
              {!readOnly && (
                <button
                  type="button"
                  className="rounded p-0.5 hover:bg-sunken"
                  aria-label={t("rca.removeCause", { cause: c })}
                  onClick={() => onChange(causes.filter((_, j) => j !== i))}
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <form onSubmit={add} className="flex gap-2">
          <input
            className={inputClass}
            aria-label={t("rca.addCauseTo", { name })}
            value={draft}
            maxLength={200}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button type="submit" size="sm" variant="secondary" disabled={draft.trim().length < 2 || causes.length >= 8}>
            {t("rca.add")}
          </Button>
        </form>
      )}
    </div>
  );
}

function Timeline({ rca }: { rca: Rca }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="rca-timeline" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="rca-timeline" className="font-semibold">
        {t("rca.timelineTitle")}
      </h2>
      <p className="mb-2 text-sm text-fg-muted">{t("rca.timelineIntro")}</p>
      {rca.timeline.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("rca.timelineEmpty")}</p>
      ) : (
        <ol className="flex flex-col gap-2 border-l border-line pl-3 text-sm">
          {rca.timeline.map((e, i) => (
            <li key={`${e.t}${i}`}>
              <span className="block text-xs text-fg-muted">
                {formatDate(e.t)} · {t(`rca.event.${e.kind}`)}
              </span>
              {e.kind === "work_order" && e.refId ? (
                <Link to="/maintenance/$workOrderId" params={{ workOrderId: e.refId }} className="hover:underline">
                  {e.title}
                </Link>
              ) : (
                <span>{e.title}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Actions({ rca, onDone }: { rca: Rca; onDone: (next: Rca, message: string) => void }) {
  const { t } = useTranslation();
  const toast = useToasts((s) => s.show);
  const [text, setText] = useState("");
  const [raise, setRaise] = useState(true);
  const add = useApiMutation("rca.addAction", { onError: (e) => toast("error", e.message) });
  const closed = rca.status === "closed";
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate(
      { rcaId: rca.id, text: text.trim(), createWorkOrder: raise },
      {
        onSuccess: (next) => {
          setText("");
          const a = next.actions.at(-1);
          onDone(next, a?.workOrderId ? t("rca.actionWithWo", { id: a.workOrderNumber ?? a.workOrderId }) : t("rca.actionAdded"));
        },
      },
    );
  };
  return (
    <section aria-labelledby="rca-actions" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="rca-actions" className="font-semibold">
        {t("rca.actionsTitle")}
      </h2>
      <p className="mb-2 text-sm text-fg-muted">{t("rca.actionsIntro")}</p>
      {rca.actions.length === 0 ? (
        <p className="mb-3 text-sm text-fg-muted">{t("rca.noActions")}</p>
      ) : (
        <ul className="mb-3 flex flex-col gap-1 text-sm">
          {rca.actions.map((a) => (
            <li key={a.id} className="flex flex-wrap justify-between gap-2 border-b border-line py-1 last:border-0">
              <span>{a.text}</span>
              {a.workOrderId ? (
                <Link to="/maintenance/$workOrderId" params={{ workOrderId: a.workOrderId }} className="font-mono text-xs hover:underline">
                  {a.workOrderNumber ?? a.workOrderId}
                </Link>
              ) : (
                <span className="text-xs text-fg-muted">{t("rca.noWo")}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {!closed && (
        <form onSubmit={submit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label={t("rca.actionLabel")}>
              {(p) => <input {...p} className={inputClass} value={text} maxLength={300} onChange={(e) => setText(e.target.value)} />}
            </Field>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={raise} onChange={(e) => setRaise(e.target.checked)} />
            {t("rca.raiseWo")}
          </label>
          <Button type="submit" disabled={text.trim().length < 5 || add.isPending}>
            {t("rca.addAction")}
          </Button>
        </form>
      )}
    </section>
  );
}
