/**
 * The event timeline drawn as lanes (spec §6.5): one lane per kind of event, on the same time
 * axis as the sensor charts above it (pass their `group`, `span` and `gridLeft`). Pick an event
 * (click it, or ← → with the chart focused) and it's described below with a link to it.
 *
 * Without canvas (some test environments, locked-down browsers) the lanes aren't drawn; pages
 * show the events as a list as well, so nothing is lost.
 */
import { useApiQuery } from "@pdm/api-client";
import { EventLanesChart, canvasAvailable, type Lane, type LaneEvent, type TimeWindow } from "@pdm/charts";
import { TimelineEventKind, type TimelineEvent } from "@pdm/contracts";
import { HealthBadge } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useId, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { toIso } from "../../shared/sim-time";
import { useSetGlobalSearch } from "../../shared/time-range";

/** The left margin the lanes and the sensor charts share, so their time axes line up. */
export const TIMELINE_GRID_LEFT = 112;

/** Events for a site/area or one asset over a time span, refreshed every 15 s. */
export function useTimelineEvents(where: { scopeId?: string; assetId?: string }, span: TimeWindow, kinds?: TimelineEventKind[]) {
  return useApiQuery(
    "events.list",
    { ...where, from: toIso(span.from), to: toIso(span.to), limit: 500, kinds },
    { placeholderData: keepPreviousData, refetchInterval: 15_000 },
  );
}

interface Props {
  events: readonly TimelineEvent[];
  /** The lanes to draw, in order (default: every kind). */
  kinds?: readonly TimelineEventKind[];
  span: TimeWindow;
  /** Share zoom with the sensor charts that have this group. */
  group?: string;
  onWindowChange?: (w: TimeWindow) => void;
  siteTimeZone?: string;
  /** Show the asset on each event (off on an asset's own page). */
  showAsset?: boolean;
  /** What else on the page moves with the zoom, to say so in the hint. */
  follows?: "charts" | "list";
}

export function EventLanes({
  events,
  kinds = TimelineEventKind.options,
  span,
  group,
  onWindowChange,
  siteTimeZone,
  showAsset = true,
  follows,
}: Props) {
  const { t } = useTranslation();
  const theme = usePreferences((p) => p.theme);
  const tzMode = usePreferences((p) => p.timeZone);
  const formatTime = useMemo(() => makeTimeFormatter(tzMode, siteTimeZone), [tzMode, siteTimeZone]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const hintId = useId();
  const canDraw = useMemo(() => canvasAvailable(), []);

  const lanes: Lane[] = useMemo(() => kinds.map((k) => ({ id: k, label: t(`timeline.kind.${k}`) })), [kinds, t]);
  const laneEvents: LaneEvent[] = useMemo(
    () =>
      events.map((e) => ({
        id: e.id,
        lane: e.kind,
        t: Date.parse(e.t),
        tone: e.severity ?? "neutral",
        label: showAsset ? `${e.assetId} · ${e.title}` : e.title,
      })),
    [events, showAsset],
  );
  const counts = kinds.map((k) => `${t(`timeline.kind.${k}`)} ${events.filter((e) => e.kind === k).length}`).join(", ");
  const selected = events.find((e) => e.id === selectedId) ?? null;

  if (!canDraw) return null;
  return (
    <div className="flex flex-col gap-2">
      <EventLanesChart
        lanes={lanes}
        events={laneEvents}
        xRange={span}
        group={group}
        gridLeft={TIMELINE_GRID_LEFT}
        selectedId={selectedId}
        onSelect={setSelectedId}
        onWindowChange={onWindowChange}
        themeKey={theme}
        ariaLabel={t("timeline.lanes", { count: events.length, counts })}
        describedBy={hintId}
        formatTime={formatTime}
      />
      <p id={hintId} className="text-xs text-fg-muted">
        {t("timeline.keys")} {follows && t(`timeline.follows.${follows}`)}
      </p>
      <div aria-live="polite" className="min-h-12">
        {selected ? (
          <EventDetail event={selected} formatTime={formatTime} showAsset={showAsset} />
        ) : (
          <p className="text-sm text-fg-muted">{t("timeline.pick")}</p>
        )}
      </div>
    </div>
  );
}

/** One event, described, with a link to whatever it's about. */
export function EventDetail({
  event: e,
  formatTime,
  showAsset,
}: {
  event: TimelineEvent;
  formatTime: (t: number) => string;
  showAsset: boolean;
}) {
  const { t } = useTranslation();
  const setSearch = useSetGlobalSearch();
  const link = "text-sm text-accent hover:underline";
  return (
    <section aria-label={t("timeline.selected")} className="flex flex-wrap items-start gap-x-3 gap-y-1 rounded-md border border-line p-3">
      {e.severity && <HealthBadge compact state={e.severity} label={t(`health.${e.severity}`)} className="mt-0.5" />}
      <div className="min-w-0 flex-1">
        <p className="text-xs text-fg-muted">
          {t(`timeline.kind.${e.kind}`)} · {formatTime(Date.parse(e.t))}
          {showAsset && <span className="font-mono"> · {e.assetId}</span>}
        </p>
        <p className="text-sm font-medium">{e.title}</p>
        {e.detail && <p className="text-xs text-fg-muted">{e.detail}</p>}
      </div>
      {e.kind === "prediction" && e.refId ? (
        <button type="button" className={link} onClick={() => setSearch({ prediction: e.refId ?? undefined })}>
          {t("timeline.open.prediction")}
        </button>
      ) : e.kind === "maintenance" && e.refId ? (
        <Link to="/maintenance/$workOrderId" params={{ workOrderId: e.refId }} className={link}>
          {t("timeline.open.maintenance")}
        </Link>
      ) : e.kind === "alarm" ? (
        <Link to="/assets/$assetId/$tab" params={{ assetId: e.assetId, tab: "alarms" }} search={(prev) => prev} className={link}>
          {t("timeline.open.alarm")}
        </Link>
      ) : (
        showAsset && (
          <Link to="/assets/$assetId" params={{ assetId: e.assetId }} search={(prev) => prev} className={link}>
            {t("timeline.open.asset")}
          </Link>
        )
      )}
    </section>
  );
}
