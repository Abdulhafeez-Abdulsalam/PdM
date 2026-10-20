/**
 * The widget contract (design system §10), built once so every dashboard tile gets it free:
 * title · freshness badge · lineage tooltip · loading / error / empty states · its own error boundary.
 */
import { Button, ErrorBoundary, Popover, Skeleton, cx } from "@pdm/ui";
import { CircleAlert, Clock, Info } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatAgo } from "../format";
import { useNow } from "../use-now";

export interface WidgetQueryState {
  isPending: boolean;
  isError: boolean;
  /** When the data was fetched (ms). TanStack Query gives this as dataUpdatedAt. */
  dataUpdatedAt: number;
  refetch: () => unknown;
  /** True while showing the previous answer as a placeholder (keepPreviousData). */
  isPlaceholderData?: boolean;
}

interface Props {
  title: string;
  /** Where the numbers come from, shown on hover/focus of the info icon. */
  lineage?: string;
  query?: WidgetQueryState;
  isEmpty?: boolean;
  emptyText?: string;
  /** Data older than this (ms) is flagged stale. */
  staleAfterMs?: number;
  actions?: ReactNode;
  className?: string;
  /** Shape of the loading placeholder. */
  skeleton?: ReactNode;
  children: ReactNode;
}

export function DashboardWidget({
  title,
  lineage,
  query,
  isEmpty,
  emptyText,
  staleAfterMs = 120_000,
  actions,
  className,
  skeleton,
  children,
}: Props) {
  const { t } = useTranslation();
  const now = useNow();
  const headingId = `w-${title.replace(/\W+/g, "-").toLowerCase()}`;
  const updated = query && query.dataUpdatedAt > 0 ? query.dataUpdatedAt : null;
  const stale = updated !== null && now - updated > staleAfterMs;

  const errorView = (onRetry: () => void) => (
    <div role="alert" className="flex flex-col items-start gap-2 p-2 text-sm">
      <p className="flex items-center gap-2 text-health-warning">
        <CircleAlert aria-hidden className="size-4" />
        {t("widget.failed")}
      </p>
      <Button size="sm" onClick={onRetry}>
        {t("widget.retry")}
      </Button>
    </div>
  );

  let body: ReactNode;
  if (query?.isPending) body = skeleton ?? <Skeleton className="h-32 w-full" />;
  else if (query?.isError) body = errorView(() => void query.refetch());
  else if (isEmpty) body = <p className="p-2 text-sm text-fg-muted">{emptyText ?? t("widget.empty")}</p>;
  else body = children;

  return (
    <section
      aria-labelledby={headingId}
      aria-busy={query?.isPending}
      className={cx("flex min-w-0 flex-col rounded-lg border border-line bg-surface", className)}
    >
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <h2 id={headingId} className="font-semibold">
          {title}
        </h2>
        {lineage && (
          // A real button, so it works by keyboard and touch — a hover-only tooltip wouldn't.
          <Popover
            align="start"
            className="max-w-xs p-3 text-sm"
            trigger={
              <button
                type="button"
                aria-label={t("widget.lineage", { title })}
                className="rounded p-0.5 text-fg-muted hover:bg-sunken hover:text-fg"
              >
                <Info aria-hidden className="size-3.5" />
              </button>
            }
          >
            {lineage}
          </Popover>
        )}
        <span className="ml-auto flex items-center gap-2">
          {updated !== null && (
            <span className={cx("flex items-center gap-1 text-xs", stale ? "text-health-warning" : "text-fg-muted")}>
              <Clock aria-hidden className="size-3" />
              {stale ? t("widget.stale", { ago: formatAgo(updated, now) }) : t("widget.updated", { ago: formatAgo(updated, now) })}
            </span>
          )}
          {actions}
        </span>
      </header>
      {/* Refetching for a new scope: dim the old content rather than flash a skeleton. */}
      <div className={cx("min-h-0 flex-1 p-4 transition-opacity", query?.isPlaceholderData && "opacity-60")}>
        <ErrorBoundary fallback={(_error, reset) => errorView(reset)}>{body}</ErrorBoundary>
      </div>
    </section>
  );
}
