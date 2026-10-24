/**
 * Links between a module's pages (e.g. Predictions | Anomalies), styled as tabs. Real links,
 * so they can be opened in a new tab and the current one is announced as "current page".
 * The page-wide scope and time range come along; each page's own filters don't. On a phone,
 * tabs that don't fit scroll sideways inside the bar, not the page.
 */
import { cx } from "@pdm/ui";
import { Link, useLocation, useSearch, type LinkProps } from "@tanstack/react-router";
import { globalSearchSchema } from "../time-range";

export function SubNav({ label, pages }: { label: string; pages: readonly { to: NonNullable<LinkProps["to"]>; label: string }[] }) {
  const { pathname } = useLocation();
  const { scope, range } = globalSearchSchema.parse(useSearch({ strict: false }));
  return (
    <nav aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line">
      {pages.map((p) => {
        const current = pathname === p.to;
        return (
          <Link
            key={p.to}
            to={p.to}
            search={{ scope, range }}
            aria-current={current ? "page" : undefined}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap",
              current ? "border-accent font-semibold" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {p.label}
          </Link>
        );
      })}
    </nav>
  );
}
