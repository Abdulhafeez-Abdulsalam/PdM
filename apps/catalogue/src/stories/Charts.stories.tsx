import { EventLanesChart, TimeSeriesChart, type LaneEvent, type LimitLine } from "@pdm/charts";
import { Sparkline } from "@pdm/ui";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { HOUR, LANES, START, WEEK_EVENTS, floodEvents, formatTime, formatValue, labels, series } from "./chart-data";

const meta = { title: "Charts/Time series and event lanes" } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const WEEK = { from: START, to: START + 168 * HOUR };
const LIMITS: LimitLine[] = [
  { level: "alert", value: 4.48, label: "Alert" },
  { level: "alarm", value: 5.88, label: "Alarm" },
  { level: "trip", value: 7.84, label: "Trip" },
];
const common = { intervalMs: HOUR, formatValue, formatTime, labels, height: 220 };
const Frame = ({ children }: { children: ReactNode }) => <div className="max-w-3xl">{children}</div>;
const inWindow = (t: number, fromHour: number, toHour: number) => t >= START + fromHour * HOUR && t < START + toHour * HOUR;

/** One measurement: the line is the average, the band each hour's min–max, dashed lines the limits. */
export const SensorWithLimits: Story = {
  render: () => (
    <Frame>
      <TimeSeriesChart
        {...common}
        points={series(168)}
        limits={LIMITS}
        ariaLabel="Bearing vibration velocity, 4.0 to 5.3 mm/s over the week"
      />
    </Frame>
  ),
};

/** Stale and missing data: the line breaks where readings stopped, instead of drawing across the gap. */
export const DataGaps: Story = {
  render: () => (
    <Frame>
      <TimeSeriesChart
        {...common}
        points={series(168).filter((p) => !inWindow(p.t, 40, 70) && !inWindow(p.t, 130, 136))}
        ariaLabel="Bearing vibration velocity with two gaps in the readings"
      />
    </Frame>
  ),
};

/** Doubtful readings: hover a point to see its quality. */
export const BadQuality: Story = {
  render: () => (
    <Frame>
      <TimeSeriesChart
        {...common}
        points={series(168).map((p, i) => (i % 17 < 3 ? { ...p, quality: i % 2 ? ("bad" as const) : ("uncertain" as const) } : p))}
        ariaLabel="Bearing vibration velocity, some readings of doubtful quality"
      />
    </Frame>
  ),
};

/** Extreme values: a short spike far above everything else stays visible in the band. */
export const Spike: Story = {
  render: () => (
    <Frame>
      <TimeSeriesChart
        {...common}
        points={series(168).map((p, i) => (i === 90 ? { ...p, max: 38.5, avg: p.avg + 2 } : p))}
        limits={LIMITS}
        ariaLabel="Bearing vibration velocity with one spike to 38.5 mm/s"
      />
    </Frame>
  ),
};

/** Extreme values: large numbers, and a perfectly flat line. */
export const LargeAndFlat: Story = {
  render: () => (
    <Frame>
      <div className="flex flex-col gap-4">
        <TimeSeriesChart
          {...common}
          points={series(168, { base: 125_000, rise: 4_000, swing: 1_500 })}
          ariaLabel="Gas flow, about 125,000 m³/h"
        />
        <TimeSeriesChart {...common} points={series(168, { base: 50, rise: 0, swing: 0 })} ariaLabel="Speed setpoint, steady at 50 Hz" />
      </div>
    </Frame>
  ),
};

/** Empty: no points at all. Pages show their own "no data" message instead of an empty chart. */
export const NoPoints: Story = {
  render: () => (
    <Frame>
      <TimeSeriesChart {...common} points={[]} xRange={WEEK} ariaLabel="Bearing vibration velocity: no data in this range" />
    </Frame>
  ),
};

/** Sensor charts and event lanes on one time axis: zoom or pan any of them and the rest follow. */
export const SharedTimeAxis: Story = {
  render: () => (
    <Frame>
      <div className="flex flex-col gap-2">
        <TimeSeriesChart
          {...common}
          points={series(168)}
          limits={LIMITS}
          group="story-sync"
          xRange={WEEK}
          gridLeft={112}
          ariaLabel="Bearing vibration velocity"
        />
        <TimeSeriesChart
          {...common}
          points={series(168, { base: 72, rise: 6, swing: 1.5, seed: 3 })}
          group="story-sync"
          xRange={WEEK}
          gridLeft={112}
          ariaLabel="Bearing temperature"
        />
        <EventLanesChart
          lanes={LANES}
          events={WEEK_EVENTS}
          xRange={WEEK}
          group="story-sync"
          gridLeft={112}
          formatTime={formatTime}
          ariaLabel="Events on the same time axis, 9 events"
        />
      </div>
    </Frame>
  ),
};

function Lanes({ events, selected }: { events: LaneEvent[]; selected?: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(selected ?? null);
  const picked = events.find((e) => e.id === selectedId);
  return (
    <Frame>
      <EventLanesChart
        lanes={LANES}
        events={events}
        xRange={WEEK}
        selectedId={selectedId}
        onSelect={setSelectedId}
        formatTime={formatTime}
        ariaLabel={`Event timeline, ${events.length} events`}
      />
      <p aria-live="polite" className="mt-2 text-sm">
        {picked ? `${formatTime(picked.t)}: ${picked.label}` : "Pick an event (click, or ← → with the chart focused)."}
      </p>
    </Frame>
  );
}

/** A week on one asset, from the first prediction to the verified repair. */
export const EventLanes: Story = { render: () => <Lanes events={WEEK_EVENTS} /> };
/** With an event picked: drawn larger, with an outline, on top of its neighbours. */
export const EventLanesSelected: Story = { render: () => <Lanes events={WEEK_EVENTS} selected="e6" /> };
/** An alarm flood: 300 events within 18 hours. */
export const EventLanesFlood: Story = { render: () => <Lanes events={floodEvents(300)} /> };
/** Empty: the lanes with nothing in them. */
export const EventLanesEmpty: Story = { render: () => <Lanes events={[]} /> };

/** The tiny trend line on KPI cards: decorative, so hidden from screen readers. */
export const Sparklines: Story = {
  render: () => (
    <div className="flex items-center gap-6 text-fg-muted">
      <Sparkline values={[3, 4, 3.5, 5, 6, 5.5, 7]} />
      <Sparkline values={[7, 6, 6.5, 5, 4, 4.5, 3]} />
      <Sparkline values={[5, 5, 5, 5]} />
    </div>
  ),
};
