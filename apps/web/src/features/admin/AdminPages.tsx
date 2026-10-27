/**
 * Administration (Phase 4, chunk 8), the System Admin's home: "who can do what, and who changed
 * what?" Platform health at a glance, the people and their roles, the access matrix, the asset
 * hierarchy, and the audit log of every change made through the API. Limits are edited where
 * they're shown, in Data → Tags (for anyone with `threshold.edit`).
 */
import { useApiMutation, useApiQuery } from "@pdm/api-client";
import { ENTERPRISE_SCOPE, RoleId, type AuditEntry, type HierarchyNode } from "@pdm/contracts";
import { Button, HealthBadge, KpiCard, Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData, useQueryClient } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../shared/format";
import { MODULES } from "../../shared/modules";
import { ACTIONS, accessFor } from "../../shared/roles/roles";
import { globalSearchSchema } from "../../shared/time-range";
import { useToasts } from "../../shared/toast";
import { useUsers } from "../../shared/users";
import { SubNav } from "../../shared/widgets/SubNav";

const PAGE_SIZE = 50;
const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function AdminHeader({ intro }: { intro: string }) {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = `${t("modules.admin.name")} · ${t("app.name")}`;
  }, [t]);
  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.admin.name")}</h1>
        <p className="text-fg-muted">{intro}</p>
      </header>
      <SubNav
        label={t("admin.nav.label")}
        pages={[
          { to: "/admin", label: t("admin.nav.overview") },
          { to: "/admin/users", label: t("admin.nav.users") },
          { to: "/admin/roles", label: t("admin.nav.roles") },
          { to: "/admin/hierarchy", label: t("admin.nav.hierarchy") },
          { to: "/admin/audit", label: t("admin.nav.audit") },
        ]}
      />
    </>
  );
}

/** The audit entries as a table: when, who, what, which item, what changed. */
function AuditTable({ entries, caption }: { entries: readonly AuditEntry[]; caption: string }) {
  const { t } = useTranslation();
  const users = useUsers();
  return (
    <div className="relative -mx-4 overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-muted">
            <th scope="col" className="px-4 py-1 font-medium">
              {t("admin.col.when")}
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              {t("admin.col.who")}
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              {t("admin.col.what")}
            </th>
            <th scope="col" className="py-1 pr-3 font-medium">
              {t("admin.col.item")}
            </th>
            <th scope="col" className="py-1 pr-4 font-medium">
              {t("admin.col.change")}
            </th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} className="border-b border-line align-top last:border-0">
              <th scope="row" className="px-4 py-1.5 text-left font-normal tabular-nums">
                {when(e.at)}
              </th>
              <td className="py-1.5 pr-3">{users.byId.get(e.userId)?.name ?? e.userId}</td>
              <td className="py-1.5 pr-3">
                {e.description}
                <span className="block font-mono text-xs text-fg-muted">{e.action}</span>
              </td>
              <td className="py-1.5 pr-3 font-mono">{e.targetId ?? "—"}</td>
              <td className="py-1.5 pr-4 text-fg-muted">{e.detail ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPage() {
  const { t } = useTranslation();
  const { scope, range } = globalSearchSchema.parse(useSearch({ strict: false }));
  const users = useApiQuery("users.list", { limit: 500 });
  const sources = useApiQuery("data.sources", {}, { refetchInterval: 30_000 });
  const quality = useApiQuery("data.quality", { scopeId: ENTERPRISE_SCOPE }, { refetchInterval: 60_000 });
  const audit = useApiQuery("admin.audit", { limit: 10 }, { refetchInterval: 15_000 });
  const connected = sources.data?.items.filter((s) => s.status === "connected").length;
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <AdminHeader intro={t("admin.intro")} />
      <section aria-label={t("admin.kpisLabel")} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <KpiCard
          label={t("admin.kpi.users")}
          value={users.data ? formatNumber(users.data.total) : "—"}
          target={t("admin.kpi.roles", { count: RoleId.options.length })}
        />
        <KpiCard
          label={t("admin.kpi.sources")}
          value={sources.data ? `${connected} / ${sources.data.items.length}` : "—"}
          lineage={t("admin.kpi.sourcesHow")}
        />
        <KpiCard
          label={t("data.kpi.completeness")}
          value={quality.data ? `${formatNumber(quality.data.totals.completenessPct, 1)} %` : "—"}
          lineage={t("admin.kpi.completenessHow")}
        />
        <KpiCard
          label={t("admin.kpi.changes")}
          value={audit.data ? formatNumber(audit.data.total) : "—"}
          lineage={t("admin.kpi.changesHow")}
        />
      </section>
      <p className="text-sm text-fg-muted">
        {t("admin.limitsWhere")}{" "}
        <Link to="/data/tags" search={{ scope, range }} className="text-accent underline">
          {t("admin.limitsLink")}
        </Link>
      </p>
      <section aria-labelledby="admin-recent" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="admin-recent" className="font-semibold">
          {t("admin.recentTitle")}
        </h2>
        <p className="mb-3 text-sm text-fg-muted">{t("admin.recentIntro")}</p>
        {!audit.data ? (
          <Skeleton className="h-32" />
        ) : audit.data.items.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("admin.noChanges")}</p>
        ) : (
          <AuditTable entries={audit.data.items} caption={t("admin.recentTitle")} />
        )}
      </section>
    </div>
  );
}

export function UsersPage() {
  const { t } = useTranslation();
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const [role, setRole] = useState<"all" | RoleId>("all");
  const users = useApiQuery("users.list", { role: role === "all" ? undefined : role, limit: 500 });
  const change = useApiMutation("admin.setUserRole", {
    onSuccess: (u) => {
      void client.invalidateQueries({ queryKey: ["users.list"] });
      void client.invalidateQueries({ queryKey: ["admin.audit"] });
      toast("success", t("admin.users.changed", { name: u.name, role: t(`roles.${u.role}`) }));
    },
    onError: (e) => toast("error", e.message),
  });
  const roleOptions = RoleId.options.map((r) => ({ value: r, label: t(`roles.${r}`) }));
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <AdminHeader intro={t("admin.users.intro")} />
      <div>
        <Select
          label={t("admin.users.filter")}
          value={role}
          options={[{ value: "all", label: t("admin.users.allRoles") }, ...roleOptions]}
          onChange={setRole}
        />
      </div>
      <section aria-labelledby="admin-users" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="admin-users" className="mb-3 font-semibold">
          {t("admin.users.title", { count: users.data?.total ?? 0 })}
        </h2>
        {!users.data ? (
          <Skeleton className="h-96" />
        ) : (
          <div className="relative -mx-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">{t("admin.users.caption")}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th scope="col" className="px-4 py-1 font-medium">
                    {t("admin.col.name")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("admin.col.role")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("admin.col.title")}
                  </th>
                  <th scope="col" className="py-1 pr-4 font-medium">
                    {t("admin.col.sites")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.data.items.map((u) => (
                  <tr key={u.id} className="border-b border-line align-top last:border-0">
                    <th scope="row" className="px-4 py-1.5 text-left font-normal">
                      {u.name}
                      <span className="block font-mono text-xs text-fg-muted">{u.id}</span>
                    </th>
                    <td className="py-1.5 pr-3">
                      <label className="sr-only" htmlFor={`role-${u.id}`}>
                        {t("admin.users.roleFor", { name: u.name })}
                      </label>
                      <select
                        id={`role-${u.id}`}
                        value={u.role}
                        disabled={change.isPending}
                        onChange={(e) => change.mutate({ userId: u.id, role: e.target.value as RoleId })}
                        className="h-8 max-w-full rounded-md border border-line bg-surface px-2 text-sm"
                      >
                        {roleOptions.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="py-1.5 pr-3">{u.title}</td>
                    <td className="py-1.5 pr-4 text-fg-muted">{u.siteIds.length ? u.siteIds.join(", ") : t("admin.users.allSites")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function RolesPage() {
  const { t } = useTranslation();
  const roles = RoleId.options;
  const head = (
    <tr className="border-b border-line text-left text-xs text-fg-muted">
      <th scope="col" className="px-4 py-1 font-medium">
        {t("admin.roles.item")}
      </th>
      {roles.map((r) => (
        <th key={r} scope="col" className="w-20 py-1 pr-2 text-center font-medium">
          {t(`roles.${r}`)}
        </th>
      ))}
    </tr>
  );
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <AdminHeader intro={t("admin.roles.intro")} />
      <section aria-labelledby="admin-modules" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="admin-modules" className="font-semibold">
          {t("admin.roles.modulesTitle")}
        </h2>
        <p className="mb-3 text-sm text-fg-muted">{t("admin.roles.modulesIntro")}</p>
        <div className="relative -mx-4 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <caption className="sr-only">{t("admin.roles.modulesTitle")}</caption>
            <thead>{head}</thead>
            <tbody>
              {MODULES.map((m) => (
                <tr key={m.id} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-1.5 text-left font-normal">
                    {t(`modules.${m.id}.name`)}
                  </th>
                  {roles.map((r) => {
                    const access = accessFor(r, m.id);
                    return (
                      <td key={r} className={cx("py-1.5 pr-2 text-center", access === "use" ? "font-medium" : "text-fg-muted")}>
                        {t(`admin.roles.access.${access}`)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="admin-actions" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="admin-actions" className="font-semibold">
          {t("admin.roles.actionsTitle")}
        </h2>
        <p className="mb-3 text-sm text-fg-muted">{t("admin.roles.actionsIntro")}</p>
        <div className="relative -mx-4 overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <caption className="sr-only">{t("admin.roles.actionsTitle")}</caption>
            <thead>{head}</thead>
            <tbody>
              {(Object.keys(ACTIONS) as (keyof typeof ACTIONS)[]).map((a) => (
                <tr key={a} className="border-b border-line last:border-0">
                  <th scope="row" className="px-4 py-1.5 text-left font-normal">
                    {t(`admin.roles.action.${a.replace(".", "_")}`)}
                    <span className="block font-mono text-xs text-fg-muted">{a}</span>
                  </th>
                  {roles.map((r) => {
                    const can = (ACTIONS[a] as readonly RoleId[]).includes(r);
                    return (
                      <td key={r} className={cx("py-1.5 pr-2 text-center", can ? "font-medium" : "text-fg-muted")}>
                        {t(can ? "admin.roles.yes" : "admin.roles.no")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/** One node and, once opened, its children (loaded one level at a time). */
function TreeNode({ node }: { node: HierarchyNode }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(node.level === "enterprise");
  const children = useApiQuery("hierarchy.children", { nodeId: node.id }, { enabled: open && node.childCount > 0 });
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1">
        {node.childCount > 0 ? (
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className="flex items-center gap-1 rounded-md px-1 hover:bg-sunken"
          >
            <Chevron aria-hidden className="size-4" />
            <span className="font-medium">{node.name}</span>
          </button>
        ) : node.assetId ? (
          <Link
            to="/assets/$assetId/$tab"
            params={{ assetId: node.assetId, tab: "overview" }}
            className="ml-6 font-mono text-accent underline"
          >
            {node.name}
          </Link>
        ) : (
          <span className="ml-6">{node.name}</span>
        )}
        <span className="text-xs text-fg-muted">
          {t(`admin.level.${node.level}`)}
          {node.childCount > 0 && ` · ${t("admin.children", { count: node.childCount })}`}
        </span>
        <HealthBadge state={node.health} label={t(`health.${node.health}`)} />
      </div>
      {open && node.childCount > 0 && (
        <ul className="ml-5 border-l border-line pl-3">
          {!children.data ? (
            <li>
              <Skeleton className="h-6 w-48" />
            </li>
          ) : (
            children.data.items.map((c) => <TreeNode key={c.id} node={c} />)
          )}
        </ul>
      )}
    </li>
  );
}

export function HierarchyPage() {
  const { t } = useTranslation();
  const root = useApiQuery("hierarchy.node", { nodeId: ENTERPRISE_SCOPE });
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <AdminHeader intro={t("admin.hierarchy.intro")} />
      <section aria-labelledby="admin-tree" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="admin-tree" className="mb-2 font-semibold">
          {t("admin.nav.hierarchy")}
        </h2>
        {!root.data ? <Skeleton className="h-64" /> : <ul>{<TreeNode node={root.data} />}</ul>}
      </section>
    </div>
  );
}

const AREAS = ["workOrders.", "alarms.", "predictions.", "hse.", "inventory.", "rca.", "assets.", "handover.", "admin."] as const;

export function AuditPage() {
  const { t } = useTranslation();
  const users = useUsers();
  const [userId, setUserId] = useState("all");
  const [area, setArea] = useState("all");
  const filterKey = `${userId}|${area}`;
  const [paging, setPaging] = useState({ filterKey, page: 0 });
  const page = paging.filterKey === filterKey ? paging.page : 0;
  const audit = useApiQuery(
    "admin.audit",
    {
      userId: userId === "all" ? undefined : userId,
      action: area === "all" ? undefined : area,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    },
    { refetchInterval: 15_000, placeholderData: keepPreviousData },
  );
  const pages = Math.max(1, Math.ceil((audit.data?.total ?? 0) / PAGE_SIZE));
  const people = [...users.byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <AdminHeader intro={t("admin.audit.intro")} />
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t("admin.audit.person")}
          value={userId}
          options={[
            { value: "all", label: t("admin.audit.anyone") },
            ...people.map((u) => ({ value: u.id, label: `${u.name} (${t(`roles.${u.role}`)})` })),
          ]}
          onChange={setUserId}
        />
        <Select
          label={t("admin.audit.area")}
          value={area}
          options={[
            { value: "all", label: t("admin.audit.everything") },
            ...AREAS.map((a) => ({ value: a, label: t(`admin.audit.areas.${a.slice(0, -1)}`) })),
          ]}
          onChange={setArea}
        />
      </div>
      <section
        aria-labelledby="admin-audit"
        className={cx("rounded-lg border border-line bg-surface p-4", audit.isPlaceholderData && "opacity-60")}
      >
        <h2 id="admin-audit" className="mb-3 font-semibold">
          {t("admin.audit.title", { count: audit.data?.total ?? 0 })}
        </h2>
        {!audit.data ? (
          <Skeleton className="h-64" />
        ) : audit.data.items.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("admin.noChanges")}</p>
        ) : (
          <AuditTable entries={audit.data.items} caption={t("admin.audit.caption")} />
        )}
        <nav aria-label={t("admin.audit.pagination")} className="mt-3 flex items-center justify-end gap-2 text-sm">
          <span className="text-fg-muted">{t("assets.page", { page: page + 1, pages })}</span>
          <Button
            size="sm"
            disabled={page === 0}
            onClick={() => setPaging({ filterKey, page: page - 1 })}
            aria-label={t("assets.previous")}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <Button
            size="sm"
            disabled={page + 1 >= pages}
            onClick={() => setPaging({ filterKey, page: page + 1 })}
            aria-label={t("assets.next")}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </nav>
      </section>
    </div>
  );
}
