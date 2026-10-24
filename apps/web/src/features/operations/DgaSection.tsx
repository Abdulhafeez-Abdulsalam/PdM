/**
 * Transformer oil analysis (DGA): a plant's transformers on the Duval triangle, and a table
 * with the numbers. The condition (1 normal … 4 act now) comes from how much gas there is;
 * the triangle zone says what kind of fault is making it. A zone only matters once there's
 * enough gas: healthy oil always sits somewhere, usually in T1 or T2.
 */
import { DGA_GASES, type DgaSample, type TransformerDga } from "@pdm/contracts";
import { cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate, formatNumber } from "../../shared/format";
import { DuvalTriangle } from "./DuvalTriangle";
import { signed } from "./power-format";

export function DgaSection({ transformers }: { transformers: readonly TransformerDga[] }) {
  const { t } = useTranslation();
  const marks = transformers.flatMap((tx) => {
    const s = tx.samples[0]!;
    return s.duval ? [{ id: tx.assetId, label: tx.assetId, ...s.duval, emphasis: s.condition >= 2 }] : [];
  });
  const concern = transformers.filter((tx) => tx.samples[0]!.condition >= 2);
  const summary =
    concern.length === 0
      ? t("dga.summaryAllNormal", { count: transformers.length })
      : t("dga.summaryConcern", {
          count: concern.length,
          list: concern.map((tx) => `${tx.assetId} (${t(`dga.zone.${tx.samples[0]!.duval?.zone ?? "T1"}`)})`).join(", "),
        });

  return (
    <section aria-labelledby="dga-title" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="dga-title" className="font-semibold">
        {t("dga.title")}
      </h2>
      <p className="mb-3 text-sm text-fg-muted">{t("dga.intro")}</p>
      {transformers.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("dga.none")}</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(280px,420px)_minmax(0,1fr)]">
          <div>
            <DuvalTriangle marks={marks} label={t("dga.triangleLabel")} summary={summary} />
            <p className="mt-1 text-xs text-fg-muted">{summary}</p>
          </div>
          <div className="relative -mx-4 overflow-x-auto lg:mx-0">
            <table className="w-full min-w-[560px] text-sm">
              <caption className="sr-only">{t("dga.tableCaption")}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th scope="col" className="px-4 py-2 font-medium lg:pl-0">
                    {t("dga.col.transformer")}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t("dga.col.condition")}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    {t("dga.col.tdcg")}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    {t("dga.col.perDay")}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t("dga.col.zone")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {transformers.map((tx) => {
                  const s = tx.samples[0]!;
                  return (
                    <tr key={tx.assetId} className="border-b border-line last:border-0">
                      <td className="px-4 py-2 lg:pl-0">
                        <Link
                          to="/assets/$assetId/$tab"
                          params={{ assetId: tx.assetId, tab: "performance" }}
                          className="font-mono whitespace-nowrap hover:underline"
                        >
                          {tx.assetId}
                        </Link>
                        <span className="block text-xs text-fg-muted">{t("dga.sampled", { date: formatDate(s.sampledAt) })}</span>
                      </td>
                      <td className="py-2 pr-3">
                        <ConditionLabel sample={s} />
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{formatNumber(s.tdcg)} ppm</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{tx.tdcgPerDay === null ? "—" : signed(tx.tdcgPerDay)}</td>
                      <td className="py-2 pr-3">{s.duval ? t(`dga.zone.${s.duval.zone}`) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

/** "Condition 2 · set by H₂", with a warning icon from condition 2 up. */
export function ConditionLabel({ sample }: { sample: DgaSample }) {
  const { t } = useTranslation();
  const flagged = sample.condition >= 2;
  return (
    <span className={cx("flex flex-col text-xs", flagged ? "text-health-warning" : "text-fg")}>
      <span className="flex items-center gap-1 font-medium">
        {flagged && <AlertTriangle aria-hidden className="size-3.5" />}
        {t(`dga.condition.${sample.condition}`)}
      </span>
      {flagged && <span>{t("dga.setBy", { gas: t(`dga.gas.${sample.worst}`) })}</span>}
    </span>
  );
}

/** The latest sample's gases with each gas's own condition, for Asset 360. */
export function GasTable({ sample }: { sample: DgaSample }) {
  const { t } = useTranslation();
  return (
    <table className="w-full text-sm">
      <caption className="sr-only">{t("dga.gasesCaption")}</caption>
      <thead>
        <tr className="border-b border-line text-left text-xs text-fg-muted">
          <th scope="col" className="py-1 font-medium">
            {t("dga.col.gas")}
          </th>
          <th scope="col" className="py-1 text-right font-medium">
            {t("dga.col.ppm")}
          </th>
          <th scope="col" className="py-1 pl-3 font-medium">
            {t("dga.col.source")}
          </th>
        </tr>
      </thead>
      <tbody>
        {DGA_GASES.map((g) => (
          <tr key={g} className="border-b border-line last:border-0">
            <th scope="row" className="py-1 text-left font-normal">
              {t(`dga.gas.${g}`)}
              <span className="block text-xs text-fg-muted">{t(`dga.gasMeaning.${g}`)}</span>
            </th>
            <td className={cx("py-1 text-right tabular-nums", g === sample.worst && sample.condition >= 2 && "font-semibold")}>
              {formatNumber(sample.gases[g], 1)}
            </td>
            <td className="py-1 pl-3 text-xs text-fg-muted">
              {t(g === "H2" || g === "C2H2" || g === "CO" ? "dga.sourceOnline" : "dga.sourceLab")}
            </td>
          </tr>
        ))}
        <tr>
          <th scope="row" className="py-1 text-left font-medium">
            {t("dga.gas.TDCG")}
          </th>
          <td className="py-1 text-right font-medium tabular-nums">{formatNumber(sample.tdcg, 1)}</td>
          <td />
        </tr>
      </tbody>
    </table>
  );
}
