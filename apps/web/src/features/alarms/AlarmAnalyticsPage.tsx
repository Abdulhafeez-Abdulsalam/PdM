/**
 * Alarm system performance (spec IA: "/alarms/analytics — alarm KPIs, bad actors, floods"),
 * judged against ISA-18.2, the alarm management standard. Not "what's alarming now?" (that's
 * the alarm list) but "is our alarm system helping operators or drowning them?".
 *
 * Every measure is shown next to its ISA-18.2 target with a plain verdict (icon + word), and
 * the biggest problem sources are listed so someone can go and fix them.
 */
import { useApiQuery } from "@pdm/api-client";
import { AlarmPriority, CHATTER_COUNT, CHATTER_MINUTES, ISA_TARGETS, type AlarmAnalytics, type AlarmAnalyticsWindow } from "@pdm/contracts";
import { HealthBadge, KpiCard, PriorityIcon, Skeleton, cx, type Health } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { useGlobalSearch } from "../../shared/time-range";
import { AlarmsNav } from "./AlarmsNav";
import { RateChart } from "./RateChart";

const searchSchema = z.object({ window: z.enum(["24h", "7d"]).catch("24h") });

type Verdict = "good" | "watch" | "bad";
const VERDICT_LOOK: Record<Verdict, Health> = { good: "healthy", watch: "degraded", bad: "warning" };
const below = (value: number, limit: number): Verdict => (value <= limit ? "good" : "bad");
/** Alarm rate: up to 1 per 10 min is acceptable, up to 2 is manageable, more is overload. */
const rateVerdict = (perTen: number): Verdict =>
  perTen <= ISA_TARGETS.ratePer10MinAcceptable ? "good" : perTen <= ISA_TARGETS.ratePer10MinMax ? "watch" : "bad";

export function AlarmAnalyticsPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const navigate = useNavigate();
  const { window } = searchSchema.parse(useSearch({ strict: false }));
  const setWindow = (w: AlarmAnalyticsWindow) =>
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, window: w }) });
  const analytics = useApiQuery("alarms.analytics", { scopeId, window }, { placeholderData: keepPreviousData, refetchInterval: 60_000 });

  useEffect(() => {
    document.title = `${t("analytics.title")} · ${t("app.name")}`;
  }, [t]);

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{t("modules.alarms.name")}</h1>
          <p className="text-fg-muted">{t("analytics.intro")}</p>
        </div>
        <div role="tablist" aria-label={t("analytics.windowLabel")} className="flex rounded-md border border-line p-0.5">
          {(["24h", "7d"] as const).map((w) => (
            <button
              key={w}
              type="button"
              role="tab"
              aria-selected={window === w}
              onClick={() => setWindow(w)}
              className={cx("rounded px-3 py-1 text-sm", window === w ? "bg-sunken font-semibold" : "text-fg-muted hover:text-fg")}
            >
              {t(`analytics.window.${w}`)}
            </button>
          ))}
        </div>
      </header>
      <AlarmsNav />

      {analytics.isPending ? (
        <Skeleton className="h-96" />
      ) : analytics.isError ? (
        <p className="text-health-warning">{t("widget.failed")}</p>
      ) : (
        <div className={cx("flex flex-col gap-4 transition-opacity", analytics.isPlaceholderData && "opacity-60")}>
          <Headline a={analytics.data} />
          <Section title={t("analytics.rateTitle", { bucket: analytics.data.rate.bucketMinutes })} hint={t("analytics.rateHint")}>
            <RateChart
              points={analytics.data.rate.points}
              bucketMinutes={analytics.data.rate.bucketMinutes}
              label={t("analytics.rateTitle", { bucket: analytics.data.rate.bucketMinutes })}
            />
          </Section>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ControlRooms a={analytics.data} />
            <PriorityMix a={analytics.data} />
          </div>
          <BadActors a={analytics.data} />
        </div>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="rounded-lg border border-line bg-surface p-4">
      <h2 className="font-semibold">{title}</h2>
      {hint && <p className="mb-3 text-sm text-fg-muted">{hint}</p>}
      {children}
    </section>
  );
}

function VerdictBadge({ verdict, label }: { verdict: Verdict; label?: string }) {
  const { t } = useTranslation();
  return <HealthBadge state={VERDICT_LOOK[verdict]} label={label ?? t(`analytics.verdict.${verdict}`)} />;
}

/** The five ISA-18.2 measures that matter most, each against its target. */
function Headline({ a }: { a: AlarmAnalytics }) {
  const { t } = useTranslation();
  const worstRate = [...a.sites].sort((x, y) => y.averagePer10Min - x.averagePer10Min)[0];
  const worstFlood = [...a.sites].sort((x, y) => y.floodPercent - x.floodPercent)[0];
  const rate = worstRate?.averagePer10Min ?? 0;
  const flood = worstFlood?.floodPercent ?? 0;
  return (
    <section aria-label={t("analytics.headline")} className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <KpiCard
        label={t("analytics.kpi.rate")}
        value={rate.toFixed(2)}
        unit={t("analytics.per10Min")}
        target={t("analytics.target.rate", { ok: ISA_TARGETS.ratePer10MinAcceptable, max: ISA_TARGETS.ratePer10MinMax })}
        footer={
          <>
            <VerdictBadge verdict={rateVerdict(rate)} label={t(`analytics.rateVerdict.${rateVerdict(rate)}`)} />
            {worstRate && <span className="block text-xs text-fg-muted">{t("analytics.worst", { name: worstRate.siteName })}</span>}
          </>
        }
      />
      <KpiCard
        label={t("analytics.kpi.flood")}
        value={flood.toFixed(1)}
        unit="%"
        target={t("analytics.target.flood", { max: ISA_TARGETS.floodPercentMax, n: ISA_TARGETS.floodAlarmsPer10Min })}
        footer={
          <>
            <VerdictBadge verdict={below(flood, ISA_TARGETS.floodPercentMax)} />
            {worstFlood && flood > 0 && (
              <span className="block text-xs text-fg-muted">{t("analytics.worst", { name: worstFlood.siteName })}</span>
            )}
          </>
        }
      />
      <KpiCard
        label={t("analytics.kpi.top10")}
        value={a.top10SharePercent.toFixed(1)}
        unit="%"
        target={t("analytics.target.top10", { max: ISA_TARGETS.top10SharePercentMax })}
        footer={<VerdictBadge verdict={below(a.top10SharePercent, ISA_TARGETS.top10SharePercentMax)} />}
      />
      <KpiCard
        label={t("analytics.kpi.chattering")}
        value={String(a.chattering.length)}
        target={t("analytics.target.chattering", { count: CHATTER_COUNT, minutes: CHATTER_MINUTES })}
        footer={<VerdictBadge verdict={below(a.chattering.length, 0)} />}
      />
      <KpiCard
        label={t("analytics.kpi.standing")}
        value={String(a.standing)}
        target={t("analytics.target.standing", { max: ISA_TARGETS.standingMax })}
        footer={
          <>
            <VerdictBadge verdict={below(a.standing, ISA_TARGETS.standingMax)} />
            <span className="block text-xs text-fg-muted">
              {t("analytics.shelvedSuppressed", { shelved: a.shelved, suppressed: a.suppressed })}
            </span>
          </>
        }
      />
    </section>
  );
}

function ControlRooms({ a }: { a: AlarmAnalytics }) {
  const { t } = useTranslation();
  const sites = [...a.sites].sort((x, y) => y.averagePer10Min - x.averagePer10Min);
  return (
    <Section title={t("analytics.sitesTitle")} hint={t("analytics.sitesHint")}>
      <div className="relative -mx-4 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <caption className="sr-only">{t("analytics.sitesTitle")}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="px-4 py-2 font-medium">
                {t("analytics.col.site")}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t("analytics.col.alarms")}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t("analytics.col.per10Min")}
              </th>
              <th scope="col" className="py-2 pr-3 text-right font-medium">
                {t("analytics.col.peak")}
              </th>
              <th scope="col" className="px-4 py-2 text-right font-medium">
                {t("analytics.col.flood")}
              </th>
            </tr>
          </thead>
          <tbody>
            {sites.map((s) => (
              <tr key={s.siteId} className="border-b border-line last:border-0">
                <td className="px-4 py-2">
                  {s.siteName} <span className="font-mono text-xs text-fg-muted">{s.siteId}</span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{s.total}</td>
                <td className="py-2 pr-3 text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    <span className="tabular-nums">{s.averagePer10Min.toFixed(2)}</span>
                    <VerdictBadge
                      verdict={rateVerdict(s.averagePer10Min)}
                      label={t(`analytics.rateVerdict.${rateVerdict(s.averagePer10Min)}`)}
                    />
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{s.peakPer10Min}</td>
                <td className="px-4 py-2 text-right tabular-nums">{s.floodPercent.toFixed(1)} %</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

/** Actual share of each priority against ISA-18.2's recommended mix. */
function PriorityMix({ a }: { a: AlarmAnalytics }) {
  const { t } = useTranslation();
  return (
    <Section title={t("analytics.mixTitle")} hint={t("analytics.mixHint")}>
      <table className="w-full text-sm">
        <caption className="sr-only">{t("analytics.mixTitle")}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-muted">
            <th scope="col" className="py-2 pr-3 font-medium">
              {t("analytics.col.priority")}
            </th>
            <th scope="col" className="py-2 pr-3 text-right font-medium">
              {t("analytics.col.alarms")}
            </th>
            <th scope="col" className="w-1/2 py-2 pr-3 font-medium">
              {t("analytics.col.share")}
            </th>
            <th scope="col" className="py-2 text-right font-medium">
              {t("analytics.col.recommended")}
            </th>
          </tr>
        </thead>
        <tbody>
          {AlarmPriority.options.map((p) => {
            const share = a.total === 0 ? 0 : (a.priorities[p] / a.total) * 100;
            const recommended = ISA_TARGETS.priorityMix[p];
            return (
              <tr key={p} className="border-b border-line last:border-0">
                <td className="py-2 pr-3">
                  <span className="inline-flex items-center gap-1.5">
                    <PriorityIcon priority={p} />
                    {t(`alarms.priority.${p}`)}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums">{a.priorities[p]}</td>
                <td className="py-2 pr-3">
                  <span className="flex items-center gap-2">
                    {/* Bar = actual share; the thin upright line = the recommended share. */}
                    <span aria-hidden className="relative h-2 flex-1 rounded-full bg-sunken">
                      <span className="absolute inset-y-0 left-0 rounded-full bg-[var(--pdm-series-1)]" style={{ width: `${share}%` }} />
                      <span className="absolute -inset-y-1 w-0.5 bg-fg" style={{ left: `${recommended}%` }} />
                    </span>
                    <span className="w-14 shrink-0 text-right whitespace-nowrap tabular-nums">{share.toFixed(1)} %</span>
                  </span>
                </td>
                <td className="py-2 text-right text-fg-muted tabular-nums">{recommended} %</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

/** The 10 alarms that sound most: fixing these usually removes most of the noise. */
function BadActors({ a }: { a: AlarmAnalytics }) {
  const { t } = useTranslation();
  const chattering = new Map(a.chattering.map((c) => [c.key, c.episodes]));
  return (
    <Section title={t("analytics.badActorsTitle")} hint={t("analytics.badActorsHint", { share: a.top10SharePercent.toFixed(0) })}>
      {a.badActors.length === 0 ? (
        <p className="text-sm text-fg-muted">{t("analytics.noAlarms")}</p>
      ) : (
        <div className="relative -mx-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <caption className="sr-only">{t("analytics.badActorsTitle")}</caption>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t("analytics.col.rank")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("analytics.col.alarm")}
                </th>
                <th scope="col" className="py-2 pr-3 font-medium">
                  {t("assets.col.asset")}
                </th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">
                  {t("analytics.col.times")}
                </th>
                <th scope="col" className="w-1/4 py-2 pr-3 font-medium">
                  {t("analytics.col.shareOfAll")}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t("analytics.col.pattern")}
                </th>
              </tr>
            </thead>
            <tbody>
              {a.badActors.map((s, i) => (
                <tr key={s.key} className="border-b border-line last:border-0">
                  <td className="px-4 py-2 text-right text-fg-muted tabular-nums">{i + 1}</td>
                  <td className="py-2 pr-3">
                    <span className="inline-flex items-center gap-1.5">
                      <PriorityIcon priority={s.priority} />
                      {s.message}
                    </span>
                  </td>
                  <td className="py-2 pr-3">
                    <Link
                      to="/assets/$assetId/$tab"
                      params={{ assetId: s.assetId, tab: "alarms" }}
                      search={(prev) => prev}
                      className="font-mono text-xs hover:underline"
                    >
                      {s.assetId}
                    </Link>
                  </td>
                  <td className="py-2 pr-3 text-right tabular-nums">{s.count}</td>
                  <td className="py-2 pr-3">
                    <span className="flex items-center gap-2">
                      <span aria-hidden className="h-2 flex-1 rounded-full bg-sunken">
                        <span className="block h-full rounded-full bg-[var(--pdm-series-1)]" style={{ width: `${s.sharePercent}%` }} />
                      </span>
                      <span className="w-14 shrink-0 text-right whitespace-nowrap tabular-nums">{s.sharePercent.toFixed(1)} %</span>
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs">
                    {chattering.has(s.key) ? (
                      t("analytics.chatteringEpisodes", { count: chattering.get(s.key) })
                    ) : (
                      <span className="text-fg-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}
