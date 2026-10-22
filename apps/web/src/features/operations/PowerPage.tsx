/**
 * Gas-to-power operations (spec §6.3). The plant manager's questions, top to bottom:
 *
 *   1. Is each plant producing what the grid asked for, and how well does it use its fuel?
 *   2. For one plant: output against dispatch over two days.
 *   3. Its gas turbines: efficiency against a clean machine on the same day, and when each
 *      is due to be opened up for inspection.
 *   4. One turbine's efficiency trend (fouling creeping in, water washes bringing it back).
 *   5. Its transformers' oil analysis, on the Duval triangle.
 */
import { useApiQuery } from "@pdm/api-client";
import { PLANT_KPI_DAYS, type GasTurbineRow, type PowerOperations, type PowerPlant } from "@pdm/contracts";
import { Button, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { AlertTriangle, Droplets, FlaskConical } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { useGlobalSearch } from "../../shared/time-range";
import { LineChart } from "../../shared/widgets/LineChart";
import { DgaSection } from "./DgaSection";
import { InspectionCell } from "./InspectionCell";
import { efficiencyPct, formatIn, formatMw, signed } from "./power-format";
import { TurbineTrend } from "./TurbineTrend";

const searchSchema = z.object({
  site: z.string().optional().catch(undefined),
  /** The turbine whose trend is shown. */
  gt: z.string().optional().catch(undefined),
});

export function PowerPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();
  const set = (patch: Record<string, string | undefined>) =>
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }), replace: true });

  const data = useApiQuery(
    "operations.power",
    { scopeId, siteId: search.site },
    { placeholderData: keepPreviousData, refetchInterval: 60_000, retry: false },
  );

  useEffect(() => {
    document.title = `${t("power.title")} · ${t("app.name")}`;
  }, [t]);

  const r = data.data;
  const plant = r?.plants.find((p) => p.siteId === r.siteId);
  // Show the trend of the turbine asked for, else the one most in need of a wash, else the first.
  const turbine =
    r?.turbines.find((x) => x.assetId === search.gt) ??
    [...(r?.turbines ?? [])].sort((a, b) => (b.heatRateDeviationPct ?? -99) - (a.heatRateDeviationPct ?? -99))[0];

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("power.title")}</h1>
        <p className="text-fg-muted">{t("power.intro")}</p>
      </header>

      {data.isPending ? (
        <Skeleton className="h-96" />
      ) : data.isError || !r ? (
        <p className="text-health-warning">
          {data.error?.message.includes("No gas-to-power") ? t("power.notInScope") : t("widget.failed")}
        </p>
      ) : r.plants.length === 0 ? (
        <p className="text-fg-muted">{t("power.noPlants")}</p>
      ) : (
        <div className={cx("flex flex-col gap-4 transition-opacity", data.isPlaceholderData && "opacity-60")}>
          <section aria-label={t("power.plantsTitle")}>
            <h2 className="sr-only">{t("power.plantsTitle")}</h2>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {r.plants.map((p) => (
                <li key={p.siteId}>
                  <PlantCard plant={p} selected={p.siteId === r.siteId} />
                </li>
              ))}
            </ul>
          </section>

          {plant && (
            <>
              <section aria-labelledby="output-title" className="rounded-lg border border-line bg-surface p-4">
                <h2 id="output-title" className="font-semibold">
                  {t("power.outputTitle", { name: plant.siteName })}
                </h2>
                <p className="mb-2 text-sm text-fg-muted">{t("power.outputIntro")}</p>
                <OutputChart output={r.output} />
              </section>

              <section aria-labelledby="gt-title" className="rounded-lg border border-line bg-surface p-4">
                <h2 id="gt-title" className="font-semibold">
                  {t("power.turbinesTitle")}
                </h2>
                <p className="mb-2 text-sm text-fg-muted">{t("power.turbinesIntro")}</p>
                <TurbineTable rows={r.turbines} selected={turbine?.assetId} onSelect={(id) => set({ gt: id })} />
              </section>

              {turbine && (
                <section aria-labelledby="trend-title" className="rounded-lg border border-line bg-surface p-4">
                  <h2 id="trend-title" className="font-semibold">
                    {t("power.trendTitle", { id: turbine.assetId })}
                  </h2>
                  <p className="mb-3 text-sm text-fg-muted">{t("power.trendIntro")}</p>
                  <TurbineTrend assetId={turbine.assetId} />
                </section>
              )}

              <DgaSection transformers={r.transformers} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PlantCard({ plant: p, selected }: { plant: PowerPlant; selected: boolean }) {
  const { t } = useTranslation();
  const units = usePreferences((s) => s.units);
  const shortfall = p.dispatchKw - p.outputKw;
  return (
    <Link
      to="."
      search={(prev: Record<string, unknown>) => ({ ...prev, site: p.siteId, gt: undefined })}
      replace
      aria-current={selected ? "true" : undefined}
      className={cx(
        "flex h-full flex-col gap-2 rounded-lg border bg-surface p-3 hover:bg-sunken",
        selected ? "border-accent ring-1 ring-accent" : "border-line",
      )}
    >
      <span>
        <span className="block font-semibold">{p.siteName}</span>
        <span className="block text-xs text-fg-muted">
          {t(`power.kind.${p.kind}`)} · {t("power.unitsRunning", { running: p.unitsRunning, total: p.unitsTotal })}
        </span>
      </span>
      <span className="text-2xl leading-none font-semibold">
        {formatMw(p.outputKw)}
        <span className="ml-1 text-sm font-normal text-fg-muted">{t("power.ofDispatch", { dispatch: formatMw(p.dispatchKw) })}</span>
      </span>
      {shortfall > p.dispatchKw * 0.02 && (
        <span className="flex items-center gap-1 text-xs text-health-warning">
          <AlertTriangle aria-hidden className="size-3.5" />
          {t("power.shortfall", { mw: formatMw(shortfall) })}
        </span>
      )}
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-fg-muted">{t("power.capacity")}</dt>
        <dd className="text-right tabular-nums">{formatMw(p.capacityKw)}</dd>
        <dt className="text-fg-muted">{t("power.availability", { days: PLANT_KPI_DAYS })}</dt>
        <dd className="text-right tabular-nums">{p.availabilityPct.toFixed(1)} %</dd>
        <dt className="text-fg-muted">{t("power.capacityFactor", { days: PLANT_KPI_DAYS })}</dt>
        <dd className="text-right tabular-nums">{p.capacityFactorPct.toFixed(1)} %</dd>
        <dt className="text-fg-muted">{t("power.plantHeatRate")}</dt>
        <dd className="text-right tabular-nums">
          {p.heatRate === null ? "—" : formatIn(p.heatRate, "heat_rate", units, t)}
          {p.heatRate !== null && (
            <span className="block text-fg-muted">{t("power.efficiency", { pct: efficiencyPct(p.heatRate).toFixed(1) })}</span>
          )}
        </dd>
      </dl>
      {(p.washesRecommended > 0 || p.transformersOfConcern > 0) && (
        <span className="mt-auto flex flex-col gap-0.5 text-xs">
          {p.washesRecommended > 0 && (
            <span className="flex items-center gap-1">
              <Droplets aria-hidden className="size-3.5 text-health-warning" />
              {t("power.washesRecommended", { count: p.washesRecommended })}
            </span>
          )}
          {p.transformersOfConcern > 0 && (
            <span className="flex items-center gap-1">
              <FlaskConical aria-hidden className="size-3.5 text-health-warning" />
              {t("power.transformersOfConcern", { count: p.transformersOfConcern })}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}

const hourTick = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function OutputChart({ output }: { output: PowerOperations["output"] }) {
  const { t } = useTranslation();
  const tz = usePreferences((p) => p.timeZone);
  const formatTime = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);
  if (output.length === 0) return null;
  const times = output.map((p) => Date.parse(p.t));
  const latest = output.at(-1)!;
  const worst = output.reduce((w, p) => (p.dispatchKw - p.outputKw > w.dispatchKw - w.outputKw ? p : w));
  const gap = worst.dispatchKw - worst.outputKw;
  const summary = t("power.outputSummary", {
    output: formatMw(latest.outputKw),
    dispatch: formatMw(latest.dispatchKw),
    gap: gap > 0 ? formatMw(gap) : formatMw(0),
    when: formatTime(Date.parse(worst.t)),
  });
  return (
    <LineChart
      times={times}
      series={[
        { id: "output", label: t("power.series.output"), values: output.map((p) => p.outputKw / 1000), color: "var(--pdm-series-1)" },
        {
          id: "dispatch",
          label: t("power.series.dispatch"),
          values: output.map((p) => p.dispatchKw / 1000),
          color: "var(--pdm-series-2)",
          dashed: true,
        },
      ]}
      label={t("power.outputLabel")}
      summary={summary}
      format={(mw) => formatMw(mw * 1000)}
      formatTime={formatTime}
      formatTick={(ms) => hourTick.format(ms)}
    />
  );
}

function TurbineTable({ rows, selected, onSelect }: { rows: readonly GasTurbineRow[]; selected?: string; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  if (rows.length === 0) return <p className="text-sm text-fg-muted">{t("power.noTurbines")}</p>;
  return (
    <div className="-mx-4 overflow-x-auto">
      <table className="w-full min-w-[900px] text-sm">
        <caption className="sr-only">{t("power.turbinesTitle")}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-muted">
            <th scope="col" className="px-4 py-2 font-medium">
              {t("power.col.unit")}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              {t("power.col.output")}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              {t("power.col.heatRate")}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              {t("power.col.heatRateDev")}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              {t("power.col.compEffDev")}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              {t("power.col.spread")}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {t("power.col.inspection")}
            </th>
            <th scope="col" className="px-4 py-2 font-medium">
              <span className="sr-only">{t("power.col.trend")}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.assetId} className={cx("border-b border-line last:border-0", row.assetId === selected && "bg-sunken")}>
              <td className="px-4 py-2">
                <Link
                  to="/assets/$assetId/$tab"
                  params={{ assetId: row.assetId, tab: "performance" }}
                  className="font-mono whitespace-nowrap hover:underline"
                >
                  {row.assetId}
                </Link>
                <span className="block text-xs text-fg-muted">{t(`operatingStatus.${row.operatingStatus}`)}</span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {row.outputKw === null ? "—" : formatMw(row.outputKw)}
                <span className="block text-xs text-fg-muted">{t("power.ofCapacity", { capacity: formatMw(row.capacityKw) })}</span>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {row.heatRate === null ? "—" : formatIn(row.heatRate, "heat_rate", units, t)}
                {row.heatRateExpected !== null && (
                  <span className="block text-xs text-fg-muted">
                    {t("power.baseline", { value: formatIn(row.heatRateExpected, "heat_rate", units, t) })}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {row.heatRateDeviationPct === null ? "—" : `${signed(row.heatRateDeviationPct)} %`}
                {row.washRecommended && (
                  <span className="flex items-center justify-end gap-1 text-xs text-health-warning">
                    <Droplets aria-hidden className="size-3.5" />
                    {t("power.washRecommended")}
                  </span>
                )}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {row.compressorEffDeviationPts === null ? "—" : t("power.pts", { value: signed(row.compressorEffDeviationPts, 2) })}
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">
                {row.exhaustSpread === null ? "—" : formatIn(row.exhaustSpread, "temperature_difference", units, t, 1)}
              </td>
              <td className="py-2 pr-3">
                <InspectionCell eoh={row.eoh} />
              </td>
              <td className="px-4 py-2">
                <Button size="sm" variant="ghost" aria-pressed={row.assetId === selected} onClick={() => onSelect(row.assetId)}>
                  {t("power.showTrend")}
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
