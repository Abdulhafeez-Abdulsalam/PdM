/** The Predictive module's two pages: predictions (what will fail) and anomalies (what looks unusual). */
import { cx } from "@pdm/ui";
import { Link, useLocation, useSearch } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { globalSearchSchema } from "../../shared/time-range";

const PAGES = [
  { to: "/predictive", key: "predictions" },
  { to: "/predictive/anomalies", key: "anomalies" },
] as const;

export function PredictiveNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  // Keep the page-wide scope and time range; drop the other page's own filters.
  const { scope, range } = globalSearchSchema.parse(useSearch({ strict: false }));
  return (
    <nav aria-label={t("predictiveNav.label")} className="flex gap-1 border-b border-line">
      {PAGES.map((p) => {
        const current = pathname === p.to;
        return (
          <Link
            key={p.to}
            to={p.to}
            search={{ scope, range }}
            aria-current={current ? "page" : undefined}
            className={cx(
              "-mb-px border-b-2 px-3 py-2 text-sm",
              current ? "border-accent font-semibold" : "border-transparent text-fg-muted hover:text-fg",
            )}
          >
            {t(`predictiveNav.${p.key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
