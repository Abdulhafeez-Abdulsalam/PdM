/**
 * Events in lanes on a time axis (spec §6.5, "a single synchronized canvas").
 *
 *   Alarms        ●     ●●            ●
 *   Maintenance         ■
 *   Predictions   ◆
 *                 ├──────┼──────┼──────┤  time, shared with the sensor charts above
 *                 [=======slider=======]   drag the ends to zoom, the middle to pan
 *
 * Give it the same `group` and `xRange` as the TimeSeriesCharts it sits under, and the same
 * `gridLeft`: then the time axes line up pixel for pixel, and zooming or panning any of them
 * moves all of them (echarts.connect).
 *
 * Keyboard (the canvas is one focusable element): ← → select the previous / next event,
 * + − zoom around the middle, Shift+← → pan, 0 shows the whole range. What's selected is shown
 * by the page (`onSelect`), which also offers every event as a list.
 */
import { ScatterChart } from "echarts/charts";
import { DataZoomComponent, GridComponent, TooltipComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { readChartColors, readToneColors, type Tone } from "./tokens";
import { connectGroup, useKeepZoom, type TimeWindow } from "./zoom";

echarts.use([ScatterChart, GridComponent, TooltipComponent, DataZoomComponent, CanvasRenderer]);

export interface Lane {
  id: string;
  label: string;
}

export interface LaneEvent {
  id: string;
  lane: string;
  /** ms since 1970 */
  t: number;
  tone: Tone;
  /** Shown in the tooltip, already translated. */
  label: string;
}

export interface EventLanesChartProps {
  lanes: readonly Lane[];
  events: readonly LaneEvent[];
  /** The whole time range on show (ms). Must match the charts in the same group. */
  xRange: TimeWindow;
  group?: string;
  /** Width kept for the lane names; give the charts in the same group the same value. */
  gridLeft?: number;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Called with the part of the range in view, after every zoom or pan (here or in the group). */
  onWindowChange?: (window: TimeWindow) => void;
  themeKey?: string;
  /** Accessible one-sentence summary. */
  ariaLabel: string;
  /** Id of the element that explains the keys. */
  describedBy?: string;
  formatTime: (t: number) => string;
}

const LANE_HEIGHT = 30;
const SYMBOL = ["circle", "rect", "diamond", "triangle", "pin"] as const;

export function EventLanesChart(props: EventLanesChartProps) {
  const { lanes, events, xRange, group, gridLeft = 112, selectedId, onSelect, onWindowChange, themeKey } = props;
  const { ariaLabel, describedBy, formatTime } = props;
  const el = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);
  const zoom = useKeepZoom(xRange, group, onWindowChange);
  // Event handlers read the latest props without being re-bound.
  const latest = useRef({ events, selectedId, onSelect });
  useEffect(() => {
    latest.current = { events, selectedId, onSelect };
  });

  useEffect(() => {
    if (!el.current) return;
    const chart = echarts.init(el.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;
    const unbind = zoom.bind(chart);
    chart.on("click", (p) => {
      const id = (p.data as { id?: string } | undefined)?.id;
      if (id) latest.current.onSelect?.(id);
    });
    const resize = new ResizeObserver(() => chart.resize());
    resize.observe(el.current);
    return () => {
      unbind();
      resize.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, [zoom]);

  useEffect(() => connectGroup(chartRef.current, group), [group]);

  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const c = readChartColors();
    const tones = readToneColors();
    const laneIndex = new Map(lanes.map((l, i) => [l.id, i]));
    const point = (e: LaneEvent, selected: boolean) => ({
      id: e.id,
      value: [e.t, laneIndex.get(e.lane) ?? 0],
      label: e.label,
      symbol: SYMBOL[(laneIndex.get(e.lane) ?? 0) % SYMBOL.length],
      symbolSize: selected ? 16 : 10,
      itemStyle: { color: tones[e.tone], borderColor: selected ? c.text : c.surface, borderWidth: selected ? 2 : 1 },
    });
    const shown = events.filter((e) => laneIndex.has(e.lane));
    const selected = shown.find((e) => e.id === selectedId);

    chart.setOption(
      {
        animation: false,
        grid: { left: gridLeft, right: 12, top: 8, bottom: 56, containLabel: false },
        xAxis: {
          type: "time",
          min: xRange.from,
          max: xRange.to,
          axisLine: { lineStyle: { color: c.axis } },
          axisTick: { show: false },
          axisLabel: { color: c.textMuted, hideOverlap: true },
          splitLine: { show: false },
        },
        yAxis: {
          type: "category",
          data: lanes.map((l) => l.label),
          inverse: true, // first lane at the top
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: { color: c.textMuted, fontSize: 11, width: gridLeft - 12, overflow: "truncate" },
          splitLine: { show: true, lineStyle: { color: c.grid } },
        },
        dataZoom: [
          { type: "inside", zoomOnMouseWheel: "ctrl", moveOnMouseMove: true, ...zoom.percent() },
          {
            type: "slider",
            height: 18,
            bottom: 6,
            showDetail: false,
            borderColor: c.border,
            fillerColor: "rgba(127,127,127,0.18)",
            dataBackground: { lineStyle: { opacity: 0 }, areaStyle: { opacity: 0 } },
            ...zoom.percent(),
          },
        ],
        tooltip: {
          trigger: "item",
          backgroundColor: c.surface,
          borderColor: c.border,
          textStyle: { color: c.text, fontSize: 12 },
          formatter: (p: unknown) => {
            const d = (p as { data: { value: [number, number]; label: string } }).data;
            return `<div style="font-weight:600">${formatTime(d.value[0])}</div>${escapeHtml(d.label)}`;
          },
        },
        series: [
          { type: "scatter", data: shown.filter((e) => e !== selected).map((e) => point(e, false)), cursor: "pointer" },
          // Drawn last, so the selected event sits on top of its neighbours.
          { type: "scatter", data: selected ? [point(selected, true)] : [], cursor: "pointer" },
        ],
      },
      { notMerge: true },
    );
  }, [lanes, events, xRange, gridLeft, selectedId, themeKey, formatTime, zoom]);

  const onKeyDown = (e: KeyboardEvent) => {
    const { start, end } = zoom.percent();
    const width = end - start;
    if (e.key === "+" || e.key === "=") zoom.to(start + width / 4, width / 2);
    else if (e.key === "-" || e.key === "_") zoom.to(start - width / 2, width * 2);
    else if (e.key === "0") zoom.to(0, 100);
    else if (e.shiftKey && (e.key === "ArrowLeft" || e.key === "ArrowRight"))
      zoom.to(start + (e.key === "ArrowLeft" ? -width / 4 : width / 4), width);
    else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const { events: all, selectedId: current, onSelect: select } = latest.current;
      const sorted = [...all].sort((a, b) => a.t - b.t);
      const view = zoom.window();
      const at = sorted.findIndex((x) => x.id === current);
      const next =
        at === -1
          ? e.key === "ArrowRight"
            ? (sorted.find((x) => x.t >= view.from) ?? sorted[0])
            : ([...sorted].reverse().find((x) => x.t <= view.to) ?? sorted.at(-1))
          : sorted[Math.min(sorted.length - 1, Math.max(0, at + (e.key === "ArrowRight" ? 1 : -1)))];
      if (!next) return;
      select?.(next.id);
      // Keep it in view: pan to it if it's outside the zoomed window.
      if (next.t < view.from || next.t > view.to) {
        const centre = ((next.t - xRange.from) / (xRange.to - xRange.from)) * 100;
        zoom.to(centre - width / 2, width);
      }
    } else return;
    e.preventDefault();
  };

  // A canvas can't hold focusable parts, so the whole chart is one keyboard stop that handles
  // the keys itself (the "application" role tells a screen reader to pass them through; the page
  // announces what's selected). jsx-a11y doesn't count "application" as interactive.
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- see above
    <div
      ref={el}
      role="application"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- see above
      tabIndex={0}
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      onKeyDown={onKeyDown}
      className="rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      style={{ height: lanes.length * LANE_HEIGHT + 64, width: "100%" }}
    />
  );
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}
