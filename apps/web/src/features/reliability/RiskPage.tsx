/**
 * The risk matrix (spec §6.7): every asset placed by how likely it is to fail within a year
 * (across) against how bad that would be (its criticality). Risk = likelihood × consequence.
 * Pick a cell to list its assets; without a pick, the riskiest are listed.
 *
 * Cell colours carry a status (low → extreme), so each cell also says its level in words.
 */
import { useApiQuery } from "@pdm/api-client";
import { riskLevel, type RiskLevel, type RiskMatrix } from "@pdm/contracts";
import { Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useGlobalSearch } from "../../shared/time-range";
import { ReliabilityNav } from "./ReliabilityNav";

const level = z.coerce.number().int().min(1).max(5);
const searchSchema = z.object({ l: level.optional().catch(undefined), c: level.optional().catch(undefined) });

const TONE: Record<RiskLevel, string> = {
  low: "var(--pdm-health-healthy)",
  medium: "var(--pdm-health-watch)",
  high: "var(--pdm-health-warning)",
  extreme: "var(--pdm-health-critical)",
};
const tint = (l: RiskLevel) => `color-mix(in oklab, ${TONE[l]} 22%, var(--pdm-bg-surface))`;

export function RiskPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();
  const pick = (l?: number, c?: number) =>
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, l, c }), replace: true });
  const selected = search.l && search.c ? { l: search.l, c: search.c } : null;
  const data = useApiQuery(
    "reliability.risk",
    { scopeId, likelihood: selected?.l, consequence: selected?.c },
    { placeholderData: keepPreviousData, refetchInterval: 60_000 },
  );

  useEffect(() => {
    document.title = `${t("risk.title")} · ${t("app.name")}`;
  }, [t]);

  const r = data.data;
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.reliability.name")}</h1>
        <p className="text-fg-muted">{t("risk.intro")}</p>
      </header>
      <ReliabilityNav />
      {data.isPending ? (
        <Skeleton className="h-96" />
      ) : data.isError || !r ? (
        <p className="text-health-warning">{t("widget.failed")}</p>
      ) : (
        <div className={cx("grid gap-4 2xl:grid-cols-[minmax(0,560px)_1fr]", data.isPlaceholderData && "opacity-60")}>
          <section aria-labelledby="risk-matrix" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="risk-matrix" className="font-semibold">
              {t("risk.matrixTitle")}
            </h2>
            <p className="mb-3 text-sm text-fg-muted">{t("risk.matrixIntro", { total: r.total })}</p>
            <Matrix r={r} selected={selected} onPick={pick} />
          </section>
          <Items r={r} selected={selected} onClear={() => pick(undefined, undefined)} />
        </div>
      )}
    </div>
  );
}

function Matrix({
  r,
  selected,
  onPick,
}: {
  r: RiskMatrix;
  selected: { l: number; c: number } | null;
  onPick: (l: number, c: number) => void;
}) {
  const { t } = useTranslation();
  const count = (l: number, c: number) => r.cells.find((x) => x.likelihood === l && x.consequence === c)?.count ?? 0;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[460px] border-separate border-spacing-1 text-sm">
        <caption className="sr-only">{t("risk.caption")}</caption>
        <thead>
          <tr>
            <td />
            {[1, 2, 3, 4, 5].map((c) => (
              <th key={c} scope="col" className="px-1 text-xs font-medium text-fg-muted">
                {c}
                <span className="block font-normal">{t(`risk.consequence.${c}`)}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[5, 4, 3, 2, 1].map((l) => (
            <tr key={l}>
              <th scope="row" className="pr-2 text-right text-xs font-medium text-fg-muted">
                {l}
                <span className="block font-normal">{t(`risk.likelihood.${l}`)}</span>
              </th>
              {[1, 2, 3, 4, 5].map((c) => {
                const lvl = riskLevel(l, c);
                const n = count(l, c);
                const on = selected?.l === l && selected.c === c;
                return (
                  <td key={c} className="p-0">
                    <button
                      type="button"
                      aria-pressed={on}
                      onClick={() => onPick(l, c)}
                      className={cx(
                        "flex h-16 w-full flex-col items-center justify-center rounded border text-fg",
                        on ? "border-fg ring-2 ring-[var(--pdm-focus-ring)]" : "border-line",
                      )}
                      style={{ background: tint(lvl) }}
                    >
                      <span className="text-lg font-semibold tabular-nums">{n}</span>{" "}
                      <span className="text-[11px]">{t(`risk.level.${lvl}`)}</span>
                      <span className="sr-only">: {t("risk.cellExtra", { l, c })}</span>
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2 text-xs text-fg-muted">{t("risk.axes")}</p>
    </div>
  );
}

function Items({ r, selected, onClear }: { r: RiskMatrix; selected: { l: number; c: number } | null; onClear: () => void }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="risk-items" className="rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="risk-items" className="font-semibold">
          {selected ? t("risk.cellTitle", { l: selected.l, c: selected.c, count: r.items.length }) : t("risk.topTitle")}
        </h2>
        {selected && (
          <button type="button" className="rounded-md px-2 py-1 text-sm hover:bg-sunken" onClick={onClear}>
            {t("risk.showRiskiest")}
          </button>
        )}
      </div>
      <p className="mb-2 text-sm text-fg-muted">{t("risk.itemsIntro")}</p>
      {r.items.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("risk.empty")}</p>
      ) : (
        <div
          className="max-h-[32rem] overflow-auto"
          role="region"
          aria-label={t("reliability.tableOf", { name: t("risk.itemsCaption") })}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a named, focusable scroll region is the recommended pattern here
          tabIndex={0}
        >
          <table className="w-full min-w-[560px] text-sm">
            <caption className="sr-only">{t("risk.itemsCaption")}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t("reliability.col.asset")}
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {t("risk.col.chance")}
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t("risk.col.basis")}
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {t("risk.col.lc")}
                </th>
                <th scope="col" className="py-1 font-medium">
                  {t("risk.col.level")}
                </th>
              </tr>
            </thead>
            <tbody>
              {r.items.map((i) => (
                <tr key={i.assetId} className="border-b border-line last:border-0">
                  <td className="py-1 pr-3">
                    <Link
                      to="/assets/$assetId/$tab"
                      params={{ assetId: i.assetId, tab: "failures" }}
                      className="font-mono whitespace-nowrap hover:underline"
                    >
                      {i.assetId}
                    </Link>
                    <span className="block text-xs text-fg-muted">{t(`assetClass.${i.assetClass}`)}</span>
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{Math.round(i.probability * 100)} %</td>
                  <td className="py-1 pr-3 text-xs">{t(`risk.basis.${i.basis}`)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {i.likelihood} × {i.consequence}
                  </td>
                  <td className="py-1">{t(`risk.level.${riskLevel(i.likelihood, i.consequence)}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
