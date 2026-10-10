/**
 * Top risks (acceptance criterion A): assets ranked by failure probability × consequence.
 * Always in the first screenful of every Command Center layout.
 */
import { useApiQuery } from "@pdm/api-client";
import { HealthBadge, Skeleton } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatNumber, formatProbability } from "../../shared/format";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";

const MAX_RISK = 5; // probability (≤ 1) × consequence (≤ 5)

export function TopRisks({ scopeId, className }: { scopeId: string; className?: string }) {
  const { t } = useTranslation();
  const risks = useApiQuery("risks.top", { scopeId, limit: 5 }, { refetchInterval: 30_000 });
  const items = risks.data?.items ?? [];

  return (
    <DashboardWidget
      title={t("commandCenter.topRisks")}
      lineage={t("commandCenter.topRisksLineage")}
      query={risks}
      isEmpty={items.length === 0}
      emptyText={t("commandCenter.noRisks")}
      className={className}
      skeleton={<div className="flex flex-col gap-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9" />)}</div>}
    >
      <div className="-mx-4 overflow-x-auto">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="px-4 py-2 font-medium">#</th>
              <th scope="col" className="py-2 font-medium">{t("commandCenter.col.asset")}</th>
              <th scope="col" className="py-2 font-medium">{t("commandCenter.col.health")}</th>
              <th scope="col" className="py-2 font-medium">{t("commandCenter.col.predicted")}</th>
              <th scope="col" className="py-2 text-right font-medium">{t("commandCenter.col.probability")}</th>
              <th scope="col" className="px-4 py-2 font-medium">{t("commandCenter.col.risk")}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((r) => (
              <tr key={r.assetId} className="border-b border-line last:border-0 hover:bg-sunken">
                <td className="px-4 py-2 tabular-nums text-fg-muted">{r.rank}</td>
                <td className="py-2 pr-3">
                  <Link to="/assets/$assetId" params={{ assetId: r.assetId }} search={(prev) => prev} className="font-medium hover:underline">
                    {r.assetName.replace(` ${r.assetId}`, "")}
                  </Link>
                  <span className="block font-mono text-xs text-fg-muted">{r.assetId}</span>
                </td>
                <td className="py-2 pr-3">
                  <HealthBadge state={r.health.state} label={`${t(`health.${r.health.state}`)} · ${formatNumber(r.health.score)}`} />
                </td>
                <td className="py-2 pr-3">
                  {r.failureModeLabel ? (
                    <>
                      {r.failureModeLabel}
                      <span className="block text-xs text-fg-muted">{t("commandCenter.withinDays", { count: r.horizonDays ?? 0 })}</span>
                    </>
                  ) : (
                    <span className="text-fg-muted">—</span>
                  )}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{formatProbability(r.probability)}</td>
                <td className="px-4 py-2">
                  <span className="flex items-center gap-2">
                    {/* Bar is decorative; the number next to it is what's read out. */}
                    <span aria-hidden className="h-1.5 w-16 overflow-hidden rounded-full bg-sunken">
                      <span className="block h-full rounded-full bg-health-warning" style={{ width: `${(r.riskScore / MAX_RISK) * 100}%` }} />
                    </span>
                    <span className="tabular-nums">{formatNumber(r.riskScore, 1)}</span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </DashboardWidget>
  );
}
