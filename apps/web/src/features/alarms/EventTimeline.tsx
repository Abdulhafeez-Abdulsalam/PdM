/**
 * Event timeline (spec §6.5): alarms, operator actions, maintenance, process events and
 * predictions on one time line, newest first, grouped by hour. A basic version — the
 * synchronised canvas with charts comes in Phase 2.
 */
import { useApiQuery } from "@pdm/api-client";
import { TimelineEventKind, type TimelineEvent } from "@pdm/contracts";
import { HealthBadge, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { BellRing, BrainCircuit, Factory, UserCheck, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { roundedWindow, toIso, useSimNow } from "../../shared/sim-time";
import { useGlobalSearch, useSetGlobalSearch } from "../../shared/time-range";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";

const ICON = { alarm: BellRing, operator_action: UserCheck, maintenance: Wrench, process: Factory, prediction: BrainCircuit } as const;

export function EventTimeline() {
  const { t } = useTranslation();
  const { scopeId, range } = useGlobalSearch();
  const setSearch = useSetGlobalSearch();
  const { now } = useSimNow();
  const tz = usePreferences((p) => p.timeZone);
  const [kinds, setKinds] = useState<Set<TimelineEventKind>>(new Set(TimelineEventKind.options));
  const span = roundedWindow(range, now);
  const events = useApiQuery(
    "events.list",
    { scopeId, from: toIso(span.from), to: toIso(span.to), limit: 500, kinds: [...kinds] },
    { placeholderData: keepPreviousData, refetchInterval: 15_000 },
  );
  const format = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);

  // Newest first, grouped by hour.
  const groups = useMemo(() => {
    const out = new Map<string, TimelineEvent[]>();
    for (const e of [...(events.data?.items ?? [])].reverse()) {
      const hour = format(Math.floor(Date.parse(e.t) / 3_600_000) * 3_600_000);
      out.set(hour, [...(out.get(hour) ?? []), e]);
    }
    return [...out];
  }, [events.data, format]);

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
      isEmpty={groups.length === 0}
      emptyText={t("timeline.empty")}
      skeleton={<div className="flex flex-col gap-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8" />)}</div>}
      actions={
        <span className="hidden gap-1 md:flex" role="group" aria-label={t("timeline.kinds")}>
          {TimelineEventKind.options.map((k) => {
            const Icon = ICON[k];
            return (
              <button key={k} type="button" aria-pressed={kinds.has(k)} onClick={() => toggle(k)}
                className={cx("flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs", kinds.has(k) ? "border-accent text-fg" : "border-line text-fg-muted")}>
                <Icon aria-hidden className="size-3.5" />
                {t(`timeline.kind.${k}`)}
              </button>
            );
          })}
        </span>
      }
    >
      <ol className="flex flex-col gap-4">
        {groups.map(([hour, items]) => (
          <li key={hour}>
            <h3 className="mb-1 text-xs font-semibold text-fg-muted">{hour}</h3>
            <ul className="flex flex-col border-l border-line">
              {items.map((e) => {
                const Icon = ICON[e.kind];
                return (
                  <li key={e.id} className="relative flex items-start gap-2 py-1 pl-4 text-sm">
                    <Icon aria-hidden className="absolute -left-2 top-1.5 size-4 rounded-full bg-surface text-fg-muted" />
                    {e.severity && <HealthBadge compact state={e.severity} label={t(`health.${e.severity}`)} className="mt-0.5" />}
                    <span className="min-w-0 flex-1">
                      <span className="sr-only">{t(`timeline.kind.${e.kind}`)}: </span>
                      {e.title}
                      {e.detail && <span className="block text-xs text-fg-muted">{e.detail}</span>}
                    </span>
                    {e.kind === "prediction" && e.refId ? (
                      <button type="button" onClick={() => setSearch({ prediction: e.refId ?? undefined })} className="font-mono text-xs text-accent hover:underline">
                        {e.assetId}
                      </button>
                    ) : (
                      <Link to="/assets/$assetId" params={{ assetId: e.assetId }} search={(prev) => prev} className="font-mono text-xs text-fg-muted hover:underline">
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
