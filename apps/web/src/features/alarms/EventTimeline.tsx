/**
 * Event timeline (spec §6.5): alarms, operator actions, maintenance, process events and
 * predictions, drawn in lanes on one time axis, and listed below it newest first, grouped by
 * hour. Zoom or pan the lanes and the list keeps to the part in view.
 */
import type { TimeWindow } from "@pdm/charts";
import { TimelineEventKind, type TimelineEvent } from "@pdm/contracts";
import { HealthBadge, Skeleton, cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { BellRing, BrainCircuit, Factory, UserCheck, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { roundedWindow, useSimNow } from "../../shared/sim-time";
import { useGlobalSearch, useSetGlobalSearch } from "../../shared/time-range";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";
import { EventLanes, useTimelineEvents } from "../timeline/EventLanes";

const ICON = { alarm: BellRing, operator_action: UserCheck, maintenance: Wrench, process: Factory, prediction: BrainCircuit } as const;

export function EventTimeline() {
  const { t } = useTranslation();
  const { scopeId, range } = useGlobalSearch();
  const setSearch = useSetGlobalSearch();
  const { now } = useSimNow();
  const tz = usePreferences((p) => p.timeZone);
  const [kinds, setKinds] = useState<Set<TimelineEventKind>>(new Set(TimelineEventKind.options));
  const { from, to } = roundedWindow(range, now);
  const span = useMemo(() => ({ from, to }), [from, to]);
  const shownKinds = useMemo(() => TimelineEventKind.options.filter((k) => kinds.has(k)), [kinds]);
  const events = useTimelineEvents({ scopeId }, span, shownKinds);
  const format = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);
  // The part of the range in view in the lanes (null until they're drawn, or without canvas).
  const [view, setView] = useState<TimeWindow | null>(null);
  const zoomed = view !== null && (view.from > span.from + 60_000 || view.to < span.to - 60_000);
  const items = useMemo(() => events.data?.items ?? [], [events.data]);
  const inView = useMemo(
    () => (zoomed ? items.filter((e) => Date.parse(e.t) >= view.from && Date.parse(e.t) <= view.to) : items),
    [items, zoomed, view],
  );

  // Newest first, grouped by hour.
  const groups = useMemo(() => {
    const out = new Map<string, TimelineEvent[]>();
    for (const e of [...inView].reverse()) {
      const hour = format(Math.floor(Date.parse(e.t) / 3_600_000) * 3_600_000);
      out.set(hour, [...(out.get(hour) ?? []), e]);
    }
    return [...out];
  }, [inView, format]);

  const toggle = (k: TimelineEventKind) => {
    const next = new Set(kinds);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    if (next.size > 0) setKinds(next);
  };

  return (
    <DashboardWidget
      title={t("timeline.title", { range: t(`timeRange.${range}`) })}
      query={events}
      isEmpty={items.length === 0}
      emptyText={t("timeline.empty")}
      skeleton={
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      }
      actions={
        <span className="hidden gap-1 md:flex" role="group" aria-label={t("timeline.kinds")}>
          {TimelineEventKind.options.map((k) => {
            const Icon = ICON[k];
            return (
              <button
                key={k}
                type="button"
                aria-pressed={kinds.has(k)}
                onClick={() => toggle(k)}
                className={cx(
                  "flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs",
                  kinds.has(k) ? "border-accent text-fg" : "border-line text-fg-muted",
                )}
              >
                <Icon aria-hidden className="size-3.5" />
                {t(`timeline.kind.${k}`)}
              </button>
            );
          })}
        </span>
      }
    >
      <EventLanes events={items} kinds={shownKinds} span={span} onWindowChange={setView} follows="list" />
      <h3 className="mt-4 mb-2 text-sm font-semibold">
        {zoomed
          ? t("timeline.listZoomed", { count: inView.length, from: format(view.from), to: format(view.to) })
          : t("timeline.listAll", { count: inView.length })}
      </h3>
      <ol className="flex flex-col gap-4">
        {groups.map(([hour, items]) => (
          <li key={hour}>
            <h4 className="mb-1 text-xs font-semibold text-fg-muted">{hour}</h4>
            <ul className="flex flex-col border-l border-line">
              {items.map((e) => {
                const Icon = ICON[e.kind];
                return (
                  <li key={e.id} className="relative flex items-start gap-2 py-1 pl-4 text-sm">
                    <Icon aria-hidden className="absolute top-1.5 -left-2 size-4 rounded-full bg-surface text-fg-muted" />
                    {e.severity && <HealthBadge compact state={e.severity} label={t(`health.${e.severity}`)} className="mt-0.5" />}
                    <span className="min-w-0 flex-1">
                      <span className="sr-only">{t(`timeline.kind.${e.kind}`)}: </span>
                      {e.title}
                      {e.detail && <span className="block text-xs text-fg-muted">{e.detail}</span>}
                    </span>
                    {e.kind === "prediction" && e.refId ? (
                      <button
                        type="button"
                        onClick={() => setSearch({ prediction: e.refId ?? undefined })}
                        className="font-mono text-xs text-accent hover:underline"
                      >
                        {e.assetId}
                      </button>
                    ) : (
                      <Link
                        to="/assets/$assetId"
                        params={{ assetId: e.assetId }}
                        search={(prev) => prev}
                        className="font-mono text-xs text-fg-muted hover:underline"
                      >
                        {e.assetId}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>
    </DashboardWidget>
  );
}
