/**
 * Asset 360's Documents, Related and Comments tabs (spec §6.2).
 */
import { useApiMutation, useApiQuery, useConnectionState } from "@pdm/api-client";
import { COMMENT_MAX, DocumentKind, type Asset, type AssetComment, type AssetRef, type User } from "@pdm/contracts";
import { Button, EmptyState, Field, HealthBadge, Select, Skeleton, inputClass } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { FileText, MessagesSquare } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { clearDraft, readDraft, useKeepDraft } from "../../shared/drafts";
import { formatAgo, formatDate } from "../../shared/format";
import { useSimNow } from "../../shared/sim-time";
import { useToasts } from "../../shared/toast";
import { useUsers } from "../../shared/users";

function Card({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-line bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <div className="mb-3 text-sm text-fg-muted">{hint}</div>}
      {children}
    </section>
  );
}

// ─── Documents ───────────────────────────────────────────────────────────────

export function DocumentsTab({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const docs = useApiQuery("assets.documents", { assetId: asset.id });
  const [kind, setKind] = useState<DocumentKind | "all">("all");
  if (docs.isPending) return <Skeleton className="h-64" />;
  if (docs.isError) return <p className="text-health-warning">{t("widget.failed")}</p>;
  const items = docs.data.items.filter((d) => kind === "all" || d.kind === kind);
  const present = new Set(docs.data.items.map((d) => d.kind));
  return (
    <Card title={t("docs.title")} hint={t("docs.note")}>
      <div className="mb-3">
        <Select
          label={t("docs.kindLabel")}
          value={kind}
          options={[
            { value: "all", label: t("docs.allKinds", { count: docs.data.items.length }) },
            ...DocumentKind.options.filter((k) => present.has(k)).map((k) => ({ value: k, label: t(`docs.kind.${k}`) })),
          ]}
          onChange={(v) => setKind(v as DocumentKind | "all")}
        />
      </div>
      {/* The table has no links, so on a narrow screen the scroll area itself must take focus,
          or keyboard users couldn't scroll to the hidden columns (WCAG; axe "scrollable-region-focusable"). */}
      <div
        role="region"
        aria-label={t("docs.tableLabel")}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a named, focusable scroll region is the recommended pattern here
        tabIndex={0}
        className="-mx-4 overflow-x-auto focus-visible:outline-2 focus-visible:outline-[var(--pdm-focus-ring)]"
      >
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">{t("docs.title")}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="px-4 py-2 font-medium">
                {t("docs.col.title")}
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                {t("docs.col.kind")}
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                {t("docs.col.number")}
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                {t("docs.col.revision")}
              </th>
              <th scope="col" className="py-2 pr-3 font-medium">
                {t("docs.col.issued")}
              </th>
              <th scope="col" className="px-4 py-2 font-medium">
                {t("docs.col.from")}
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((d) => (
              <tr key={d.id} className="border-b border-line last:border-0">
                <td className="px-4 py-2">
                  <span className="inline-flex items-start gap-2">
                    <FileText aria-hidden className="mt-0.5 size-4 shrink-0 text-fg-muted" />
                    <span>
                      {d.title}
                      <span className="block text-xs text-fg-muted">
                        {t(d.scope === "class" ? "docs.scope.class" : "docs.scope.asset", { size: Math.round(d.sizeKb / 100) / 10 })}
                      </span>
                    </span>
                  </span>
                </td>
                <td className="py-2 pr-3">{t(`docs.kind.${d.kind}`)}</td>
                <td className="py-2 pr-3 font-mono text-xs">{d.number}</td>
                <td className="py-2 pr-3">{d.revision}</td>
                <td className="py-2 pr-3 whitespace-nowrap">{formatDate(d.issuedAt)}</td>
                <td className="px-4 py-2">{t(`docs.source.${d.source}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Related ─────────────────────────────────────────────────────────────────

export function RelatedTab({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const related = useApiQuery("assets.related", { assetId: asset.id });
  if (related.isPending) return <Skeleton className="h-64" />;
  if (related.isError) return <p className="text-health-warning">{t("widget.failed")}</p>;
  const r = related.data;
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
      <Card title={t("related.partOf")}>
        {r.parent ? <RefList items={[r.parent]} /> : <p className="text-sm text-fg-muted">{t("related.noParent")}</p>}
      </Card>
      <Card title={t("related.parts", { count: r.children.total })}>
        {r.children.total === 0 ? (
          <p className="text-sm text-fg-muted">{t("related.noParts")}</p>
        ) : (
          <RefList items={r.children.items} total={r.children.total} />
        )}
      </Card>
      <Card
        title={t("related.sisters", { count: r.sisters.total, name: t(`assetClass.${asset.assetClass}`) })}
        hint={
          r.sisters.total > 0 && (
            <Link
              to="/assets/compare"
              search={(prev) => ({ ...prev, class: asset.assetClass, highlight: asset.id, measure: undefined, outliers: undefined })}
              className="text-accent hover:underline"
            >
              {t("related.compare")}
            </Link>
          )
        }
      >
        {r.sisters.total === 0 ? (
          <p className="text-sm text-fg-muted">{t("related.noSisters")}</p>
        ) : (
          <RefList items={r.sisters.items} total={r.sisters.total} />
        )}
      </Card>
      <Card title={t("related.sameArea", { count: r.sameArea.total })} hint={t("related.sameAreaHint")}>
        {r.sameArea.total === 0 ? (
          <p className="text-sm text-fg-muted">{t("related.nothingNearby")}</p>
        ) : (
          <RefList items={r.sameArea.items} total={r.sameArea.total} />
        )}
      </Card>
    </div>
  );
}

function RefList({ items, total }: { items: readonly AssetRef[]; total?: number }) {
  const { t } = useTranslation();
  return (
    <>
      <ul className="flex flex-col divide-y divide-line">
        {items.map((a) => (
          <li key={a.id} className="flex items-center gap-3 py-1.5 text-sm">
            <HealthBadge compact state={a.healthState} label={t(`health.${a.healthState}`)} />
            <Link
              to="/assets/$assetId"
              params={{ assetId: a.id }}
              search={(prev) => prev}
              className="min-w-0 flex-1 truncate hover:underline"
            >
              {a.name}
            </Link>
            <span className="shrink-0 text-xs text-fg-muted tabular-nums">{a.healthScore}</span>
            <span className="w-24 shrink-0 text-right text-xs text-fg-muted">{t(`operatingStatus.${a.operatingStatus}`)}</span>
          </li>
        ))}
      </ul>
      {total !== undefined && total > items.length && (
        <p className="pt-2 text-xs text-fg-muted">{t("related.showing", { shown: items.length, total })}</p>
      )}
    </>
  );
}

// ─── Comments ────────────────────────────────────────────────────────────────

export function CommentsTab({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const comments = useApiQuery("assets.comments", { assetId: asset.id }, { refetchInterval: 30_000 });
  const me = useApiQuery("me.get", {});
  const { byId } = useUsers();
  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_24rem]">
      <Card title={t("comments.title", { count: comments.data?.items.length ?? 0 })}>
        {comments.isPending ? (
          <Skeleton className="h-40" />
        ) : comments.isError ? (
          <p className="text-health-warning">{t("widget.failed")}</p>
        ) : comments.data.items.length === 0 ? (
          <EmptyState icon={<MessagesSquare className="size-8" />} title={t("comments.none")}>
            {t("comments.noneHint")}
          </EmptyState>
        ) : (
          <ol className="flex flex-col gap-4">
            {comments.data.items.map((c) => (
              <li key={c.id}>
                <CommentView comment={c} byId={byId} meId={me.data?.id} />
              </li>
            ))}
          </ol>
        )}
      </Card>
      <CommentForm asset={asset} />
    </div>
  );
}

function CommentView({ comment, byId, meId }: { comment: AssetComment; byId: ReadonlyMap<string, User>; meId?: string }) {
  const { t } = useTranslation();
  const { now } = useSimNow();
  const author = byId.get(comment.authorId);
  // Show each "@Full Name" of a mentioned person in bold, so mentions stand out.
  const names = comment.mentions.flatMap((id) => {
    const u = byId.get(id);
    return u ? [`@${u.name}`] : [];
  });
  const parts =
    names.length === 0
      ? [comment.body]
      : comment.body.split(new RegExp(`(${names.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`));
  return (
    <article aria-label={t("comments.by", { name: author?.name ?? comment.authorId })} className="flex flex-col gap-1">
      <p className="text-sm">
        <span className="font-semibold">{author?.name ?? comment.authorId}</span>
        {author && <span className="text-fg-muted"> · {author.title}</span>}
        <span className="text-fg-muted">
          {" "}
          · <time dateTime={comment.createdAt}>{formatAgo(Date.parse(comment.createdAt), now)}</time>
        </span>
        {meId && comment.mentions.includes(meId) && (
          <span className="ml-2 rounded border border-line px-1 text-xs">{t("comments.mentionsYou")}</span>
        )}
      </p>
      <p className="text-sm whitespace-pre-line">{parts.map((p, i) => (names.includes(p) ? <strong key={i}>{p}</strong> : p))}</p>
    </article>
  );
}

interface CommentValues {
  body: string;
}

function CommentForm({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const offline = useConnectionState() === "offline";
  const { byId } = useUsers();
  const people = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  const draftKey = `comment:${asset.id}`;
  // Like the field screens: a half-written comment survives a dropped connection or a reload.
  const [restored] = useState(() => readDraft<CommentValues>(draftKey));
  const form = useForm<CommentValues>({ defaultValues: restored ?? { body: "" } });
  useKeepDraft(form, draftKey);
  const body = useWatch({ control: form.control, name: "body" }) ?? "";
  const add = useApiMutation("assets.addComment", {
    onSuccess: () => {
      clearDraft(draftKey);
      form.reset({ body: "" });
      void client.invalidateQueries({ queryKey: ["assets.comments"] });
      toast("success", t("comments.posted"));
    },
    onError: (e) => toast("error", t("alarmActions.failed", { reason: e.message })),
  });
  const submit = form.handleSubmit((v) => {
    if (v.body.trim().length === 0) {
      form.setError("body", { message: "comments.empty" });
      return;
    }
    add.mutate({ assetId: asset.id, body: v.body.trim() });
  });
  const mention = (id: string) => {
    const u = byId.get(id);
    if (!u) return;
    const current = form.getValues("body");
    form.setValue("body", `${current}${current && !current.endsWith(" ") ? " " : ""}@${u.name} `, { shouldDirty: true });
    form.setFocus("body");
  };
  const error = form.formState.errors.body?.message;

  return (
    <Card title={t("comments.add")}>
      <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
        <label className="flex flex-col gap-1 text-sm font-medium">
          {t("comments.yourComment")}
          <textarea
            {...form.register("body")}
            rows={5}
            maxLength={COMMENT_MAX}
            aria-invalid={error ? true : undefined}
            aria-describedby="comment-help"
            className={inputClass}
          />
        </label>
        <p id="comment-help" className="-mt-2 text-xs text-fg-muted">
          {error ? <span className="text-health-critical">{t(error)}</span> : t("comments.help", { left: COMMENT_MAX - body.length })}
        </p>
        {restored && restored.body && <p className="text-xs text-fg-muted">{t("comments.restored")}</p>}
        <Field label={t("comments.mention")}>
          {(p) => (
            <select {...p} value="" onChange={(e) => mention(e.target.value)} className={inputClass}>
              <option value="">{t("comments.choosePerson")}</option>
              {people.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} · {u.title}
                </option>
              ))}
            </select>
          )}
        </Field>
        <div className="flex items-center justify-end gap-2">
          {offline && <span className="text-xs text-fg-muted">{t("field.waitingForConnection")}</span>}
          <Button type="submit" variant="primary" disabled={offline || add.isPending}>
            {t("comments.post")}
          </Button>
        </div>
      </form>
    </Card>
  );
}
