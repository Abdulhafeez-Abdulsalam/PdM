/**
 * Asset 360 · Telemetry: every sensor with its live value and limits; tick up to 5 to chart
 * them over the global time range, with the asset's events in lanes underneath on the same
 * time axis (zoom or pan any of them and the rest follow).
 */
import { useApiQuery } from "@pdm/api-client";
import { MAX_SERIES_PER_CHART, type Asset, type Tag } from "@pdm/contracts";
import { newChartGroup, type TimeWindow } from "@pdm/charts";
import { Skeleton } from "@pdm/ui";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { roundedWindow, useSimNow } from "../../shared/sim-time";
import { useGlobalSearch } from "../../shared/time-range";
import { conversionFor, formatMeasurement } from "../../shared/units";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";
import { limitList } from "../telemetry/limits";
import { LiveTagValue } from "../telemetry/LiveTagValue";
import { TagCharts } from "../telemetry/TagCharts";
import { EventLanes, TIMELINE_GRID_LEFT, useTimelineEvents } from "../timeline/EventLanes";
import { keyTags } from "./OverviewTab";

export function TelemetryTab({ asset, siteTimeZone }: { asset: Asset; siteTimeZone?: string }) {
  const { t } = useTranslation();
  const { range } = useGlobalSearch();
  const { now } = useSimNow();
  const { from, to } = roundedWindow(range, now);
  const [group] = useState(newChartGroup);
  const sync = useMemo(() => ({ group, span: { from, to }, gridLeft: TIMELINE_GRID_LEFT }), [group, from, to]);
  const events = useTimelineEvents({ assetId: asset.id }, sync.span);
  // The part of the range in view, when zoomed: said in the heading, since it applies to every chart.
  const [view, setView] = useState<TimeWindow | null>(null);
  const zoomed = view !== null && (view.from > from + 60_000 || view.to < to - 60_000);
  const tzMode = usePreferences((p) => p.timeZone);
  const formatTime = useMemo(() => makeTimeFormatter(tzMode, siteTimeZone), [tzMode, siteTimeZone]);
  const tags = useApiQuery("assets.tags", { assetId: asset.id });
  const all = useMemo(() => tags.data?.items ?? [], [tags.data]);
  // null = "the user hasn't picked yet", in which case the two most telling tags are shown.
  // Calculated, not copied into state by an effect.
  const [picked, setPicked] = useState<string[] | null>(null);
  const selected = picked ?? keyTags(all, 2).map((tg) => tg.id);

  const toggle = (id: string) =>
    setPicked(
      selected.includes(id) ? selected.filter((x) => x !== id) : selected.length >= MAX_SERIES_PER_CHART ? selected : [...selected, id],
    );
  const chosen = selected.map((id) => all.find((tg) => tg.id === id)).filter((tg): tg is Tag => Boolean(tg));

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-12">
      <DashboardWidget
        title={t("telemetry.sensors", { count: all.length })}
        query={tags}
        className="xl:col-span-5"
        skeleton={
          <div className="flex flex-col gap-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className="h-8" />
            ))}
          </div>
        }
      >
        <p className="mb-2 text-xs text-fg-muted">{t("telemetry.pickHint", { max: MAX_SERIES_PER_CHART })}</p>
        <ul className="flex flex-col">
          {all.map((tag) => (
            <li key={tag.id} className="border-b border-line last:border-0">
              <label className="flex cursor-pointer items-start gap-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={selected.includes(tag.id)}
                  disabled={!selected.includes(tag.id) && selected.length >= MAX_SERIES_PER_CHART}
                  onChange={() => toggle(tag.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block">{tag.description}</span>
                  <span className="block font-mono text-xs text-fg-muted">{tag.name}</span>
                  <LimitsText tag={tag} />
                </span>
                <LiveTagValue tag={tag} />
              </label>
            </li>
          ))}
        </ul>
      </DashboardWidget>

      <section aria-label={t("telemetry.charts")} className="rounded-lg border border-line bg-surface p-4 xl:col-span-7">
        <h2 className="font-semibold">{t("telemetry.history", { range: t(`timeRange.${range}`) })}</h2>
        <div className="mt-2">
          <TagCharts tags={chosen} siteTimeZone={siteTimeZone} sync={sync} />
        </div>
        <h3 className="mt-6 mb-2 text-sm font-semibold">
          {zoomed
            ? t("timeline.assetEventsZoomed", { from: formatTime(view.from), to: formatTime(view.to) })
            : t("timeline.assetEvents", { count: events.data?.items.length ?? 0 })}
        </h3>
        <EventLanes
          events={events.data?.items ?? []}
          span={sync.span}
          group={group}
          siteTimeZone={siteTimeZone}
          showAsset={false}
          follows="charts"
          onWindowChange={setView}
        />
      </section>
    </div>
  );
}

function LimitsText({ tag }: { tag: Tag }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  const limits = limitList(tag.limits);
  if (limits.length === 0) return null;
  const conv = conversionFor(tag.quantity, units);
  return (
    <span className="block text-xs text-fg-muted">
      {limits.map((l) => `${t(`telemetry.limit.${l.level}`)} ${formatMeasurement(conv.convert(l.value))}`).join(" · ")}{" "}
      {t(`unitSymbol.${conv.unit}`)}
    </span>
  );
}
