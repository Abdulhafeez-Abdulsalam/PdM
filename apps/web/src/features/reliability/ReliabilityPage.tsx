/**
 * Reliability (spec §6.7): the reliability engineer's home page. How often does equipment
 * fail, how long does it take to fix, which failures cost most, and which assets are the bad
 * actors? Built from five years of ISO 14224-coded failures.
 *
 *   1. Headline KPIs for the period (and class, if one is picked)
 *   2. Failures per month
 *   3. Pareto of failure modes: the few modes that make most of the failures (or downtime)
 *   4. Every class side by side
 *   5. Bad actors: assets failing far more often than their sisters
 */
import { useApiQuery } from "@pdm/api-client";
import { AssetClass, BAD_ACTOR_RATIO, ReliabilityPeriod, type ReliabilitySummary } from "@pdm/contracts";
import { KpiCard, Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatNumber } from "../../shared/format";
import { useGlobalSearch } from "../../shared/time-range";
import { ColumnChart } from "../../shared/widgets/ColumnChart";
import { formatDuration } from "./reliability-format";

const searchSchema = z.object({
  years: z.coerce.number().pipe(ReliabilityPeriod).catch(1).default(1),
  class: AssetClass.optional().catch(undefined),
  by: z.enum(["failures", "downtime"]).catch("failures").default("failures"),
});

const monthTick = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const monthFull = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

export function ReliabilityPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();
  const set = (patch: Record<string, string | number | undefined>) =>
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }), replace: true });

  const data = useApiQuery(
    "reliability.summary",
    { scopeId, years: search.years, assetClass: search.class, paretoBy: search.by },
    { placeholderData: keepPreviousData, refetchInterval: 60_000 },
  );

  useEffect(() => {
    document.title = `${t("modules.reliability.name")} · ${t("app.name")}`;
  }, [t]);

  const r = data.data;
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.reliability.name")}</h1>
        <p className="text-fg-muted">{t("reliability.intro")}</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t("reliability.period")}
          value={String(search.years)}
          options={ReliabilityPeriod.options.map((o) => ({ value: String(o.value), label: t(`reliability.years_${o.value}`) }))}
          onChange={(v) => set({ years: Number(v) })}
        />
        <Select
          label={t("reliability.classLabel")}
          value={search.class ?? ""}
          options={[
            { value: "", label: t("reliability.allEquipment") },
            ...(r?.byClass ?? []).map((c) => ({ value: c.assetClass, label: t(`assetClass.${c.assetClass}`) })),
          ]}
          onChange={(v) => set({ class: v || undefined })}
        />
      </div>

      {data.isPending ? (
        <Skeleton className="h-96" />
      ) : data.isError || !r ? (
        <p className="text-health-warning">{t("widget.failed")}</p>
      ) : (
        <div className={cx("flex flex-col gap-4 transition-opacity", data.isPlaceholderData && "opacity-60")}>
          <Kpis r={r} />
          <div className="grid gap-4 xl:grid-cols-2">
            <section aria-labelledby="rel-monthly" className="rounded-lg border border-line bg-surface p-4">
              <h2 id="rel-monthly" className="font-semibold">
                {t("reliability.monthlyTitle")}
              </h2>
              <p className="mb-2 text-sm text-fg-muted">{t("reliability.monthlyIntro")}</p>
              <ColumnChart
                columns={r.monthly.map((m) => {
                  const d = Date.parse(`${m.month}-01T00:00:00Z`);
                  return { key: m.month, tick: monthTick.format(d), name: monthFull.format(d), value: m.failures };
                })}
                label={t("reliability.monthlyLabel")}
                summary={t("reliability.monthlySummary", {
                  total: r.kpis.failures,
                  peak: Math.max(0, ...r.monthly.map((m) => m.failures)),
                })}
                format={(v) => formatNumber(v)}
                valueName={t("reliability.col.failures")}
              />
            </section>
            <section aria-labelledby="rel-pareto" className="rounded-lg border border-line bg-surface p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id="rel-pareto" className="font-semibold">
                  {t("reliability.paretoTitle")}
                </h2>
                <fieldset className="flex gap-3 text-sm">
                  <legend className="sr-only">{t("reliability.paretoBy")}</legend>
                  {(["failures", "downtime"] as const).map((by) => (
                    <label key={by} className="flex items-center gap-1">
                      <input type="radio" name="pareto-by" checked={search.by === by} onChange={() => set({ by })} />
                      {t(`reliability.by.${by}`)}
                    </label>
                  ))}
                </fieldset>
              </div>
              <p className="mb-2 text-sm text-fg-muted">{t("reliability.paretoIntro")}</p>
              <ColumnChart
                columns={r.pareto.map((p) => ({
                  key: p.mode,
                  tick: p.mode,
                  name: `${p.mode} · ${t(`iso14224.mode.${p.mode}`)}`,
                  value: p.sharePct,
                  line: p.cumulativePct,
                }))}
                label={t("reliability.paretoLabel", { by: t(`reliability.by.${search.by}`).toLowerCase() })}
                summary={paretoSummary(r, t)}
                format={(v) => `${formatNumber(v)} %`}
                valueName={t("reliability.share")}
                lineName={t("reliability.cumulative")}
                max={100}
              />
            </section>
          </div>
          <ClassTable r={r} selected={search.class} onSelect={(c) => set({ class: c })} />
          <BadActors r={r} />
        </div>
      )}
    </div>
  );
}

/** "3 modes make 80 % of failures: BRD, ELP, LOO." */
function paretoSummary(r: ReliabilitySummary, t: (k: string, o?: Record<string, unknown>) => string): string {
  const upTo80 = r.pareto.findIndex((p) => p.cumulativePct >= 80) + 1;
  if (upTo80 <= 0) return t("reliability.noFailures");
  return t("reliability.paretoSummary", {
    count: upTo80,
    total: r.pareto.length,
    modes: r.pareto
      .slice(0, upTo80)
      .map((p) => p.mode)
      .join(", "),
  });
}

function Kpis({ r }: { r: ReliabilitySummary }) {
  const { t } = useTranslation();
  const k = r.kpis;
  return (
    <section aria-label={t("reliability.kpisLabel")} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        label={t("reliability.kpi.failures")}
        value={formatNumber(k.failures)}
        target={t("reliability.kpi.assets", { count: k.assets })}
      />
      <KpiCard label={t("reliability.kpi.mtbf")} value={formatDuration(k.mtbfHours, t)} lineage={t("reliability.kpi.mtbfHow")} />
      <KpiCard label={t("reliability.kpi.mttr")} value={formatDuration(k.mttrHours, t)} lineage={t("reliability.kpi.mttrHow")} />
      <KpiCard
        label={t("reliability.kpi.availability")}
        value={`${k.availabilityPct.toFixed(2)} %`}
        target={t("reliability.kpi.downtime", { hours: formatNumber(k.downtimeHours) })}
      />
      <KpiCard label={t("reliability.kpi.repeats")} value={formatNumber(k.repeatFailures)} lineage={t("reliability.kpi.repeatsHow")} />
    </section>
  );
}

function ClassTable({ r, selected, onSelect }: { r: ReliabilitySummary; selected?: AssetClass; onSelect: (c: AssetClass) => void }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="rel-classes" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="rel-classes" className="font-semibold">
        {t("reliability.classesTitle")}
      </h2>
      <p className="mb-2 text-sm text-fg-muted">{t("reliability.classesIntro")}</p>
      <div
        className="max-h-[28rem] overflow-auto"
        role="region"
        aria-label={t("reliability.tableOf", { name: t("reliability.classesTitle") })}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- a named, focusable scroll region is the recommended pattern here
        tabIndex={0}
      >
        <table className="w-full min-w-[760px] text-sm">
          <caption className="sr-only">{t("reliability.classesTitle")}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="py-1 pr-3 font-medium">
                {t("reliability.col.class")}
              </th>
              {["assets", "failures", "rate", "mtbf", "mttr", "availability", "repeats"].map((c) => (
                <th key={c} scope="col" className="py-1 pr-3 text-right font-medium">
                  {t(`reliability.col.${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {r.byClass.map((c) => (
              <tr key={c.assetClass} className={cx("border-b border-line last:border-0", c.assetClass === selected && "bg-sunken")}>
                <td className="py-1 pr-3">
                  <button
                    type="button"
                    className="text-left hover:underline"
                    aria-pressed={c.assetClass === selected}
                    onClick={() => onSelect(c.assetClass)}
                  >
                    {t(`assetClass.${c.assetClass}`)}
                  </button>
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{c.assets}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{c.failures}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{c.failureRatePerYear.toFixed(2)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{formatDuration(c.mtbfHours, t)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{formatDuration(c.mttrHours, t)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">{c.availabilityPct.toFixed(2)} %</td>
                <td className="py-1 pr-3 text-right tabular-nums">{c.repeatFailures}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function BadActors({ r }: { r: ReliabilitySummary }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="rel-bad" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="rel-bad" className="font-semibold">
        {t("reliability.badTitle")}
      </h2>
      <p className="mb-2 text-sm text-fg-muted">{t("reliability.badIntro", { ratio: BAD_ACTOR_RATIO })}</p>
      {r.badActors.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("reliability.noBad")}</p>
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">{t("reliability.badTitle")}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="px-4 py-1 font-medium">
                  {t("reliability.col.asset")}
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {t("reliability.col.failures")}
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {t("reliability.col.vsClass")}
                </th>
                <th scope="col" className="py-1 pr-3 font-medium">
                  {t("reliability.col.topMode")}
                </th>
                <th scope="col" className="py-1 pr-3 text-right font-medium">
                  {t("reliability.col.repeats")}
                </th>
                <th scope="col" className="py-1 pr-4 text-right font-medium">
                  {t("reliability.col.downtime")}
                </th>
              </tr>
            </thead>
            <tbody>
              {r.badActors.map((a) => (
                <tr key={a.assetId} className="border-b border-line last:border-0">
                  <td className="px-4 py-1">
                    <Link
                      to="/assets/$assetId/$tab"
                      params={{ assetId: a.assetId, tab: "failures" }}
                      className="font-mono whitespace-nowrap hover:underline"
                    >
                      {a.assetId}
                    </Link>
                    <span className="block text-xs text-fg-muted">{t(`assetClass.${a.assetClass}`)}</span>
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{a.failures}</td>
                  <td className="py-1 pr-3 text-right font-semibold tabular-nums">
                    {t("reliability.times", { value: a.ratioToClass.toFixed(1) })}
                  </td>
                  <td className="py-1 pr-3">{t(`iso14224.mode.${a.topMode}`)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">{a.repeatFailures}</td>
                  <td className="py-1 pr-4 text-right tabular-nums">{t("reliability.hours", { value: formatNumber(a.downtimeHours) })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
