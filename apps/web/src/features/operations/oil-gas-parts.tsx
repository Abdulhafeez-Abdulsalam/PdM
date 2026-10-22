/** Pieces shared by the oil & gas page and Asset 360's oil & gas Performance tabs. */
import type { UpstreamView } from "@pdm/contracts";
import { DECLINE_HISTORY_DAYS } from "@pdm/contracts";
import { cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { toDisplay } from "../../shared/units";
import { LineChart } from "../../shared/widgets/LineChart";

const dayTick = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
const dayFull = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

/** Daily oil rate with the fitted decline curve and its forecast; "Today" marks where history ends. */
export function DeclineChart({ production, fit, label }: Pick<UpstreamView, "production" | "fit"> & { label: string }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  const conv = (v: number | null) => (v === null ? null : toDisplay(v, "liquid_flow", units).value);
  const unit = t(`unitSymbol.${toDisplay(0, "liquid_flow", units).unit}`);
  const times = production.map((p) => Date.parse(p.t));
  const today = times[DECLINE_HISTORY_DAYS] ?? times.at(-1)!;
  const summary = fit ? t("oilGas.up.fitSummary", { pct: fit.declinePctPerYear.toFixed(1), r2: fit.r2.toFixed(2) }) : t("oilGas.up.noFit");
  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-sm text-fg-muted">{summary}</figcaption>
      <LineChart
        times={times}
        series={[
          { id: "actual", label: t("oilGas.up.actual"), values: production.map((p) => conv(p.actual)), color: "var(--pdm-series-1)" },
          { id: "fit", label: t("oilGas.up.fit"), values: production.map((p) => conv(p.fit)), color: "var(--pdm-series-2)", dashed: true },
        ]}
        label={label}
        summary={summary}
        format={(v) => `${formatNumber(v)} ${unit}`}
        formatTime={(ms) => dayFull.format(ms)}
        formatTick={(ms) => dayTick.format(ms)}
        markers={[{ t: today, label: t("oilGas.up.today") }]}
      />
    </figure>
  );
}

// ─── Small pieces ────────────────────────────────────────────────────────────

export function Th({ children, right }: { children: ReactNode; right?: boolean }) {
  return (
    <th scope="col" className={cx("py-1 pr-3 font-medium", right && "text-right")}>
      {children}
    </th>
  );
}

export function AssetLink({ id }: { id: string }) {
  return (
    <Link to="/assets/$assetId/$tab" params={{ assetId: id, tab: "performance" }} className="font-mono whitespace-nowrap hover:underline">
      {id}
    </Link>
  );
}

/** Text that turns to the warning colour with an icon when `on`: never colour alone. */
export function Flagged({ on, children }: { on: boolean; children: ReactNode }) {
  if (!on) return <>{children}</>;
  return (
    <span className="inline-flex items-center gap-1 font-medium text-health-warning">
      <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
      {children}
    </span>
  );
}

/** A table in a scrollable box (long lists stay a sensible height). */
export function ScrollTable({ label, children, minWidth = 560 }: { label: string; children: ReactNode; minWidth?: number }) {
  const { t } = useTranslation();
  return (
    <div
      className="max-h-[28rem] overflow-auto"
      role="region"
      aria-label={t("oilGas.tableOf", { name: label })}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a named, focusable scroll region is the recommended pattern here
      tabIndex={0}
    >
      <table className="w-full text-sm" style={{ minWidth }}>
        <caption className="sr-only">{label}</caption>
        {children}
      </table>
    </div>
  );
}
