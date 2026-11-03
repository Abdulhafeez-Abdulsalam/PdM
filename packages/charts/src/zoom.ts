/**
 * Shared zoom for charts on one time axis.
 *
 * echarts.connect(group) replays every zoom or pan in one chart on the others in its group. It
 * works in percent of the axis, so the charts must have the same axis range (`xRange`) to show
 * the same moment. Redrawing a chart with new data would normally reset its zoom, and only that
 * chart's, putting the group out of step; useKeepZoom remembers the zoom and puts it back. A
 * chart that joins a group later (a sensor ticked while zoomed in) starts at the group's zoom.
 */
import * as echarts from "echarts/core";
import { useEffect, useMemo, useRef } from "react";

/** A time window, ms since 1970. */
export interface TimeWindow {
  from: number;
  to: number;
}

/** The latest zoom of each group, for charts that join it later. */
const groupZoom = new Map<string, { start: number; end: number }>();

/**
 * A new group name, for a set of charts that zoom together. Make it once per mount
 * (`useState(newChartGroup)`), so a page visited again doesn't come back zoomed.
 */
export function newChartGroup(): string {
  return `charts-${Math.random().toString(36).slice(2)}`;
}

/** Join the chart to its group (or do nothing without one). */
export function connectGroup(chart: echarts.ECharts | null, group: string | undefined): void {
  if (!chart || !group) return;
  chart.group = group;
  echarts.connect(group);
}

export interface KeptZoom {
  /** Call once the chart exists; returns the clean-up. */
  bind: (chart: echarts.ECharts) => () => void;
  /** The zoom as percent of the axis, to spread into each dataZoom option. */
  percent: () => { start: number; end: number };
  /** The part of `xRange` in view. */
  window: () => TimeWindow;
  /** Zoom to `width` percent of the axis starting at `start` percent (kept inside 0–100). */
  to: (start: number, width: number) => void;
}

export function useKeepZoom(xRange: TimeWindow | undefined, group: string | undefined, onWindowChange?: (w: TimeWindow) => void): KeptZoom {
  const zoom = useRef((group && groupZoom.get(group)) || { start: 0, end: 100 });
  const range = useRef(xRange);
  const report = useRef(onWindowChange);
  const chart = useRef<echarts.ECharts | null>(null);

  const kept = useMemo<KeptZoom>(() => {
    const window = (): TimeWindow => {
      const r = range.current ?? { from: 0, to: 0 };
      const span = r.to - r.from;
      return { from: r.from + (span * zoom.current.start) / 100, to: r.from + (span * zoom.current.end) / 100 };
    };
    return {
      bind: (c) => {
        chart.current = c;
        const onZoom = () => {
          const [dz] = (c.getOption() as { dataZoom?: { start?: number; end?: number }[] }).dataZoom ?? [];
          zoom.current = { start: dz?.start ?? 0, end: dz?.end ?? 100 };
          if (c.group) groupZoom.set(c.group, zoom.current);
          report.current?.(window());
        };
        c.on("datazoom", onZoom);
        return () => {
          c.off("datazoom", onZoom);
          chart.current = null;
        };
      },
      percent: () => ({ ...zoom.current }),
      window,
      to: (start, width) => {
        const w = Math.min(100, Math.max(0.5, width));
        const s = Math.min(100 - w, Math.max(0, start));
        chart.current?.dispatchAction({ type: "dataZoom", start: s, end: s + w });
      },
    };
  }, []);

  useEffect(() => {
    report.current = onWindowChange;
  });
  const from = xRange?.from;
  const to = xRange?.to;
  useEffect(() => {
    if (from === undefined || to === undefined) return;
    range.current = { from, to };
    report.current?.(kept.window());
  }, [from, to, kept]);

  return kept;
}
