/**
 * FMEA (failure mode and effects analysis, spec §6.7): for one type of equipment, each way it
 * fails scored for severity, occurrence and detection (1–10 each). RPN = S × O × D ranks
 * where to act; very severe modes are acted on whatever their RPN. Each row says what the
 * maintenance plan should do about it, from its Weibull pattern and whether a model watches it.
 */
import { useApiQuery } from "@pdm/api-client";
import { AssetClass, FMEA_RPN_ACT, FMEA_SEVERITY_ACT, type FmeaRow } from "@pdm/contracts";
import { Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatNumber } from "../../shared/format";
import { ReliabilityNav } from "./ReliabilityNav";
import { causeKey } from "./reliability-format";

const searchSchema = z.object({ class: AssetClass.catch("pump").default("pump") });

export function FmeaPage() {
  const { t } = useTranslation();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();
  const data = useApiQuery(
    "reliability.fmea",
    { assetClass: search.class },
    { placeholderData: keepPreviousData, refetchInterval: 120_000 },
  );

  useEffect(() => {
    document.title = `${t("fmea.title")} · ${t("app.name")}`;
  }, [t]);

  const f = data.data;
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.reliability.name")}</h1>
        <p className="text-fg-muted">{t("fmea.intro")}</p>
      </header>
      <ReliabilityNav />
      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t("reliability.classLabel")}
          value={search.class}
          options={AssetClass.options.map((c) => ({ value: c, label: t(`assetClass.${c}`) }))}
          onChange={(v) => void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, class: v }), replace: true })}
        />
      </div>
      {data.isPending ? (
        <Skeleton className="h-96" />
      ) : data.isError || !f ? (
        <p className="text-health-warning">{t("widget.failed")}</p>
      ) : (
        <section
          aria-labelledby="fmea-table"
          className={cx("rounded-lg border border-line bg-surface p-4", data.isPlaceholderData && "opacity-60")}
        >
          <h2 id="fmea-table" className="font-semibold">
            {t("fmea.tableTitle", { name: t(`assetClass.${f.assetClass}`) })}
          </h2>
          <p className="mb-1 text-sm text-fg-muted">{t("fmea.tableIntro", { rpn: FMEA_RPN_ACT, severity: FMEA_SEVERITY_ACT })}</p>
          <p className="mb-3 text-sm">
            {t("fmea.plan", { count: f.assets, preventive: f.plannedPreventive })}{" "}
            <Link to="/maintenance" search={(prev) => ({ ...prev, view: "list" })} className="text-accent underline">
              {t("fmea.openPlan")}
            </Link>
          </p>
          <div className="relative -mx-4 overflow-x-auto">
            <table className="w-full min-w-[960px] text-sm">
              <caption className="sr-only">{t("fmea.caption")}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th scope="col" className="px-4 py-1 font-medium">
                    {t("fmea.col.mode")}
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    <abbr title={t("fmea.severityFull")}>{t("fmea.col.s")}</abbr>
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    <abbr title={t("fmea.occurrenceFull")}>{t("fmea.col.o")}</abbr>
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    <abbr title={t("fmea.detectionFull")}>{t("fmea.col.d")}</abbr>
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    {t("fmea.col.rpn")}
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    {t("fmea.col.rate")}
                  </th>
                  <th scope="col" className="py-1 pr-4 font-medium">
                    {t("fmea.col.strategy")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {f.rows.map((r) => (
                  <Row key={r.mode} r={r} assetClass={f.assetClass} />
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-xs text-fg-muted">{t("fmea.scales")}</p>
        </section>
      )}
    </div>
  );
}

function Row({ r, assetClass }: { r: FmeaRow; assetClass: AssetClass }) {
  const { t } = useTranslation();
  return (
    <tr className="border-b border-line align-top last:border-0">
      <td className="px-4 py-2">
        <span className="font-medium">{t(`iso14224.mode.${r.mode}`)}</span>
        <span className="block text-xs text-fg-muted">
          {r.mode} · {t(causeKey(r.cause))}
        </span>
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">{r.severity}</td>
      <td className="py-2 pr-3 text-right tabular-nums">{r.occurrence}</td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {r.detection}
        {r.monitored && <span className="block text-xs text-fg-muted">{t("fmea.monitored")}</span>}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {r.act ? (
          <span className="inline-flex items-center gap-1 font-semibold text-health-warning">
            <AlertTriangle aria-hidden className="size-3.5" />
            {r.rpn}
            <span className="sr-only"> {t("fmea.act")}</span>
          </span>
        ) : (
          r.rpn
        )}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {r.ratePerAssetYear.toFixed(3)}
        <span className="block text-xs text-fg-muted">{t("fmea.failures", { count: r.failures })}</span>
      </td>
      <td className="py-2 pr-4">
        <span className="font-medium">{t(`fmea.strategy.${r.strategy}`)}</span>
        <span className="block text-xs text-fg-muted">
          {t(`fmea.strategyWhy.${r.strategy}`, { b10: r.b10Days === null ? "—" : formatNumber(r.b10Days) })}
        </span>
        {r.pattern && (
          <Link
            to="/reliability/weibull"
            search={(prev) => ({ ...prev, class: assetClass, mode: r.mode })}
            className="text-xs text-accent hover:underline"
          >
            {t("fmea.seeWeibull", { pattern: t(`weibull.pattern.${r.pattern}`) })}
          </Link>
        )}
      </td>
    </tr>
  );
}
