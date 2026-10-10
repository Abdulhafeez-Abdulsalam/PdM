/**
 * One measurement over time (design system: TimeSeriesChart).
 *
 *   ─── average line (the value)
 *   ░░░ min–max band (short spikes stay visible even when averaged — ADR-0006)
 *   - - alert / alarm / trip limits, in status colours
 *
 * One series per chart, one y-axis, always: several measurements become several stacked
 * charts sharing a crosshair (`group`), never a dual-axis plot.
 * Values must already be converted to display units.
 */
import { LineChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, MarkLineComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef } from "react";
import { readChartColors } from "./tokens";

echarts.use([LineChart, GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, CanvasRenderer]);

export interface SeriesPoint {
  /** ms since 1970 */
  t: number;
  avg: number;
  min: number;
  max: number;
  quality: "good" | "uncertain" | "bad";
}

export interface LimitLine {
  value: number;
  level: "alert" | "alarm" | "trip";
  label: string;
}

export interface TimeSeriesChartProps {
  points: readonly SeriesPoint[];
  /** The aggregation interval, used to break the line where data is missing. */
  intervalMs: number;
  limits?: readonly LimitLine[];
  /** Charts with the same group share a crosshair and zoom. */
  group?: string;
  height?: number;
  /** Re-draw when this changes (pass the theme name). */
  themeKey?: string;
  /** Accessible one-sentence summary of the chart. */
  ariaLabel: string;
  formatValue: (v: number) => string;
  formatTime: (t: number) => string;
  /** Tooltip labels, already translated. */
  labels: { value: string; range: string; quality: string; qualityNames: Record<SeriesPoint["quality"], string> };
}

/** Insert a gap (null) wherever consecutive points are further apart than 1.5 intervals. */
function withGaps<T>(points: readonly SeriesPoint[], intervalMs: number, pick: (p: SeriesPoint) => T): [number, T | null][] {
  const out: [number, T | null][] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    if (prev && p.t - prev.t > intervalMs * 1.5) out.push([prev.t + intervalMs, null]);
    out.push([p.t, pick(p)]);
  });
  return out;
}

export function TimeSeriesChart(props: TimeSeriesChartProps) {
  const { points, intervalMs, limits = [], group, height = 220, themeKey, ariaLabel, formatValue, formatTime, labels } = props;
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(el.current);
    return () => {
      resize.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    if (group) {
      chart.group = group;
      echarts.connect(group);
    }
  }, [group]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const c = readChartColors();
    const limitColor = { alert: c.alert, alarm: c.alarm, trip: c.trip };
    const byTime = new Map(points.map((p) => [p.t, p]));

    chart.setOption(
      {
        animation: false,
        grid: { left: 8, right: 12, top: 12, bottom: 24, containLabel: true },
        xAxis: {
          type: "time",
          axisLine: { lineStyle: { color: c.axis } },
          axisTick: { show: false },
          axisLabel: { color: c.textMuted, hideOverlap: true },
          splitLine: { show: false },
        },
        yAxis: {
          type: "value",
          scale: true, // fit the data; measurements rarely start at zero
          axisLabel: { color: c.textMuted, formatter: (v: number) => formatValue(v) },
          splitLine: { lineStyle: { color: c.grid } },
        },
        dataZoom: [{ type: "inside", zoomOnMouseWheel: "ctrl", moveOnMouseMove: true }],
        tooltip: {
          trigger: "axis",
          backgroundColor: c.surface,
          borderColor: c.border,
          textStyle: { color: c.text, fontSize: 12 },
          axisPointer: { type: "line", lineStyle: { color: c.textMuted } },
          formatter: (params: unknown) => {
            const first = (params as { value: [number, number | null] }[])[0];
            const p = first ? byTime.get(first.value[0]) : undefined;
            if (!p) return "";
            return [
              `<div style="font-weight:600">${formatTime(p.t)}</div>`,
              `${labels.value}: <b>${formatValue(p.avg)}</b>`,
              `${labels.range}: ${formatValue(p.min)} – ${formatValue(p.max)}`,
              p.quality === "good" ? "" : `${labels.quality}: ${labels.qualityNames[p.quality]}`,
            ]
              .filter(Boolean)
              .join("<br/>");
          },
        },
        series: [
          // Invisible base of the band…
          { type: "line", data: withGaps(points, intervalMs, (p) => p.min), stack: "band", symbol: "none", lineStyle: { opacity: 0 }, silent: true, tooltip: { show: false } },
          // …plus (max − min) stacked on top, filled: the min–max band.
          {
            type: "line",
            data: withGaps(points, intervalMs, (p) => p.max - p.min),
            stack: "band",
            symbol: "none",
            lineStyle: { opacity: 0 },
            areaStyle: { color: c.series1, opacity: 0.15 },
            silent: true,
            tooltip: { show: false },
          },
          {
            type: "line",
            data: withGaps(points, intervalMs, (p) => p.avg),
            symbol: "none",
            connectNulls: false,
            lineStyle: { color: c.series1, width: 2 },
            itemStyle: { color: c.series1 },
            markLine: {
              silent: true,
              symbol: "none",
              data: limits.map((l) => ({
                yAxis: l.value,
                lineStyle: { color: limitColor[l.level], type: "dashed", width: 1 },
                label: { formatter: l.label, position: "insideEndTop", color: limitColor[l.level], fontSize: 10 },
              })),
            },
          },
        ],
      },
      { notMerge: true },
    );
  }, [points, intervalMs, limits, themeKey, formatValue, formatTime, labels]);

  return <div ref={el} role="img" aria-label={ariaLabel} style={{ height, width: "100%" }} />;
}
