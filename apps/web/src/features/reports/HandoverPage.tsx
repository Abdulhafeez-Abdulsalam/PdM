/**
 * Shift handover (Phase 4, chunk 6): "what does the next shift need to know?" This shift so far
 * (counts and the events that matter most), urgent alarms still open, work in progress, and the
 * notes the crew leaves for each other. Prints like any report, for the handover meeting.
 */
import { useApiMutation, useApiQuery } from "@pdm/api-client";
import { ENTERPRISE_SCOPE, type Handover } from "@pdm/contracts";
import { Button, Field, PriorityIcon, Skeleton } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { canDo } from "../../shared/roles/roles";
import { useGlobalSearch } from "../../shared/time-range";
import { useToasts } from "../../shared/toast";
import { useUsers } from "../../shared/users";
import { PrintButton, ReportsHeader } from "./ReportsPages";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });
const dayTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function Block({ id, title, intro, children }: { id: string; title: string; intro?: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="break-inside-avoid-page rounded-lg border border-line bg-surface p-4 print:rounded-none print:border-0 print:border-t print:px-0"
    >
      <h3 id={id} className="font-semibold">
        {title}
      </h3>
      {intro && <p className="mb-2 text-sm text-fg-muted">{intro}</p>}
      {children}
    </section>
  );
}

export function HandoverPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const scope = scopeId === ENTERPRISE_SCOPE ? undefined : scopeId;
  const handover = useApiQuery("handover.get", { scopeId: scope }, { refetchInterval: 30_000 });
  const h = handover.data;
  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-4">
      <ReportsHeader intro={t("reports.handover.intro")} />
      {!h ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <div className="flex justify-end print:hidden">
            <PrintButton />
          </div>
          <article aria-labelledby="handover-title" className="flex flex-col gap-4">
            <header className="border-b border-line pb-2">
              <h2 id="handover-title" className="text-xl font-semibold">
                {t("reports.handover.title", {
                  shift: t(`reports.handover.shift.${h.shift.name}`),
                  from: dayTime(h.shift.start),
                  to: time(h.shift.end),
                })}
              </h2>
              <p className="text-sm text-fg-muted">{t("reports.handover.utc")}</p>
            </header>
            <Counts counts={h.counts} />
            <OpenAlarms scopeId={scope} />
            <WorkInProgress scopeId={scope} />
            <Highlights highlights={h.highlights} />
            <Notes notes={h.notes} scopeId={scope} />
          </article>
        </>
      )}
    </div>
  );
}

function Counts({ counts }: { counts: Handover["counts"] }) {
  const { t } = useTranslation();
  const items = [
    [
      "alarmsRaised",
      t("reports.handover.alarmsRaisedValue", { total: formatNumber(counts.alarmsRaised), urgent: formatNumber(counts.urgentAlarms) }),
    ],
    ["alarmsCleared", formatNumber(counts.alarmsCleared)],
    ["workCreated", formatNumber(counts.workCreated)],
    ["workFinished", formatNumber(counts.workFinished)],
    ["predictions", formatNumber(counts.predictions)],
    ["operatorActions", formatNumber(counts.operatorActions)],
  ] as const;
  return (
    <Block id="handover-counts" title={t("reports.handover.soFar")}>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map(([key, value]) => (
          <div key={key}>
            <dt className="text-xs text-fg-muted">{t(`reports.handover.count.${key}`)}</dt>
            <dd className="text-lg font-semibold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </Block>
  );
}

function OpenAlarms({ scopeId }: { scopeId: string | undefined }) {
  const { t } = useTranslation();
  const q = useApiQuery(
    "alarms.list",
    { scopeId, states: ["active_unacked", "active_acked"], priorities: ["p1", "p2"], sort: "priority", limit: 15 },
    { refetchInterval: 30_000 },
  );
  return (
    <Block id="handover-alarms" title={t("reports.handover.alarmsTitle")} intro={t("reports.handover.alarmsIntro")}>
      {!q.data ? (
        <Skeleton className="h-24" />
      ) : q.data.items.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("reports.handover.noAlarms")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {q.data.items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
              <span className="flex items-center gap-1 self-center">
                <PriorityIcon priority={a.priority} />
                {t(`alarms.priority.${a.priority}`)}
              </span>
              <span className="font-mono">{a.assetId}</span>
              <span>{a.message}</span>
              <span className="text-fg-muted">
                {t(a.state === "active_unacked" ? "reports.handover.sinceUnacked" : "reports.handover.since", { at: dayTime(a.raisedAt) })}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function WorkInProgress({ scopeId }: { scopeId: string | undefined }) {
  const { t } = useTranslation();
  const users = useUsers();
  const q = useApiQuery("workOrders.list", { scopeId, status: ["in_progress"], sort: "priority", limit: 20 }, { refetchInterval: 30_000 });
  return (
    <Block id="handover-work" title={t("reports.handover.workTitle")}>
      {!q.data ? (
        <Skeleton className="h-24" />
      ) : q.data.items.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("reports.handover.noWork")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {q.data.items.map((wo) => (
            <li key={wo.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
              <Link to="/maintenance/$workOrderId" params={{ workOrderId: wo.id }} className="font-mono text-accent underline">
                {wo.number}
              </Link>
              <span className="font-mono">{wo.assetId}</span>
              <span>{wo.title}</span>
              <span className="text-fg-muted">
                {wo.assigneeId ? (users.byId.get(wo.assigneeId)?.name ?? wo.assigneeId) : t("reports.handover.unassigned")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function Highlights({ highlights }: { highlights: Handover["highlights"] }) {
  const { t } = useTranslation();
  return (
    <Block id="handover-events" title={t("reports.handover.eventsTitle")} intro={t("reports.handover.eventsIntro")}>
      {highlights.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("reports.handover.noEvents")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {highlights.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
              <span className="text-fg-muted tabular-nums">{time(e.t)}</span>
              <span className="font-medium">{t(`reports.handover.kind.${e.kind}`)}</span>
              <span className="font-mono">{e.assetId}</span>
              <span>{e.title}</span>
              {e.detail && <span className="text-fg-muted">{e.detail}</span>}
            </li>
          ))}
        </ul>
      )}
    </Block>
  );
}

function Notes({ notes, scopeId }: { notes: Handover["notes"]; scopeId: string | undefined }) {
  const { t } = useTranslation();
  const users = useUsers();
  const role = usePreferences((p) => p.role);
  const node = useApiQuery("hierarchy.node", { nodeId: scopeId ?? ENTERPRISE_SCOPE });
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const [text, setText] = useState("");
  // A note written while looking at one site is about that site; anywhere else, about everything.
  const siteId = node.data?.level === "site" ? node.data.id : null;
  const add = useApiMutation("handover.addNote", {
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["handover.get"] });
      toast("success", t("reports.handover.noteAdded"));
      setText("");
    },
    onError: (e) => toast("error", e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    add.mutate({ siteId, text: text.trim() });
  };
  return (
    <Block id="handover-notes" title={t("reports.handover.notesTitle")} intro={t("reports.handover.notesIntro")}>
      {notes.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("reports.handover.noNotes")}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line text-sm">
          {notes.map((n) => (
            <li key={n.id} className="py-1.5">
              <p>{n.text}</p>
              <p className="text-xs text-fg-muted">
                {t("reports.handover.noteBy", {
                  who: users.byId.get(n.authorId)?.name ?? n.authorId,
                  at: dayTime(n.at),
                  where: n.siteId ?? t("reports.handover.everywhere"),
                })}
              </p>
            </li>
          ))}
        </ul>
      )}
      {canDo(role, "handover.note") && (
        <form onSubmit={submit} className="mt-3 flex flex-col gap-2 print:hidden">
          <Field label={t(siteId ? "reports.handover.addNoteSite" : "reports.handover.addNote", { site: node.data?.name })}>
            {(p) => (
              <textarea
                {...p}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={3}
                maxLength={1000}
                className="w-full rounded-md border border-line bg-surface px-2 py-1 text-sm"
              />
            )}
          </Field>
          <div>
            <Button type="submit" variant="primary" disabled={text.trim().length < 3 || add.isPending}>
              {t("reports.handover.leaveNote")}
            </Button>
          </div>
        </form>
      )}
    </Block>
  );
}
