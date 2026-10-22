/**
 * Solar operations (spec §6.3). The plant manager's question: how much energy are we losing,
 * and where? Top to bottom:
 *
 *   1. Every plant: power now against what the sunlight should give, performance ratio, dust.
 *   2. For one plant: power against expected over two days.
 *   3. Where the week's energy went, sunlight to grid (the loss waterfall).
 *   4. Which inverters fell short (heat map) and which strings lag their sisters.
 *   5. When to wash the panels, and how the batteries are doing.
 */
import { useApiQuery } from "@pdm/api-client";
import { SOLAR_KPI_DAYS, STRING_FLAG_PCT, type BessRow, type SoilingAdvice, type SolarOperations, type SolarPlant } from "@pdm/contracts";
import { Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { AlertTriangle, Sparkles } from "lucide-react";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatCurrency, formatDate, formatNumber, makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { useGlobalSearch } from "../../shared/time-range";
import { LineChart } from "../../shared/widgets/LineChart";
import { BessTable } from "./BessTable";
import { InverterHeatMap } from "./InverterHeatMap";
import { LossWaterfall } from "./LossWaterfall";
import { OperationsNav } from "./OperationsNav";
import { formatMw, formatMwh } from "./power-format";

const searchSchema = z.object({ site: z.string().optional().catch(undefined) });
const hourTick = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

export function SolarPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const data = useApiQuery(
    "operations.solar",
    { scopeId, siteId: search.site },
    { placeholderData: keepPreviousData, refetchInterval: 60_000, retry: false },
  );

  useEffect(() => {
    document.title = `${t("solar.title")} · ${t("app.name")}`;
  }, [t]);

  const r = data.data;
  const plant = r?.plants.find((p) => p.siteId === r.siteId);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("solar.title")}</h1>
        <p className="text-fg-muted">{t("solar.intro")}</p>
      </header>
      <OperationsNav />

      {data.isPending ? (
        <Skeleton className="h-96" />
      ) : data.isError || !r ? (
        <p className="text-health-warning">{data.error?.message.includes("No solar plant") ? t("solar.notInScope") : t("widget.failed")}</p>
      ) : r.plants.length === 0 ? (
        <p className="text-fg-muted">{t("solar.noPlants")}</p>
      ) : (
        <div className={cx("flex flex-col gap-4 transition-opacity", data.isPlaceholderData && "opacity-60")}>
          <section aria-label={t("solar.plantsTitle")}>
            <h2 className="sr-only">{t("solar.plantsTitle")}</h2>
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
              <section aria-labelledby="solar-power" className="rounded-lg border border-line bg-surface p-4">
                <h2 id="solar-power" className="font-semibold">
                  {t("solar.powerTitle", { name: plant.siteName })}
                </h2>
                <p className="mb-2 text-sm text-fg-muted">{t("solar.powerIntro")}</p>
                <PowerChart power={r.power} />
              </section>

              {r.waterfall && (
                <section aria-labelledby="solar-losses" className="rounded-lg border border-line bg-surface p-4">
                  <h2 id="solar-losses" className="font-semibold">
                    {t("solar.lossesTitle", { days: SOLAR_KPI_DAYS })}
                  </h2>
                  <p className="mb-2 text-sm text-fg-muted">{t("solar.lossesIntro")}</p>
                  <LossWaterfall
                    waterfall={r.waterfall}
                    label={t("solar.waterfall.label", { name: plant.siteName, days: SOLAR_KPI_DAYS })}
                  />
                </section>
              )}

              <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
                <section aria-labelledby="solar-inverters" className="rounded-lg border border-line bg-surface p-4">
                  <h2 id="solar-inverters" className="font-semibold">
                    {t("solar.invertersTitle")}
                  </h2>
                  <p className="mb-3 text-sm text-fg-muted">{t("solar.invertersIntro")}</p>
                  <InverterHeatMap tiles={r.inverters} />
                </section>
                <StringsSection strings={r.strings} />
              </div>

              <div className="grid gap-4 xl:grid-cols-2">
                {r.soiling && <CleaningCard advice={r.soiling} />}
                <BatteriesSection bess={r.bess} times={r.power.map((p) => Date.parse(p.t))} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PlantCard({ plant: p, selected }: { plant: SolarPlant; selected: boolean }) {
  const { t } = useTranslation();
  const flags = p.invertersFlagged + p.stringsFlagged;
  return (
    <Link
      to="."
      search={(prev: Record<string, unknown>) => ({ ...prev, site: p.siteId })}
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
          {t("solar.capacityLine", { dc: formatMw(p.dcCapacityKw).replace("MW", "MWp"), ac: formatMw(p.acCapacityKw) })}
        </span>
      </span>
      <span className="text-2xl leading-none font-semibold">
        {formatMw(p.outputKw)}
        <span className="ml-1 text-sm font-normal text-fg-muted">{t("solar.ofExpected", { expected: formatMw(p.expectedKw) })}</span>
      </span>
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-fg-muted">{t("solar.irradiance")}</dt>
        <dd className="text-right tabular-nums">{p.irradiance} W/m²</dd>
        <dt className="text-fg-muted">{t("solar.pr", { days: SOLAR_KPI_DAYS })}</dt>
        <dd className="text-right tabular-nums">{p.performanceRatioPct === null ? "—" : `${p.performanceRatioPct.toFixed(1)} %`}</dd>
        <dt className="text-fg-muted">{t("solar.energy", { days: SOLAR_KPI_DAYS })}</dt>
        <dd className="text-right tabular-nums">{formatMwh(p.energyKwh)}</dd>
        <dt className="text-fg-muted">{t("solar.soiling")}</dt>
        <dd className="text-right tabular-nums">{p.soilingPct.toFixed(1)} %</dd>
      </dl>
      {flags > 0 && (
        <span className="mt-auto flex flex-col gap-0.5 text-xs">
          {p.invertersFlagged > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle aria-hidden className="size-3.5 text-health-warning" />
              {t("solar.invertersFlagged", { count: p.invertersFlagged })}
            </span>
          )}
          {p.stringsFlagged > 0 && (
            <span className="flex items-center gap-1">
              <AlertTriangle aria-hidden className="size-3.5 text-health-warning" />
              {t("solar.stringsFlagged", { count: p.stringsFlagged })}
            </span>
          )}
        </span>
      )}
    </Link>
  );
}

function PowerChart({ power }: { power: SolarOperations["power"] }) {
  const { t } = useTranslation();
  const tz = usePreferences((p) => p.timeZone);
  const formatTime = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);
  if (power.length === 0) return null;
  const made = power.reduce((s, p) => s + p.actualKw, 0);
  const expected = power.reduce((s, p) => s + p.expectedKw, 0);
  const peak = power.reduce((b, p) => (p.actualKw > b.actualKw ? p : b));
  const summary = t("solar.powerSummary", {
    pct: expected > 0 ? ((100 * made) / expected).toFixed(1) : "—",
    peak: formatMw(peak.actualKw),
    when: formatTime(Date.parse(peak.t)),
  });
  return (
    <LineChart
      times={power.map((p) => Date.parse(p.t))}
      series={[
        { id: "actual", label: t("solar.series.actual"), values: power.map((p) => p.actualKw / 1000), color: "var(--pdm-series-1)" },
        {
          id: "expected",
          label: t("solar.series.expected"),
          values: power.map((p) => p.expectedKw / 1000),
          color: "var(--pdm-series-2)",
          dashed: true,
        },
      ]}
      label={t("solar.powerLabel")}
      summary={summary}
      format={(mw) => formatMw(mw * 1000)}
      formatTime={formatTime}
      formatTick={(ms) => hourTick.format(ms)}
      includeZero
    />
  );
}

function StringsSection({ strings }: { strings: SolarOperations["strings"] }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="solar-strings" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="solar-strings" className="font-semibold">
        {t("solar.stringsTitle")}
      </h2>
      <p className="mb-3 text-sm text-fg-muted">{t("solar.stringsIntro", { pct: STRING_FLAG_PCT })}</p>
      {strings.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("solar.noStrings")}</p>
      ) : (
        <table className="w-full text-sm">
          <caption className="sr-only">{t("solar.stringsTitle")}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="py-1 font-medium">
                {t("solar.col.string")}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {t("solar.col.ofSisters")}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {t("solar.col.perfIndex")}
              </th>
            </tr>
          </thead>
          <tbody>
            {strings.map((s) => (
              <tr key={s.assetId} className="border-b border-line last:border-0">
                <td className="py-1">
                  <Link
                    to="/assets/$assetId/$tab"
                    params={{ assetId: s.assetId, tab: "performance" }}
                    className="font-mono whitespace-nowrap hover:underline"
                  >
                    {s.assetId}
                  </Link>
                  <span className="block text-xs text-fg-muted">{t("solar.onInverter", { id: s.inverterId })}</span>
                </td>
                <td className="py-1 text-right tabular-nums">{s.pctOfSisters.toFixed(1)} %</td>
                <td className="py-1 text-right tabular-nums">{s.perfIndex === null ? "—" : `${s.perfIndex.toFixed(1)} %`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function CleaningCard({ advice: a }: { advice: SoilingAdvice }) {
  const { t } = useTranslation();
  const money = (v: number) => formatCurrency(v, a.currency);
  return (
    <section aria-labelledby="solar-cleaning" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="solar-cleaning" className="font-semibold">
        {t("solar.cleaningTitle")}
      </h2>
      <p className="mb-3 text-sm text-fg-muted">{t("solar.cleaningIntro")}</p>
      <p className={cx("mb-3 flex items-center gap-2 font-semibold", a.recommendation !== "wait" && "text-health-warning")}>
        <Sparkles aria-hidden className="size-4" />
        {t(`solar.advice.${a.recommendation}`, { days: a.cleanInDays })}
      </p>
      <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
        <dt className="text-fg-muted">{t("solar.cleaning.now")}</dt>
        <dd className="text-right tabular-nums">{t("solar.cleaning.nowValue", { pct: a.soilingPct.toFixed(1), rate: a.ratePctPerDay })}</dd>
        <dt className="text-fg-muted">{t("solar.cleaning.last")}</dt>
        <dd className="text-right">{formatDate(a.lastCleanedAt)}</dd>
        <dt className="text-fg-muted">{t("solar.cleaning.lossPerDay")}</dt>
        <dd className="text-right tabular-nums">
          {formatMwh(a.lossKwhPerDay)} · {money(a.lossValuePerDay)}
        </dd>
        <dt className="text-fg-muted">{t("solar.cleaning.lostSince")}</dt>
        <dd className="text-right tabular-nums">{money(a.lossValueSinceCleaning)}</dd>
        <dt className="text-fg-muted">{t("solar.cleaning.cost")}</dt>
        <dd className="text-right tabular-nums">{money(a.cleaningCost)}</dd>
        <dt className="text-fg-muted">{t("solar.cleaning.best")}</dt>
        <dd className="text-right tabular-nums">{t("solar.cleaning.days", { count: a.optimalIntervalDays })}</dd>
      </dl>
      <p className="mt-3 text-xs text-fg-muted">{t("solar.cleaning.how", { price: a.pricePerMwh })}</p>
    </section>
  );
}

function BatteriesSection({ bess, times }: { bess: readonly BessRow[]; times: readonly number[] }) {
  const { t } = useTranslation();
  const tz = usePreferences((p) => p.timeZone);
  const formatTime = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);
  const colors = ["var(--pdm-series-1)", "var(--pdm-series-2)"];
  return (
    <section aria-labelledby="solar-bess" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="solar-bess" className="font-semibold">
        {t("solar.bessTitle")}
      </h2>
      <p className="mb-3 text-sm text-fg-muted">{t("solar.bessIntro")}</p>
      {bess.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("solar.noBess")}</p>
      ) : (
        <>
          <BessTable bess={bess} />
          {bess.length <= colors.length && (
            <div className="mt-3">
              <LineChart
                times={times}
                series={bess.map((b, i) => ({ id: b.assetId, label: b.assetId, values: b.soc, color: colors[i]! }))}
                label={t("solar.socLabel")}
                summary={t("solar.socSummary")}
                format={(v) => `${formatNumber(v)} %`}
                formatTime={formatTime}
                formatTick={(ms) => hourTick.format(ms)}
                includeZero
                height={160}
              />
            </div>
          )}
        </>
      )}
    </section>
  );
}
