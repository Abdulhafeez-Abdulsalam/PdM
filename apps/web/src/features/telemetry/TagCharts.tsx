/**
 * History charts for up to 5 tags, as stacked small multiples sharing one crosshair
 * (never one chart with two y-axes). Every chart has a table view (accessibility).
 */
import { useApiQuery } from "@pdm/api-client";
import { TimeSeriesChart, canvasAvailable, type LimitLine, type SeriesPoint } from "@pdm/charts";
import { MAX_SERIES_PER_CHART, type HistoryPoint, type Tag } from "@pdm/contracts";
import { Button, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { ChartLine, Table } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { roundedWindow, toIso, useSimNow } from "../../shared/sim-time";
import { useGlobalSearch, type TimeRange } from "../../shared/time-range";
import { conversionFor, formatMeasurement } from "../../shared/units";
import { limitList } from "./limits";

interface Props {
  tags: readonly Tag[];
  /** Override the global time range (e.g. evidence charts always show 30 days). */
  range?: TimeRange;
  siteTimeZone?: string;
  height?: number;
}

export function TagCharts({ tags, range: rangeOverride, siteTimeZone, height = 200 }: Props) {
  const { t } = useTranslation();
  const global = useGlobalSearch();
  const range = rangeOverride ?? global.range;
  const { now } = useSimNow();
  const span = roundedWindow(range, now);
  const shown = tags.slice(0, MAX_SERIES_PER_CHART);
  const group = useId();
  const [asTable, setAsTable] = useState(() => !canvasAvailable());

  const history = useApiQuery(
    "timeseries.history",
    { tagIds: shown.map((tg) => tg.id), from: toIso(span.from), to: toIso(span.to) },
    { enabled: shown.length > 0, placeholderData: keepPreviousData },
  );

  if (shown.length === 0) return <p className="text-sm text-fg-muted">{t("telemetry.pickTags")}</p>;
  if (history.isPending) return <div className="flex flex-col gap-3">{shown.map((tg) => <div key={tg.id} style={{ height }}><Skeleton className="h-full w-full" /></div>)}</div>;
  if (history.isError || !history.data) return <p role="alert" className="text-sm text-health-warning">{t("widget.failed")}</p>;

  const data = history.data;
  return (
    <div className={cx("flex flex-col gap-4 transition-opacity", history.isPlaceholderData && "opacity-60")}>
      <div className="flex justify-end">
        <Button size="sm" variant="ghost" onClick={() => setAsTable(!asTable)} aria-pressed={asTable}>
          {asTable ? <ChartLine aria-hidden className="size-4" /> : <Table aria-hidden className="size-4" />}
          {asTable ? t("telemetry.showChart") : t("telemetry.showTable")}
        </Button>
      </div>
      {shown.map((tag) => (
        <TagChart
          key={tag.id}
          tag={tag}
          points={data.series.find((s) => s.tagId === tag.id)?.points ?? []}
          intervalMs={data.intervalSeconds * 1000}
          asTable={asTable}
          group={group}
          height={height}
          siteTimeZone={siteTimeZone}
        />
      ))}
    </div>
  );
}

function TagChart(props: {
  tag: Tag;
  points: readonly HistoryPoint[];
  intervalMs: number;
  asTable: boolean;
  group: string;
  height: number;
  siteTimeZone?: string;
}) {
  const { tag, points, intervalMs, asTable, group, height, siteTimeZone } = props;
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  const theme = usePreferences((p) => p.theme);
  const tzMode = usePreferences((p) => p.timeZone);
  const conv = conversionFor(tag.quantity, units);
  const symbol = t(`unitSymbol.${conv.unit}`);
  const formatTime = useMemo(() => makeTimeFormatter(tzMode, siteTimeZone), [tzMode, siteTimeZone]);

  const series: SeriesPoint[] = useMemo(
    () =>
      points.map((p) => {
        const a = conv.convert(p.min);
        const b = conv.convert(p.max);
        // A unit flip (e.g. none today) could swap min/max; keep the band the right way up.
        return { t: Date.parse(p.t), avg: conv.convert(p.avg), min: Math.min(a, b), max: Math.max(a, b), quality: p.quality };
      }),
    [points, conv],
  );
  const limits: LimitLine[] = useMemo(
    () => limitList(tag.limits).map((l) => ({ level: l.level, value: conv.convert(l.value), label: t(`telemetry.limit.${l.level}`) })),
    [tag.limits, conv, t],
  );
  const labels = useMemo(
    () => ({
      value: t("telemetry.average"),
      range: t("telemetry.minMax"),
      quality: t("telemetry.qualityLabel"),
      qualityNames: { good: t("telemetry.quality.good"), uncertain: t("telemetry.quality.uncertain"), bad: t("telemetry.quality.bad") },
    }),
    [t],
  );

  const values = series.map((p) => p.avg);
  const summary =
    series.length === 0
      ? t("telemetry.noData")
      : t("telemetry.summary", {
          name: tag.description,
          first: formatMeasurement(values[0] ?? 0),
          last: formatMeasurement(values.at(-1) ?? 0),
          min: formatMeasurement(Math.min(...series.map((p) => p.min))),
          max: formatMeasurement(Math.max(...series.map((p) => p.max))),
          unit: symbol,
        });

  return (
    <figure className="m-0">
      <figcaption className="mb-1 flex items-baseline gap-2 text-sm">
        <span className="font-medium">{tag.description}</span>
        <span className="font-mono text-xs text-fg-muted">{tag.name}</span>
        {symbol && <span className="text-xs text-fg-muted">({symbol})</span>}
      </figcaption>
      {series.length === 0 ? (
        <p className="rounded-md border border-dashed border-line p-6 text-center text-sm text-fg-muted">{t("telemetry.noData")}</p>
      ) : asTable ? (
        <DataTable series={series} formatTime={formatTime} symbol={symbol} caption={summary} />
      ) : (
        <TimeSeriesChart
          points={series}
          intervalMs={intervalMs}
          limits={limits}
          group={group}
          height={height}
          themeKey={theme}
          ariaLabel={summary}
          formatValue={formatMeasurement}
          formatTime={formatTime}
          labels={labels}
        />
      )}
    </figure>
  );
}

const MAX_TABLE_ROWS = 200;

function DataTable({ series, formatTime, symbol, caption }: { series: SeriesPoint[]; formatTime: (t: number) => string; symbol: string; caption: string }) {
  const { t } = useTranslation();
  const rows = series.slice(-MAX_TABLE_ROWS).reverse(); // newest first
  return (
    <div className="max-h-72 overflow-auto rounded-md border border-line">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead className="sticky top-0 bg-surface text-left text-xs text-fg-muted">
          <tr>
            <th scope="col" className="px-3 py-1.5 font-medium">{t("telemetry.time")}</th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">{t("telemetry.average")} {symbol && `(${symbol})`}</th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">{t("telemetry.min")}</th>
            <th scope="col" className="px-3 py-1.5 text-right font-medium">{t("telemetry.max")}</th>
            <th scope="col" className="px-3 py-1.5 font-medium">{t("telemetry.qualityLabel")}</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {rows.map((p) => (
            <tr key={p.t} className="border-t border-line">
              <td className="px-3 py-1">{formatTime(p.t)}</td>
              <td className="px-3 py-1 text-right">{formatMeasurement(p.avg)}</td>
              <td className="px-3 py-1 text-right">{formatMeasurement(p.min)}</td>
              <td className="px-3 py-1 text-right">{formatMeasurement(p.max)}</td>
              <td className="px-3 py-1">{t(`telemetry.quality.${p.quality}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
