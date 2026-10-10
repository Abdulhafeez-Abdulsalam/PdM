/**
 * The asset context selector (IA §1): a breadcrumb of where you are in the hierarchy,
 * plus a drill-down panel. Choosing a node sets ?scope=… so every page filters to it.
 *
 *   Enterprise › Middle East › Power Generation › Al Noor CCGT ▾
 */
import { useApiQuery } from "@pdm/api-client";
import { ENTERPRISE_SCOPE, type HierarchyNode } from "@pdm/contracts";
import { HealthBadge, Popover, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGlobalSearch, useSetGlobalSearch } from "../../shared/time-range";

export function ScopeSelector() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const setSearch = useSetGlobalSearch();
  // keepPreviousData: while the new scope loads, keep showing the old one instead of flashing back to empty.
  const path = useApiQuery("hierarchy.path", { nodeId: scopeId }, { placeholderData: keepPreviousData });
  const [open, setOpen] = useState(false);

  // A scope in the URL that doesn't exist (old link, typo) → fall back to the whole enterprise.
  useEffect(() => {
    if (path.isError && scopeId !== ENTERPRISE_SCOPE) setSearch({ scope: undefined });
  }, [path.isError, scopeId, setSearch]);

  const nodes = path.data?.items ?? [];
  const current = nodes.at(-1);

  return (
    <nav aria-label={t("hierarchy.label")} className="flex min-w-0 items-center gap-1 text-sm">
      {path.isPending ? (
        <Skeleton className="h-5 w-40" />
      ) : (
        <ol className="hidden min-w-0 items-center gap-1 lg:flex">
          {nodes.slice(0, -1).map((n) => (
            <li key={n.id} className="flex min-w-0 items-center gap-1">
              <button type="button" className="truncate text-fg-muted hover:text-fg hover:underline" onClick={() => setSearch({ scope: n.id })}>
                {n.name}
              </button>
              <ChevronRight aria-hidden className="size-3.5 shrink-0 text-fg-muted" />
            </li>
          ))}
        </ol>
      )}
      <Popover
        open={open}
        onOpenChange={setOpen}
        className="w-80"
        trigger={
          <button
            type="button"
            aria-label={t("hierarchy.change", { current: current?.name ?? t("topBar.enterprise") })}
            className="flex min-w-0 items-center gap-1.5 rounded-md px-2 py-1 font-medium hover:bg-sunken"
          >
            {current && <HealthBadge compact state={current.health} label={t(`health.${current.health}`)} />}
            <span aria-current="page" className="truncate">
              {current?.name ?? t("topBar.enterprise")}
            </span>
            <ChevronDown aria-hidden className="size-4 shrink-0 text-fg-muted" />
          </button>
        }
      >
        <ScopeBrowser
          path={nodes}
          onSelect={(node) => {
            setSearch({ scope: node.id });
            if (node.childCount === 0) setOpen(false);
          }}
          onNavigateAway={() => setOpen(false)}
        />
      </Popover>
    </nav>
  );
}

/** Inside the panel: the current node's children, each with its health. Click to go deeper. */
function ScopeBrowser({ path, onSelect, onNavigateAway }: { path: HierarchyNode[]; onSelect: (n: HierarchyNode) => void; onNavigateAway: () => void }) {
  const { t } = useTranslation();
  const current = path.at(-1);
  const children = useApiQuery("hierarchy.children", { nodeId: current?.id ?? ENTERPRISE_SCOPE }, { placeholderData: keepPreviousData });
  const parent = path.at(-2);

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="border-b border-line p-3">
        <p className="text-xs uppercase tracking-wide text-fg-muted">{current ? t(`hierarchy.levels.${current.level}`) : ""}</p>
        <p className="font-semibold">{current?.name}</p>
        <div className="mt-1 flex gap-3 text-xs">
          {parent && (
            <button type="button" className="text-accent hover:underline" onClick={() => onSelect(parent)}>
              ↑ {t("hierarchy.up", { name: parent.name })}
            </button>
          )}
          {current?.assetId && (
            <Link to="/assets/$assetId" params={{ assetId: current.assetId }} search={(prev) => prev} onClick={onNavigateAway} className="flex items-center gap-1 text-accent hover:underline">
              <ExternalLink aria-hidden className="size-3" />
              {t("hierarchy.openAsset")}
            </Link>
          )}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {children.isPending ? (
          <div className="flex flex-col gap-2 p-2">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
          </div>
        ) : children.data && children.data.items.length > 0 ? (
          <ul aria-label={t("hierarchy.children")}>
            {children.data.items.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => onSelect(n)}
                  className={cx("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunken")}
                >
                  <HealthBadge compact state={n.health} label={t(`health.${n.health}`)} />
                  <span className="min-w-0 flex-1 truncate">{n.name}</span>
                  {n.childCount > 0 && (
                    <span className="flex items-center text-xs text-fg-muted">
                      {n.childCount}
                      <ChevronRight aria-hidden className="size-3.5" />
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="p-3 text-sm text-fg-muted">{t("hierarchy.noChildren")}</p>
        )}
      </div>
    </div>
  );
}
