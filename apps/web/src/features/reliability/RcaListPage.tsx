/**
 * Root-cause analyses: every investigation, newest activity first, and a form to start one
 * (from a bad actor's Failures tab the asset is filled in already: ?asset=…).
 */
import { useApiMutation, useApiQuery } from "@pdm/api-client";
import { Button, Field, Skeleton, inputClass } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatDate } from "../../shared/format";
import { useToasts } from "../../shared/toast";
import { ReliabilityNav } from "./ReliabilityNav";

const searchSchema = z.object({ asset: z.string().optional().catch(undefined) });

export function RcaListPage() {
  const { t } = useTranslation();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const list = useApiQuery("rca.list", {}, { refetchInterval: 60_000 });

  useEffect(() => {
    document.title = `${t("rca.listTitle")} · ${t("app.name")}`;
  }, [t]);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.reliability.name")}</h1>
        <p className="text-fg-muted">{t("rca.intro")}</p>
      </header>
      <ReliabilityNav />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section aria-labelledby="rca-list" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="rca-list" className="mb-2 font-semibold">
            {t("rca.listTitle")}
          </h2>
          {list.isPending ? (
            <Skeleton className="h-40" />
          ) : !list.data ? (
            <p className="text-health-warning">{t("widget.failed")}</p>
          ) : list.data.items.length === 0 ? (
            <p className="text-sm text-fg-muted">{t("rca.none")}</p>
          ) : (
            <div className="relative -mx-4 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <caption className="sr-only">{t("rca.listTitle")}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-1 font-medium">
                      {t("rca.col.investigation")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("reliability.col.asset")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("rca.col.status")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("rca.col.actions")}
                    </th>
                    <th scope="col" className="py-1 pr-4 font-medium">
                      {t("rca.col.updated")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-0">
                      <td className="px-4 py-1">
                        <Link to="/reliability/rca/$rcaId" params={{ rcaId: r.id }} className="font-medium hover:underline">
                          {r.title}
                        </Link>
                        <span className="block font-mono text-xs text-fg-muted">{r.id}</span>
                      </td>
                      <td className="py-1 pr-3">
                        <span className="font-mono">{r.assetId}</span>
                        <span className="block text-xs text-fg-muted">{t(`assetClass.${r.assetClass}`)}</span>
                      </td>
                      <td className="py-1 pr-3">{t(`rca.status.${r.status}`)}</td>
                      <td className="py-1 pr-3 text-right tabular-nums">{r.actions}</td>
                      <td className="py-1 pr-4">{formatDate(r.updatedAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <NewRca defaultAsset={search.asset ?? ""} />
      </div>
    </div>
  );
}

function NewRca({ defaultAsset }: { defaultAsset: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const [assetId, setAssetId] = useState(defaultAsset);
  const [title, setTitle] = useState(defaultAsset ? t("rca.defaultTitle", { id: defaultAsset }) : "");
  const create = useApiMutation("rca.create", {
    onSuccess: (rca) => {
      void client.invalidateQueries({ queryKey: ["rca.list"] });
      toast("success", t("rca.created", { id: rca.id }));
      void navigate({ to: "/reliability/rca/$rcaId", params: { rcaId: rca.id } });
    },
    onError: (e) => toast("error", e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate({ assetId: assetId.trim(), title: title.trim(), failureId: null });
  };
  const valid = assetId.trim().length > 0 && title.trim().length >= 5;
  return (
    <section aria-labelledby="rca-new" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="rca-new" className="font-semibold">
        {t("rca.newTitle")}
      </h2>
      <p className="mb-3 text-sm text-fg-muted">{t("rca.newIntro")}</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label={t("rca.assetLabel")} hint={t("rca.assetHint")} required>
          {(p) => <input {...p} className={inputClass} value={assetId} onChange={(e) => setAssetId(e.target.value.toUpperCase())} />}
        </Field>
        <Field label={t("rca.titleLabel")} required>
          {(p) => <input {...p} className={inputClass} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} />}
        </Field>
        <Button type="submit" disabled={!valid || create.isPending}>
          {t("rca.start")}
        </Button>
      </form>
    </section>
  );
}
