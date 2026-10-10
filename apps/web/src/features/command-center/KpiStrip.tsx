/** The KPI strip at the top of the Command Center. */
import { useApiQuery } from "@pdm/api-client";
import type { Kpi, RoleId } from "@pdm/contracts";
import { KpiCard, Skeleton } from "@pdm/ui";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { formatCompact, formatCurrency, formatNumber } from "../../shared/format";
import { KPI_PRESETS } from "./presets";

export function formatKpiValue(kpi: Kpi): { value: string; unit?: string } {
  if (kpi.value === null) return { value: "—" };
  switch (kpi.format) {
    case "currency":
      return { value: formatCurrency(kpi.value, kpi.currency ?? "USD") };
    case "percent":
      return { value: formatNumber(kpi.value, 1), unit: "%" };
    case "hours":
      return { value: kpi.value >= 10_000 ? formatCompact(kpi.value) : formatNumber(kpi.value, kpi.value < 100 ? 1 : 0), unit: "h" };
    case "score":
      return { value: formatNumber(kpi.value, 1) };
    case "count":
      return { value: formatNumber(kpi.value) };
  }
}

/** "Up is good" depends on the KPI: more availability is good, more backlog is not. */
export function kpiChange(kpi: Kpi, t: TFunction) {
  if (kpi.changePct === null) return {};
  const flat = Math.abs(kpi.changePct) < 0.5;
  const up = kpi.changePct > 0;
  return {
    change: t("kpi.change", { value: `${up ? "+" : ""}${formatNumber(kpi.changePct, 1)}` }),
    changeDirection: flat ? ("flat" as const) : up ? ("up" as const) : ("down" as const),
    changeTone: flat ? ("neutral" as const) : up === kpi.higherIsBetter ? ("good" as const) : ("bad" as const),
  };
}

export function KpiStrip({ scopeId, role }: { scopeId: string; role: RoleId }) {
  const { t } = useTranslation();
  const keys = KPI_PRESETS[role];
  const kpis = useApiQuery("kpis.get", { scopeId, keys: [...keys] }, { refetchInterval: 30_000 });

  return (
    <section aria-label={t("commandCenter.kpis")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {kpis.isPending
        ? keys.map((k) => <Skeleton key={k} className="h-[104px]" />)
        : kpis.data?.kpis.map((kpi) => {
            const { value, unit } = formatKpiValue(kpi);
            const target = kpi.target === null ? undefined : formatKpiValue({ ...kpi, value: kpi.target });
            return (
              <KpiCard
                key={kpi.key}
                label={t(`kpi.${kpi.key}`)}
                value={value}
                unit={unit}
                trend={kpi.trend}
                lineage={kpi.lineage}
                target={target ? t("kpi.target", { value: `${target.value}${target.unit ? ` ${target.unit}` : ""}` }) : undefined}
                {...kpiChange(kpi, t)}
              />
            );
          })}
      {kpis.isError && <p className="col-span-full text-sm text-health-warning">{t("widget.failed")}</p>}
    </section>
  );
}
