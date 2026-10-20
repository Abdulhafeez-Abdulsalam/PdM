/**
 * Alarms & Events (spec §6.5). Live alarm list with ISA-18.2 actions, alarm-load indicators
 * (a flood warning when operators are overwhelmed), and the event timeline.
 */
import { useApiQuery } from "@pdm/api-client";
import { AlarmPriority } from "@pdm/contracts";
import { Banner, PriorityIcon, Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Waves } from "lucide-react";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useSimNow } from "../../shared/sim-time";
import { useGlobalSearch } from "../../shared/time-range";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";
import { AlarmTable } from "./AlarmTable";
import { ALARM_SHOW, STATES_FOR, useAlarmSearch, type AlarmSearch } from "./alarm-search";
import { EventTimeline } from "./EventTimeline";

/** ISA-18.2: more than 10 new alarms in 10 minutes per operator is an alarm flood. */
const FLOOD_WINDOW_MS = 10 * 60_000;
const FLOOD_THRESHOLD = 10;
const STANDING_AFTER_MS = 24 * 3_600_000;

export function AlarmsPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const search = useAlarmSearch();
  const navigate = useNavigate();
  const setAlarmSearch = (patch: Partial<Record<keyof AlarmSearch, string>>) =>
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }) });

  useEffect(() => {
    document.title = `${t("modules.alarms.name")} · ${t("app.name")}`;
  }, [t]);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("modules.alarms.name")}</h1>
          <p className="text-fg-muted">{t("alarmsPage.intro")}</p>
        </div>
        <div role="tablist" aria-label={t("alarmsPage.views")} className="flex rounded-md border border-line p-0.5">
          {(["list", "timeline"] as const).map((v) => (
            <button key={v} type="button" role="tab" aria-selected={search.view === v} onClick={() => setAlarmSearch({ view: v })}
              className={cx("rounded px-3 py-1 text-sm", search.view === v ? "bg-sunken font-semibold" : "text-fg-muted hover:text-fg")}>
              {t(`alarmsPage.view.${v}`)}
            </button>
          ))}
        </div>
      </header>

      <AlarmLoad scopeId={scopeId} />

      {search.view === "timeline" ? <EventTimeline /> : <AlarmListView scopeId={scopeId} search={search} onChange={setAlarmSearch} />}
    </div>
  );
}

/** How hard the alarm system is working right now. */
function AlarmLoad({ scopeId }: { scopeId: string }) {
  const { t } = useTranslation();
  const { now } = useSimNow();
  const active = useApiQuery("alarms.list", { scopeId, states: STATES_FOR.active, sort: "newest", limit: 500 }, { refetchInterval: 15_000 });
  const items = active.data?.items ?? [];
  const recent = items.filter((a) => now - Date.parse(a.raisedAt) < FLOOD_WINDOW_MS).length;
  const unacked = items.filter((a) => a.state === "active_unacked" || a.state === "rtn_unacked").length;
  const standing = items.filter((a) => a.state !== "rtn_unacked" && now - Date.parse(a.raisedAt) > STANDING_AFTER_MS).length;

  if (active.isPending) return <Skeleton className="h-16" />;
  return (
    <>
      {recent >= FLOOD_THRESHOLD && (
        <Banner tone="warning">
          <Waves aria-hidden className="size-4" />
          {t("alarmsPage.flood", { count: recent })}
        </Banner>
      )}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <LoadStat label={t("alarmsPage.load.active")} value={items.length} />
        <LoadStat label={t("alarmsPage.load.unacked")} value={unacked} />
        <LoadStat label={t("alarmsPage.load.recent")} value={recent} hint={t("alarmsPage.load.recentHint", { max: FLOOD_THRESHOLD })} warn={recent >= FLOOD_THRESHOLD} />
        <LoadStat label={t("alarmsPage.load.standing")} value={standing} hint={t("alarmsPage.load.standingHint")} />
      </dl>
    </>
  );
}

function LoadStat({ label, value, hint, warn }: { label: string; value: number; hint?: string; warn?: boolean }) {
  return (
    <div className={cx("rounded-lg border bg-surface p-3", warn ? "border-health-warning" : "border-line")}>
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className="text-2xl font-semibold">{value}</dd>
      {hint && <dd className="text-xs text-fg-muted">{hint}</dd>}
    </div>
  );
}

function AlarmListView({ scopeId, search, onChange }: { scopeId: string; search: AlarmSearch; onChange: (patch: Partial<Record<keyof AlarmSearch, string>>) => void }) {
  const { t } = useTranslation();
  const alarms = useApiQuery(
    "alarms.list",
    { scopeId, states: STATES_FOR[search.show], priorities: search.priority.length > 0 ? search.priority : undefined, sort: "priority", limit: 500 },
    { refetchInterval: 15_000, placeholderData: keepPreviousData },
  );
  const items = alarms.data?.items ?? [];

  const togglePriority = (p: AlarmPriority) => {
    const next = search.priority.includes(p) ? search.priority.filter((x) => x !== p) : [...search.priority, p];
    onChange({ priority: next.join(",") || undefined });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <Select label={t("alarmsPage.show")} value={search.show} options={ALARM_SHOW.map((s) => ({ value: s, label: t(`alarmsPage.showOption.${s}`) }))} onChange={(show) => onChange({ show })} />
        <span role="group" aria-label={t("alarmsPage.priorities")} className="flex gap-1">
          {AlarmPriority.options.map((p) => (
            <button key={p} type="button" aria-pressed={search.priority.includes(p)} onClick={() => togglePriority(p)}
              className={cx("flex items-center gap-1 rounded-md border px-2 py-1 text-xs", search.priority.includes(p) ? "border-accent font-semibold" : "border-line text-fg-muted")}>
              <PriorityIcon priority={p} />
              {t(`alarms.priority.${p}`)}
            </button>
          ))}
        </span>
        <Select label={t("alarmsPage.group")} value={search.group} options={[{ value: "none", label: t("alarmsPage.groupNone") }, { value: "asset", label: t("alarmsPage.groupAsset") }]} onChange={(group) => onChange({ group })} />
      </div>

      <DashboardWidget
        title={t("alarmsPage.listTitle", { count: alarms.data?.total ?? 0 })}
        query={alarms}
        isEmpty={items.length === 0}
        emptyText={t("alarmsPage.empty")}
        skeleton={<div className="flex flex-col gap-2">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-9" />)}</div>}
      >
        <AlarmTable alarms={items} caption={t("alarmsPage.listTitle", { count: items.length })} groupByAsset={search.group === "asset"} />
      </DashboardWidget>
    </>
  );
}
