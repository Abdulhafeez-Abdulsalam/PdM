/**
 * The digital twin (spec §6.8, 2D: scope decision 11). Pick a site and an area; the drawing
 * shows every asset in it with its health and values. The time slider replays any hour of the
 * last three days (Play steps through them), and the strip under it shows when something in the
 * area was past a limit, so you can jump straight to the interesting hours.
 * URL: /twin?site=…&area=…&h=hours ago&focus=asset to highlight.
 */
import { useApiQuery } from "@pdm/api-client";
import { TWIN_REPLAY_HOURS, type LimitLevel } from "@pdm/contracts";
import { Button, Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { Pause, Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { TwinView } from "./TwinView";

const searchSchema = z.object({
  site: z.string().optional().catch(undefined),
  area: z.string().optional().catch(undefined),
  h: z.coerce.number().int().min(0).max(TWIN_REPLAY_HOURS).catch(0).default(0),
  focus: z.string().optional().catch(undefined),
});

/** Colours for the activity strip; every level is also written out in the summary and legend. */
const STRIP: Record<LimitLevel, string> = {
  normal: "bg-[var(--pdm-grid)]",
  alert: "bg-health-watch",
  alarm: "bg-health-warning",
  trip: "bg-health-critical",
};
const STEP_MS = 1200;

export function TwinPage() {
  const { t } = useTranslation();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const navigate = useNavigate();
  const tz = usePreferences((p) => p.timeZone);
  const [playing, setPlaying] = useState(false);

  const sites = useApiQuery("sites.list", {});
  const siteId = search.site ?? sites.data?.items[0]?.id;
  const site = sites.data?.items.find((s) => s.id === siteId);
  const areas = useApiQuery("hierarchy.children", { nodeId: siteId ?? "" }, { enabled: siteId !== undefined });
  const areaList = areas.data?.items.filter((n) => n.level === "area") ?? [];
  const areaId = areaList.some((a) => a.id === search.area) ? search.area : areaList[0]?.id;
  const twin = useApiQuery(
    "twin.area",
    { areaId: areaId ?? "", hoursAgo: search.h },
    { enabled: areaId !== undefined, placeholderData: keepPreviousData, refetchInterval: search.h === 0 ? 30_000 : false },
  );

  const set = (patch: Partial<z.infer<typeof searchSchema>>) =>
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }), replace: true });

  useEffect(() => {
    document.title = `${t("modules.twin.name")} · ${t("app.name")}`;
  }, [t]);

  // Play: step forward an hour at a time. It stops by itself on reaching now (h = 0).
  const isPlaying = playing && search.h > 0;
  useEffect(() => {
    if (!isPlaying) return;
    const timer = setTimeout(() => set({ h: search.h - 1 }), STEP_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `set` is a fresh closure each render; the step depends only on h
  }, [isPlaying, search.h]);

  const formatTime = useMemo(() => makeTimeFormatter(tz, site?.timezone), [tz, site?.timezone]);
  const area = twin.data;
  const shownAt = area ? formatTime(Date.parse(area.t)) : "";
  const momentText = search.h === 0 ? t("twin.now", { time: shownAt }) : t("twin.hoursAgo", { count: search.h, time: shownAt });
  const activeHours = area?.hours.filter((hr) => hr.worst !== "normal").length ?? 0;
  const pastNow = area?.assets.filter((a) => a.limit !== "normal").length ?? 0;

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.twin.name")}</h1>
        <p className="text-fg-muted">{t("twin.intro")}</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <Select
          label={t("twin.site")}
          value={siteId ?? ""}
          options={(sites.data?.items ?? []).map((s) => ({ value: s.id, label: s.name }))}
          onChange={(v) => set({ site: v, area: undefined, focus: undefined })}
        />
        <Select
          label={t("twin.area")}
          value={areaId ?? ""}
          options={areaList.map((a) => ({ value: a.id, label: `${a.name} (${t(`health.${a.health}`)})` }))}
          onChange={(v) => set({ area: v, focus: undefined })}
        />
      </div>

      <section aria-labelledby="twin-time" className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="twin-time" className="font-semibold">
            {t("twin.timeTitle")}
          </h2>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                if (!isPlaying && search.h === 0) set({ h: TWIN_REPLAY_HOURS });
                setPlaying(!isPlaying);
              }}
              aria-pressed={isPlaying}
            >
              {isPlaying ? <Pause aria-hidden className="size-4" /> : <Play aria-hidden className="size-4" />}
              {t(isPlaying ? "twin.pause" : "twin.play")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={search.h === 0}
              onClick={() => {
                setPlaying(false);
                set({ h: 0 });
              }}
            >
              {t("twin.backToNow")}
            </Button>
          </div>
        </div>
        <label htmlFor="twin-slider" className="mt-2 block text-sm">
          {t("twin.moment")}: <span className="font-semibold">{momentText}</span>
        </label>
        <input
          id="twin-slider"
          type="range"
          min={0}
          max={TWIN_REPLAY_HOURS}
          step={1}
          value={TWIN_REPLAY_HOURS - search.h}
          aria-valuetext={momentText}
          onChange={(e) => {
            setPlaying(false);
            set({ h: TWIN_REPLAY_HOURS - Number(e.target.value) });
          }}
          className="mt-1 w-full accent-[var(--pdm-accent)]"
        />
        {area && (
          <>
            <div aria-hidden className="mt-1 flex h-3 gap-px">
              {area.hours.map((hr, i) => (
                <span
                  key={hr.t}
                  className={cx(
                    "flex-1 rounded-[1px]",
                    STRIP[hr.worst],
                    i === area.hours.length - 1 - search.h && "outline-2 outline-[var(--pdm-text-primary)]",
                  )}
                />
              ))}
            </div>
            <div aria-hidden className="mt-1 flex justify-between text-xs text-fg-muted">
              <span>{t("twin.windowStart", { hours: TWIN_REPLAY_HOURS })}</span>
              <span>{t("twin.nowShort")}</span>
            </div>
            <p className="mt-2 text-sm text-fg-muted">
              {t("twin.activity", { count: activeHours, hours: TWIN_REPLAY_HOURS })} {t("twin.stripLegend")}
            </p>
          </>
        )}
      </section>

      {!areaId || twin.isPending ? (
        <Skeleton className="h-96" />
      ) : !area ? (
        <p className="text-health-warning">{t("widget.failed")}</p>
      ) : (
        <section
          aria-labelledby="twin-area"
          className={cx("rounded-lg border border-line bg-surface p-4", twin.isPlaceholderData && "opacity-60")}
        >
          <h2 id="twin-area" className="font-semibold">
            {t("twin.areaTitle", { area: area.areaName, site: area.siteName })}
          </h2>
          <p className="mb-3 text-sm text-fg-muted">
            {t("twin.areaSummary", { count: area.assets.length, past: pastNow, time: momentText })} {t("twin.legend")}
          </p>
          <TwinView area={area} highlight={search.focus} />
        </section>
      )}
    </div>
  );
}
