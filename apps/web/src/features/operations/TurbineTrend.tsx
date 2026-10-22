/**
 * A gas turbine's efficiency over the last 14 days, as two charts that share the time axis:
 * heat rate (% above its baseline) and compressor efficiency (points below its baseline). Two
 * charts, not one with two y-axes: the measures have different units.
 *
 * "Baseline" = what a clean machine would show at that hour's air temperature and load, so a
 * hot afternoon doesn't look like fouling. Fouling shows as a slow climb; a water wash as a
 * drop back to zero.
 */
import { useApiQuery } from "@pdm/api-client";
import { WASH_COMP_EFF_PTS, WASH_HEAT_RATE_PCT, type TurbineTrend as Trend } from "@pdm/contracts";
import { Skeleton } from "@pdm/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { LineChart } from "../../shared/widgets/LineChart";
import { signed } from "./power-format";

const DAYS = 14;
/** Both charts get the same left margin, so the same moment sits at the same x. */
const AXIS_WIDTH = 72;
const dayTick = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function TurbineTrend({ assetId }: { assetId: string }) {
  const { t } = useTranslation();
  const tz = usePreferences((p) => p.timeZone);
  const formatTime = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);
  const trend = useApiQuery("operations.turbineTrend", { assetId, days: DAYS }, { refetchInterval: 60_000 });

  if (trend.isPending) return <Skeleton className="h-96" />;
  if (!trend.data) return <p className="text-sm text-health-warning">{t("widget.failed")}</p>;

  const { points, events } = trend.data;
  const times = points.map((p) => Date.parse(p.t));
  const markers = events.map((e) => ({ t: Date.parse(e.t), label: t(`power.event.${e.kind}`) }));
  const hr = points.map((p) => p.heatRateDeviationPct);
  const ce = points.map((p) => p.compressorEffDeviationPts);

  return (
    <div className="flex flex-col gap-4">
      <figure className="m-0">
        <figcaption className="mb-1 text-sm font-medium">{t("power.trend.heatRateTitle")}</figcaption>
        <LineChart
          times={times}
          series={[{ id: "hr", label: t("power.trend.heatRateSeries"), values: hr, color: "var(--pdm-series-1)" }]}
          label={t("power.trend.heatRateLabel", { id: assetId, days: DAYS })}
          summary={summarize(trend.data, "hr", t)}
          format={(v) => `${signed(v)} %`}
          formatTime={formatTime}
          formatTick={(ms) => dayTick.format(ms)}
          thresholds={[{ value: WASH_HEAT_RATE_PCT, label: t("power.trend.washTrigger") }]}
          markers={markers}
          includeZero
          minLeft={AXIS_WIDTH}
          height={180}
        />
      </figure>
      <figure className="m-0">
        <figcaption className="mb-1 text-sm font-medium">{t("power.trend.compEffTitle")}</figcaption>
        <LineChart
          times={times}
          series={[{ id: "ce", label: t("power.trend.compEffSeries"), values: ce, color: "var(--pdm-series-1)" }]}
          label={t("power.trend.compEffLabel", { id: assetId, days: DAYS })}
          summary={summarize(trend.data, "ce", t)}
          format={(v) => t("power.pts", { value: signed(v, 2) })}
          formatTime={formatTime}
          formatTick={(ms) => dayTick.format(ms)}
          thresholds={[{ value: WASH_COMP_EFF_PTS, label: t("power.trend.washTrigger") }]}
          markers={markers}
          includeZero
          minLeft={AXIS_WIDTH}
          height={180}
        />
      </figure>
    </div>
  );
}

/** "Now +1.4 %, highest +2.0 % on 12 Oct. 1 water wash." */
function summarize(trend: Trend, which: "hr" | "ce", t: (k: string, o?: Record<string, unknown>) => string): string {
  const values = trend.points.flatMap((p) => {
    const v = which === "hr" ? p.heatRateDeviationPct : p.compressorEffDeviationPts;
    return v === null ? [] : [{ t: p.t, v }];
  });
  if (values.length === 0) return t("power.trend.noData");
  const latest = values.at(-1)!;
  // "Worst" is the highest heat rate, or the lowest compressor efficiency.
  const worst = values.reduce((w, x) => ((which === "hr" ? x.v > w.v : x.v < w.v) ? x : w));
  const fmt = (v: number) => (which === "hr" ? `${signed(v)} %` : t("power.pts", { value: signed(v, 2) }));
  return t("power.trend.summary", {
    latest: fmt(latest.v),
    worst: fmt(worst.v),
    when: dayTick.format(Date.parse(worst.t)),
    washes: trend.events.filter((e) => e.kind === "water_wash").length,
  });
}
