/**
 * Data and integrations (Phase 4, chunk 7): "can we trust the data?" The overview shows the
 * systems feeding the platform and the last 24 hours' data quality (sites least complete first,
 * the worst tags); the tag browser lists every measured signal with its limits, latest value and
 * any quality issue. URL: /data/tags?issue=flatline opens the browser on one kind of issue.
 */
import { useApiQuery } from "@pdm/api-client";
import {
  DATA_QUALITY_HOURS,
  ENTERPRISE_SCOPE,
  ISSUE_THRESHOLD_PCT,
  SCAN_MINUTES,
  TagIssue,
  type DataSourceStatus,
  type TagRow,
} from "@pdm/contracts";
import { Button, Field, KpiCard, Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import type { TFunction } from "i18next";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { formatAgo, formatNumber } from "../../shared/format";
import { usePreferences, type UnitSystem } from "../../shared/preferences";
import { useSimNow } from "../../shared/sim-time";
import { globalSearchSchema, useGlobalSearch } from "../../shared/time-range";
import { formatMeasurement, toDisplay } from "../../shared/units";
import { SubNav } from "../../shared/widgets/SubNav";

const PAGE_SIZE = 50;
const pct = (v: number) => `${formatNumber(v, 1)} %`;

function DataHeader({ intro }: { intro: string }) {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = `${t("modules.data.name")} · ${t("app.name")}`;
  }, [t]);
  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.data.name")}</h1>
        <p className="text-fg-muted">{intro}</p>
      </header>
      <SubNav
        label={t("data.nav.label")}
        pages={[
          { to: "/data", label: t("data.nav.overview") },
          { to: "/data/tags", label: t("data.nav.tags") },
        ]}
      />
    </>
  );
}

const STATUS_ICON: Record<DataSourceStatus, typeof CheckCircle2> = {
  connected: CheckCircle2,
  degraded: AlertTriangle,
  disconnected: XCircle,
};
const STATUS_TONE: Record<DataSourceStatus, string> = {
  connected: "text-health-healthy",
  degraded: "font-medium text-health-warning",
  disconnected: "font-medium text-health-critical",
};

export function DataPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const { scope, range } = globalSearchSchema.parse(useSearch({ strict: false }));
  const { now } = useSimNow();
  const sources = useApiQuery("data.sources", {}, { refetchInterval: 30_000 });
  const quality = useApiQuery("data.quality", { scopeId }, { refetchInterval: 60_000, placeholderData: keepPreviousData });
  const q = quality.data;
  const issueLink = (issue: TagIssue) => (
    <Link to="/data/tags" search={{ scope, range, issue }} className="text-accent underline">
      {t(`data.issue.${issue}`)}
    </Link>
  );
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <DataHeader intro={t("data.intro")} />

      <section aria-labelledby="data-sources" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="data-sources" className="font-semibold">
          {t("data.sourcesTitle")}
        </h2>
        <p className="mb-3 text-sm text-fg-muted">{t("data.sourcesIntro")}</p>
        {!sources.data ? (
          <Skeleton className="h-40" />
        ) : (
          <div className="relative -mx-4 overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <caption className="sr-only">{t("data.sourcesTitle")}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th scope="col" className="px-4 py-1 font-medium">
                    {t("data.col.source")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("data.col.status")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("data.col.connection")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("data.col.lastSync")}
                  </th>
                  <th scope="col" className="py-1 pr-4 text-right font-medium">
                    {t("data.col.records", { hours: DATA_QUALITY_HOURS })}
                  </th>
                </tr>
              </thead>
              <tbody>
                {sources.data.items.map((s) => {
                  const Icon = STATUS_ICON[s.status];
                  return (
                    <tr key={s.id} className="border-b border-line align-top last:border-0">
                      <th scope="row" className="px-4 py-1.5 text-left font-normal">
                        {s.name}
                      </th>
                      <td className="py-1.5 pr-3">
                        <span className={cx("inline-flex items-center gap-1", STATUS_TONE[s.status])}>
                          <Icon aria-hidden className="size-3.5" />
                          {t(`data.status.${s.status}`)}
                        </span>
                        {s.problem && <span className="block text-xs text-fg-muted">{s.problem}</span>}
                      </td>
                      <td className="py-1.5 pr-3 text-fg-muted">{s.protocol}</td>
                      <td className="py-1.5 pr-3">{formatAgo(Date.parse(s.lastSync), now)}</td>
                      <td className="py-1.5 pr-4 text-right tabular-nums">
                        {formatNumber(s.records)} <span className="text-fg-muted">{s.recordKind}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {!q ? (
        <Skeleton className="h-96" />
      ) : (
        <div className={cx("flex flex-col gap-4", quality.isPlaceholderData && "opacity-60")}>
          <section aria-label={t("data.kpisLabel")} className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            <KpiCard
              label={t("data.kpi.completeness")}
              value={pct(q.totals.completenessPct)}
              lineage={t("data.kpi.completenessHow", { minutes: SCAN_MINUTES, hours: DATA_QUALITY_HOURS })}
            />
            <KpiCard
              label={t("data.kpi.good")}
              value={formatNumber(q.totals.good)}
              target={t("data.kpi.ofTags", { total: formatNumber(q.totals.tags) })}
            />
            <KpiCard label={t("data.issue.no_data")} value={formatNumber(q.totals.byIssue.no_data)} lineage={t("data.issueHow.no_data")} />
            <KpiCard
              label={t("data.issue.flatline")}
              value={formatNumber(q.totals.byIssue.flatline)}
              lineage={t("data.issueHow.flatline")}
            />
            <KpiCard
              label={t("data.kpi.gapsOrBad")}
              value={formatNumber(q.totals.byIssue.gaps + q.totals.byIssue.bad_quality)}
              lineage={t("data.kpi.gapsOrBadHow", { threshold: ISSUE_THRESHOLD_PCT })}
            />
          </section>
          <p className="text-sm text-fg-muted">
            {t("data.browseBy")} {issueLink("no_data")} · {issueLink("flatline")} · {issueLink("bad_quality")} · {issueLink("gaps")}
          </p>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section aria-labelledby="data-sites" className="rounded-lg border border-line bg-surface p-4">
              <h2 id="data-sites" className="font-semibold">
                {t("data.sitesTitle")}
              </h2>
              <p className="mb-3 text-sm text-fg-muted">{t("data.sitesIntro")}</p>
              <div className="relative -mx-4 overflow-x-auto">
                <table className="w-full min-w-[420px] text-sm">
                  <caption className="sr-only">{t("data.sitesTitle")}</caption>
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-fg-muted">
                      <th scope="col" className="px-4 py-1 font-medium">
                        {t("data.col.site")}
                      </th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">
                        {t("data.col.tags")}
                      </th>
                      <th scope="col" className="py-1 pr-3 text-right font-medium">
                        {t("data.col.completeness")}
                      </th>
                      <th scope="col" className="py-1 pr-4 text-right font-medium">
                        {t("data.col.issues")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {q.sites.map((s) => (
                      <tr key={s.siteId} className="border-b border-line last:border-0">
                        <th scope="row" className="px-4 py-1.5 text-left font-normal">
                          {s.siteName}
                        </th>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{formatNumber(s.tags)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{pct(s.completenessPct)}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">{formatNumber(s.issues)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section aria-labelledby="data-worst" className="rounded-lg border border-line bg-surface p-4">
              <h2 id="data-worst" className="font-semibold">
                {t("data.worstTitle")}
              </h2>
              <p className="mb-3 text-sm text-fg-muted">{t("data.worstIntro")}</p>
              {q.worst.length === 0 ? (
                <p className="text-sm text-fg-muted">{t("data.noIssues")}</p>
              ) : (
                <div className="relative -mx-4 max-h-[480px] overflow-auto">
                  <table className="w-full min-w-[520px] text-sm">
                    <caption className="sr-only">{t("data.worstTitle")}</caption>
                    <thead className="sticky top-0 bg-surface">
                      <tr className="border-b border-line text-left text-xs text-fg-muted">
                        <th scope="col" className="px-4 py-1 font-medium">
                          {t("data.col.tag")}
                        </th>
                        <th scope="col" className="py-1 pr-3 font-medium">
                          {t("data.col.issue")}
                        </th>
                        <th scope="col" className="py-1 pr-3 text-right font-medium">
                          {t("data.col.missing")}
                        </th>
                        <th scope="col" className="py-1 pr-4 text-right font-medium">
                          {t("data.col.bad")}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {q.worst.map((r) => (
                        <tr key={r.tagId} className="border-b border-line last:border-0">
                          <th scope="row" className="px-4 py-1.5 text-left font-normal">
                            <Link
                              to="/assets/$assetId/$tab"
                              params={{ assetId: r.assetId, tab: "telemetry" }}
                              className="font-mono text-accent underline"
                            >
                              {r.tagId}
                            </Link>
                          </th>
                          <td className="py-1.5 pr-3">{t(`data.issue.${r.issue}`)}</td>
                          <td className="py-1.5 pr-3 text-right tabular-nums">{pct(r.missingPct)}</td>
                          <td className="py-1.5 pr-4 text-right tabular-nums">{pct(r.badPct)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

/** "Alarm ≥ 95 °C · Trip ≥ 105 °C" in the user's units; "—" when the tag has no limits. */
function limitsText(row: TagRow, units: UnitSystem, t: TFunction): string {
  const show = (v: number) => {
    const d = toDisplay(v, row.quantity, units);
    return `${formatMeasurement(d.value)} ${t(`unitSymbol.${d.unit}`)}`.trim();
  };
  const parts = (
    [
      ["lowTrip", "≤"],
      ["lowAlarm", "≤"],
      ["highAlarm", "≥"],
      ["highTrip", "≥"],
    ] as const
  )
    .filter(([k]) => row.limits[k] !== undefined)
    .map(([k, sign]) => t(`data.limit.${k}`, { value: `${sign} ${show(row.limits[k]!)}` }));
  return parts.length ? parts.join(" · ") : "—";
}

export function TagsPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const units = usePreferences((p) => p.units);
  const { now } = useSimNow();
  const navigate = useNavigate();
  const issueParam = TagIssue.optional()
    .catch(undefined)
    .parse((useSearch({ strict: false }) as { issue?: unknown }).issue);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");

  // Wait until typing pauses before searching (debounce).
  useEffect(() => {
    const id = setTimeout(() => setSearch(text.trim()), 300);
    return () => clearTimeout(id);
  }, [text]);

  // The page number belongs to the filters it was chosen with; change a filter and it's page 1.
  const filterKey = JSON.stringify([search, issueParam, scopeId]);
  const [paging, setPaging] = useState({ filterKey, page: 0 });
  const page = paging.filterKey === filterKey ? paging.page : 0;

  const tags = useApiQuery(
    "data.tags",
    {
      scopeId: scopeId === ENTERPRISE_SCOPE ? undefined : scopeId,
      search: search || undefined,
      issue: issueParam,
      offset: page * PAGE_SIZE,
      limit: PAGE_SIZE,
    },
    { placeholderData: keepPreviousData },
  );
  const total = tags.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <DataHeader intro={t("data.tagsIntro")} />
      <div className="flex flex-wrap items-end gap-3">
        <Field label={t("data.search")}>
          {(p) => (
            <input
              {...p}
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-8 w-64 max-w-full rounded-md border border-line bg-surface px-2 text-sm"
            />
          )}
        </Field>
        <Select
          label={t("data.issueFilter")}
          value={issueParam ?? "all"}
          options={[
            { value: "all", label: t("data.anyIssue") },
            ...TagIssue.options.map((i) => ({ value: i, label: t(`data.issue.${i}`) })),
          ]}
          onChange={(v) =>
            void navigate({
              to: ".",
              search: (prev: Record<string, unknown>) => ({ ...prev, issue: v === "all" ? undefined : v }),
              replace: true,
            })
          }
        />
        <p aria-live="polite" className="text-sm text-fg-muted">
          {tags.data ? t("data.found", { count: total, formatted: formatNumber(total) }) : ""}
        </p>
      </div>

      <section
        aria-labelledby="data-tags"
        className={cx("rounded-lg border border-line bg-surface p-4", tags.isPlaceholderData && "opacity-60")}
      >
        <h2 id="data-tags" className="sr-only">
          {t("data.nav.tags")}
        </h2>
        {!tags.data ? (
          <Skeleton className="h-96" />
        ) : tags.data.items.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("data.noTags")}</p>
        ) : (
          <div className="relative -mx-4 overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <caption className="sr-only">{t("data.tagsCaption")}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th scope="col" className="px-4 py-1 font-medium">
                    {t("data.col.tag")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("data.col.asset")}
                  </th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">
                    {t("data.col.latest")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("data.col.quality")}
                  </th>
                  <th scope="col" className="py-1 pr-3 font-medium">
                    {t("data.col.limits")}
                  </th>
                  <th scope="col" className="py-1 pr-4 font-medium">
                    {t("data.col.issue")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {tags.data.items.map((row) => {
                  const latest = row.latest && toDisplay(row.latest.value, row.quantity, units);
                  return (
                    <tr key={row.id} className="border-b border-line align-top last:border-0">
                      <th scope="row" className="px-4 py-1.5 text-left font-normal">
                        <span className="font-mono">{row.id}</span>
                        <span className="block text-xs text-fg-muted">{row.description}</span>
                      </th>
                      <td className="py-1.5 pr-3">
                        <Link
                          to="/assets/$assetId/$tab"
                          params={{ assetId: row.assetId, tab: "telemetry" }}
                          className="font-mono text-accent underline"
                        >
                          {row.assetId}
                        </Link>
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {row.latest && latest ? (
                          <>
                            {formatMeasurement(latest.value)} {t(`unitSymbol.${latest.unit}`)}
                            <span className="block text-xs text-fg-muted">{formatAgo(Date.parse(row.latest.t), now)}</span>
                          </>
                        ) : (
                          <span className="text-fg-muted">{t("data.noReading")}</span>
                        )}
                      </td>
                      <td className="py-1.5 pr-3">{row.latest ? t(`telemetry.quality.${row.latest.quality}`) : "—"}</td>
                      <td className="py-1.5 pr-3 text-xs">{limitsText(row, units, t)}</td>
                      <td className="py-1.5 pr-4">
                        {row.issue ? (
                          <span className="inline-flex items-center gap-1 font-medium text-health-warning">
                            <AlertTriangle aria-hidden className="size-3.5" />
                            {t(`data.issue.${row.issue}`)}
                          </span>
                        ) : (
                          <span className="text-fg-muted">{t("data.noIssue")}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <nav aria-label={t("data.pagination")} className="mt-3 flex items-center justify-end gap-2 text-sm">
          <span className="text-fg-muted">{t("assets.page", { page: page + 1, pages })}</span>
          <Button
            size="sm"
            disabled={page === 0}
            onClick={() => setPaging({ filterKey, page: page - 1 })}
            aria-label={t("assets.previous")}
          >
            <ChevronLeft aria-hidden className="size-4" />
          </Button>
          <Button
            size="sm"
            disabled={page + 1 >= pages}
            onClick={() => setPaging({ filterKey, page: page + 1 })}
            aria-label={t("assets.next")}
          >
            <ChevronRight aria-hidden className="size-4" />
          </Button>
        </nav>
      </section>
    </div>
  );
}
