/**
 * Asset 360 → Failures: every recorded failure of this asset (ISO 14224 coded), and how its
 * MTBF, MTTR and availability compare with the rest of its class over the same years.
 */
import { useApiQuery } from "@pdm/api-client";
import type { Asset, ReliabilityKpis } from "@pdm/contracts";
import { Skeleton } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { Repeat } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate, formatNumber } from "../../shared/format";
import { causeKey, formatDuration } from "../reliability/reliability-format";

export function FailuresTab({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const data = useApiQuery("assets.failures", { assetId: asset.id }, { refetchInterval: 60_000 });
  if (data.isPending) return <Skeleton className="h-96" />;
  if (!data.data) return <p className="text-health-warning">{t("widget.failed")}</p>;
  const { failures, kpis, classKpis } = data.data;
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="fail-compare" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="fail-compare" className="font-semibold">
          {t("failuresTab.compareTitle", { years: 5 })}
        </h2>
        <p className="mb-2 text-sm text-fg-muted">{t("failuresTab.compareIntro", { name: t(`assetClass.${asset.assetClass}`) })}</p>
        <CompareTable own={kpis} cls={classKpis} />
        <p className="mt-3 text-sm">
          <Link to="/reliability/rca" search={{ asset: asset.id }} className="text-accent hover:underline">
            {t("failuresTab.startRca")}
          </Link>
        </p>
      </section>

      <section aria-labelledby="fail-list" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="fail-list" className="font-semibold">
          {t("failuresTab.listTitle", { count: failures.length })}
        </h2>
        {failures.length === 0 ? (
          <p className="mt-2 text-sm text-fg-muted">{t("failuresTab.none")}</p>
        ) : (
          <div className="-mx-4 overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <caption className="sr-only">{t("failuresTab.listCaption")}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th scope="col" className="px-4 py-1 font-medium">
                    {t("failuresTab.col.when")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("failuresTab.col.mode")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("failuresTab.col.cause")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("failuresTab.col.remedy")}
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    {t("failuresTab.col.repair")}
                  </th>
                  <th scope="col" className="py-1 pr-4 text-right font-medium">
                    {t("failuresTab.col.downtime")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {failures.map((f) => (
                  <tr key={f.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-1 whitespace-nowrap">
                      {formatDate(f.failedAt)}
                      {f.workOrderId ? (
                        <Link
                          to="/maintenance/$workOrderId"
                          params={{ workOrderId: f.workOrderId }}
                          className="block font-mono text-xs hover:underline"
                        >
                          {f.workOrderId}
                        </Link>
                      ) : (
                        <span className="block font-mono text-xs text-fg-muted">{f.id}</span>
                      )}
                    </td>
                    <td className="py-1 pr-3">
                      {t(`iso14224.mode.${f.mode}`)}
                      {f.repeat && (
                        <span className="flex items-center gap-1 text-xs font-medium text-health-warning">
                          <Repeat aria-hidden className="size-3.5" />
                          {t("failuresTab.repeat")}
                        </span>
                      )}
                    </td>
                    <td className="py-1 pr-3">{t(causeKey(f.cause))}</td>
                    <td className="py-1 pr-3">{t(`iso14224.remedy.${f.remedy}`)}</td>
                    <td className="py-1 pr-3 text-right tabular-nums">
                      {t("reliability.hours", { value: formatNumber(f.repairHours, 1) })}
                    </td>
                    <td className="py-1 pr-4 text-right tabular-nums">
                      {t("reliability.hours", { value: formatNumber(f.downtimeHours, 1) })}
                    </td>
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

function CompareTable({ own, cls }: { own: ReliabilityKpis; cls: ReliabilityKpis }) {
  const { t } = useTranslation();
  const rows: [string, (k: ReliabilityKpis) => string][] = [
    ["failures", (k) => formatNumber(k.failures)],
    ["rate", (k) => k.failureRatePerYear.toFixed(2)],
    ["mtbf", (k) => formatDuration(k.mtbfHours, t)],
    ["mttr", (k) => formatDuration(k.mttrHours, t)],
    ["availability", (k) => `${k.availabilityPct.toFixed(2)} %`],
    ["repeats", (k) => formatNumber(k.repeatFailures)],
  ];
  return (
    <table className="w-full max-w-xl text-sm">
      <caption className="sr-only">{t("failuresTab.compareCaption")}</caption>
      <thead>
        <tr className="border-b border-line text-left text-xs text-fg-muted">
          <th scope="col" className="py-1 font-medium">
            <span className="sr-only">{t("failuresTab.measure")}</span>
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t("failuresTab.thisAsset")}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t("failuresTab.classAll", { count: cls.assets })}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([key, fmt]) => (
          <tr key={key} className="border-b border-line last:border-0">
            <th scope="row" className="py-1 text-left font-normal">
              {t(`reliability.col.${key}`)}
            </th>
            <td className="py-1 text-right font-medium tabular-nums">{fmt(own)}</td>
            <td className="py-1 text-right text-fg-muted tabular-nums">{fmt(cls)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
