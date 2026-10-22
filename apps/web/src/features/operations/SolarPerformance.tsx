/**
 * Asset 360 → Performance for solar equipment: an inverter against what the sunlight should
 * give it, a string against its sister strings, a battery's charge and health.
 */
import { INVERTER_FLAG_PCT, STRING_FLAG_PCT, type BessPerformance, type InverterPerformance, type StringPerformance } from "@pdm/contracts";
import { KpiCard } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber, makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { LineChart } from "../../shared/widgets/LineChart";
import { BessTable } from "./BessTable";
import { formatMw, formatMwh } from "./power-format";

const hourTick = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

function useTimeFormat() {
  const tz = usePreferences((p) => p.timeZone);
  return useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);
}

export function InverterPerformanceView({ data }: { data: InverterPerformance }) {
  const { t } = useTranslation();
  const formatTime = useTimeFormat();
  const { tile } = data;
  const low = tile.performancePct !== null && tile.performancePct < INVERTER_FLAG_PCT;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label={t("solarPerf.performance")}
          value={tile.performancePct === null ? "—" : `${tile.performancePct.toFixed(1)} %`}
          target={t("solarPerf.flagBelow", { pct: INVERTER_FLAG_PCT })}
          change={low ? t("solarPerf.belowExpected") : undefined}
          changeTone={low ? "bad" : "neutral"}
          changeDirection={low ? "down" : "flat"}
        />
        <KpiCard label={t("solarPerf.energy")} value={tile.energyKwh === null ? "—" : formatMwh(tile.energyKwh)} />
        <KpiCard label={t("solarPerf.shortfall")} value={tile.lossKwh === null ? "—" : formatMwh(tile.lossKwh)} />
        <KpiCard label={t("solarPerf.clipped")} value={formatMwh(data.clippedKwh)} />
      </div>
      <section aria-labelledby="inv-power" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="inv-power" className="font-semibold">
          {t("solarPerf.powerTitle")}
        </h2>
        <p className="mb-2 text-sm text-fg-muted">{t("solarPerf.powerIntro")}</p>
        <LineChart
          times={data.power.map((p) => Date.parse(p.t))}
          series={[
            {
              id: "actual",
              label: t("solar.series.actual"),
              values: data.power.map((p) => p.actualKw / 1000),
              color: "var(--pdm-series-1)",
            },
            {
              id: "expected",
              label: t("solar.series.expected"),
              values: data.power.map((p) => p.expectedKw / 1000),
              color: "var(--pdm-series-2)",
              dashed: true,
            },
          ]}
          label={t("solarPerf.powerLabel", { id: tile.assetId })}
          summary={t("solarPerf.powerSummary", { pct: tile.performancePct === null ? "—" : tile.performancePct.toFixed(1) })}
          format={(mw) => formatMw(mw * 1000)}
          formatTime={formatTime}
          formatTick={(ms) => hourTick.format(ms)}
          includeZero
        />
      </section>
      <section aria-labelledby="inv-strings" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="inv-strings" className="font-semibold">
          {t("solarPerf.stringsTitle")}
        </h2>
        <p className="mb-2 text-sm text-fg-muted">{t("solarPerf.stringsIntro")}</p>
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-2 text-sm">
          {data.strings.map((s) => (
            <li key={s.assetId} className="flex justify-between gap-2 rounded border border-line px-2 py-1">
              <Link to="/assets/$assetId/$tab" params={{ assetId: s.assetId, tab: "performance" }} className="font-mono hover:underline">
                {s.assetId}
              </Link>
              <span
                className={
                  s.pctOfSisters !== null && s.pctOfSisters < STRING_FLAG_PCT ? "font-semibold text-health-warning" : "tabular-nums"
                }
              >
                {s.pctOfSisters === null ? "—" : `${s.pctOfSisters.toFixed(1)} %`}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

export function StringPerformanceView({ data }: { data: StringPerformance }) {
  const { t } = useTranslation();
  const formatTime = useTimeFormat();
  const low = data.pctOfSisters !== null && data.pctOfSisters < STRING_FLAG_PCT;
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label={t("solarPerf.ofSisters")}
          value={data.pctOfSisters === null ? "—" : `${data.pctOfSisters.toFixed(1)} %`}
          target={t("solarPerf.flagBelow", { pct: STRING_FLAG_PCT })}
          change={low ? t("solarPerf.stringAdvice") : undefined}
          changeTone={low ? "bad" : "neutral"}
          changeDirection={low ? "down" : "flat"}
        />
        <KpiCard label={t("solar.col.perfIndex")} value={data.perfIndex === null ? "—" : `${data.perfIndex.toFixed(1)} %`} />
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-3">
          <p className="text-xs font-medium text-fg-muted">{t("solarPerf.inverter")}</p>
          <Link
            to="/assets/$assetId/$tab"
            params={{ assetId: data.inverterId, tab: "performance" }}
            className="font-mono text-lg hover:underline"
          >
            {data.inverterId}
          </Link>
        </div>
      </div>
      <section aria-labelledby="str-power" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="str-power" className="font-semibold">
          {t("solarPerf.stringPowerTitle")}
        </h2>
        <p className="mb-2 text-sm text-fg-muted">{t("solarPerf.stringPowerIntro")}</p>
        <LineChart
          times={data.power.map((p) => Date.parse(p.t))}
          series={[
            { id: "string", label: data.assetId, values: data.power.map((p) => p.kw), color: "var(--pdm-series-1)" },
            {
              id: "sisters",
              label: t("solarPerf.sistersMedian"),
              values: data.power.map((p) => p.sistersMedianKw),
              color: "var(--pdm-series-2)",
              dashed: true,
            },
          ]}
          label={t("solarPerf.stringPowerLabel", { id: data.assetId })}
          summary={t("solarPerf.stringPowerSummary", { pct: data.pctOfSisters === null ? "—" : data.pctOfSisters.toFixed(1) })}
          format={(kw) => `${formatNumber(kw, 1)} kW`}
          formatTime={formatTime}
          formatTick={(ms) => hourTick.format(ms)}
          includeZero
        />
      </section>
    </div>
  );
}

export function BessPerformanceView({ data }: { data: BessPerformance }) {
  const { t } = useTranslation();
  const formatTime = useTimeFormat();
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="bess-now" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="bess-now" className="font-semibold">
          {t("solarPerf.bessNow")}
        </h2>
        <p className="mb-2 text-sm text-fg-muted">{t("solar.bessIntro")}</p>
        <BessTable bess={[data.row]} />
      </section>
      <section aria-labelledby="bess-soc" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="bess-soc" className="font-semibold">
          {t("solarPerf.socTitle")}
        </h2>
        <LineChart
          times={data.times.map((x) => Date.parse(x))}
          series={[{ id: "soc", label: t("solar.col.soc"), values: data.row.soc, color: "var(--pdm-series-1)" }]}
          label={t("solarPerf.socLabel", { id: data.row.assetId })}
          summary={t("solar.socSummary")}
          format={(v) => `${formatNumber(v)} %`}
          formatTime={formatTime}
          formatTick={(ms) => hourTick.format(ms)}
          includeZero
          height={180}
        />
      </section>
    </div>
  );
}
