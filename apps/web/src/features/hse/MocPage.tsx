/**
 * Management of change: before plant, a setting or a procedure is changed, the change is
 * written down, its risk assessed, reviewed and approved, and only then made. Many major
 * accidents started with a change nobody reviewed. Open changes first; each can be moved on by
 * the people allowed to (review: HSE officer and plant manager; implement: the planner).
 */
import { useApiMutation, useApiQuery } from "@pdm/api-client";
import { MOC_TRANSITIONS, type CreateMocRequest, type Moc, type MocStatus } from "@pdm/contracts";
import { Button, Field, Select, Skeleton } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { canDo } from "../../shared/roles/roles";
import { useGlobalSearch } from "../../shared/time-range";
import { useToasts } from "../../shared/toast";
import { useUsers } from "../../shared/users";
import { HseHeader } from "./HseNav";

const RISK_TONE = { low: "", medium: "text-health-watch", high: "font-semibold text-health-warning" } as const;

export function MocPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const role = usePreferences((p) => p.role);
  const data = useApiQuery("hse.mocs", { scopeId }, { refetchInterval: 60_000 });

  useEffect(() => {
    document.title = `${t("hse.nav.moc")} · ${t("app.name")}`;
  }, [t]);

  const items = data.data?.items;
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <HseHeader intro={t("hse.mocIntro")} />
      {canDo(role, "moc.propose") && <ProposeForm />}
      {!items ? (
        <Skeleton className="h-96" />
      ) : (
        <section aria-labelledby="hse-mocs" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="hse-mocs" className="mb-3 font-semibold">
            {t("hse.mocsTitle", { count: items.length })}
          </h2>
          <ul className="flex flex-col divide-y divide-line">
            {items.map((m) => (
              <MocRow key={m.id} moc={m} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function MocRow({ moc }: { moc: Moc }) {
  const { t } = useTranslation();
  const role = usePreferences((p) => p.role);
  const { byId } = useUsers();
  const name = (id: string) => byId.get(id)?.name ?? id;
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const move = useApiMutation("hse.mocTransition", {
    onSuccess: (m) => {
      void client.invalidateQueries({ queryKey: ["hse.mocs"] });
      void client.invalidateQueries({ queryKey: ["hse.overview"] });
      toast("success", t("hse.mocMoved", { id: m.id, status: t(`hse.mocStatus.${m.status}`) }));
      setRejecting(false);
    },
    onError: (e) => toast("error", e.message),
  });
  // Who may make which move: review (and reject) for HSE and the plant manager, implementing for the planner.
  const allowed = (to: MocStatus) => (to === "implemented" ? canDo(role, "moc.implement") : canDo(role, "moc.review"));
  const moves = MOC_TRANSITIONS[moc.status].filter((to) => to !== "rejected" && allowed(to));
  const canReject = MOC_TRANSITIONS[moc.status].includes("rejected") && allowed("rejected");
  const last = moc.history.at(-1);
  return (
    <li className="flex flex-col gap-2 py-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
        <p className="font-medium">
          <span className="font-mono text-xs text-fg-muted">{moc.id}</span> {moc.title}
        </p>
        <p className="text-sm">{moc.description}</p>
        <p className="mt-1 text-xs text-fg-muted">
          {t(`hse.mocKind.${moc.kind}`)} · <span className={RISK_TONE[moc.risk]}>{t(`hse.mocRisk.${moc.risk}`)}</span> ·{" "}
          <Link to="/assets/$assetId/$tab" params={{ assetId: moc.assetId, tab: "overview" }} className="font-mono text-accent underline">
            {moc.assetId}
          </Link>{" "}
          · {t("hse.mocProposed", { by: name(moc.proposedBy), date: formatDate(moc.proposedAt) })}
        </p>
        {last?.note && <p className="mt-1 text-xs">“{last.note}”</p>}
      </div>
      <div className="flex shrink-0 flex-col items-start gap-2 lg:items-end">
        <span className="text-sm font-semibold">{t(`hse.mocStatus.${moc.status}`)}</span>
        <div className="flex flex-wrap gap-2">
          {moves.map((to) => (
            <Button key={to} size="sm" variant="secondary" disabled={move.isPending} onClick={() => move.mutate({ mocId: moc.id, to })}>
              {t(`hse.mocMove.${to}`)} <span className="sr-only">{moc.id}</span>
            </Button>
          ))}
          {canReject && !rejecting && (
            <Button size="sm" variant="ghost" onClick={() => setRejecting(true)}>
              {t("hse.mocMove.rejected")} <span className="sr-only">{moc.id}</span>
            </Button>
          )}
        </div>
        {rejecting && (
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              move.mutate({ mocId: moc.id, to: "rejected", note: reason.trim() });
            }}
          >
            <Field label={t("hse.rejectReason")}>
              {(p) => (
                <input
                  {...p}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="h-8 w-56 max-w-full rounded-md border border-line bg-surface px-2 text-sm"
                />
              )}
            </Field>
            <Button type="submit" size="sm" variant="danger" disabled={reason.trim().length < 5 || move.isPending}>
              {t("hse.confirmReject")}
            </Button>
          </form>
        )}
      </div>
    </li>
  );
}

function ProposeForm() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const [form, setForm] = useState<CreateMocRequest>({ title: "", description: "", assetId: "", kind: "setpoint", risk: "medium" });
  const set = (patch: Partial<CreateMocRequest>) => setForm((f) => ({ ...f, ...patch }));
  const create = useApiMutation("hse.createMoc", {
    onSuccess: (m) => {
      void client.invalidateQueries({ queryKey: ["hse.mocs"] });
      void client.invalidateQueries({ queryKey: ["hse.overview"] });
      toast("success", t("hse.mocCreated", { id: m.id }));
      setForm((f) => ({ ...f, title: "", description: "" }));
    },
    onError: (e) => toast("error", e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ ...form, title: form.title.trim(), description: form.description.trim(), assetId: form.assetId.trim() });
  };
  const valid = form.title.trim().length >= 5 && form.description.trim().length >= 10 && form.assetId.trim().length > 0;
  return (
    <section aria-labelledby="hse-propose" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="hse-propose" className="mb-3 font-semibold">
        {t("hse.proposeTitle")}
      </h2>
      <form onSubmit={submit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label={t("hse.mocTitle")}>
          {(p) => (
            <input
              {...p}
              value={form.title}
              onChange={(e) => set({ title: e.target.value })}
              className="h-8 w-full rounded-md border border-line bg-surface px-2 text-sm"
            />
          )}
        </Field>
        <Field label={t("hse.reportAsset")}>
          {(p) => (
            <input
              {...p}
              value={form.assetId}
              onChange={(e) => set({ assetId: e.target.value })}
              className="h-8 w-full rounded-md border border-line bg-surface px-2 font-mono text-sm"
            />
          )}
        </Field>
        <div className="md:col-span-2">
          <Field label={t("hse.mocDescription")}>
            {(p) => (
              <textarea
                {...p}
                rows={3}
                value={form.description}
                onChange={(e) => set({ description: e.target.value })}
                className="w-full rounded-md border border-line bg-surface px-2 py-1 text-sm"
              />
            )}
          </Field>
        </div>
        <div className="flex flex-wrap items-end gap-3 md:col-span-2">
          <Select
            label={t("hse.mocKindLabel")}
            value={form.kind}
            options={(["setpoint", "equipment", "procedure", "temporary"] as const).map((k) => ({
              value: k,
              label: t(`hse.mocKind.${k}`),
            }))}
            onChange={(kind) => set({ kind })}
          />
          <Select
            label={t("hse.mocRiskLabel")}
            value={form.risk}
            options={(["low", "medium", "high"] as const).map((r) => ({ value: r, label: t(`hse.mocRisk.${r}`) }))}
            onChange={(risk) => set({ risk })}
          />
          <Button type="submit" variant="primary" disabled={!valid || create.isPending}>
            {t("hse.propose")}
          </Button>
        </div>
      </form>
    </section>
  );
}
