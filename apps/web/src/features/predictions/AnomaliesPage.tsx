/**
 * Fleet anomaly view (spec §6.4: "anomaly detection views … contribution analysis (which
 * sensors drove the anomaly)"). For the Condition Monitoring Analyst's question: "Which
 * signals look abnormal?"
 *
 * Every asset in scope with its anomaly score now, its last 24 hours, and the sensors driving
 * it. "Rising" assets are the early warning: below the line, but climbing, before any
 * prediction exists.
 */
import { useApiQuery } from "@pdm/api-client";
import { AnomalyState, type AnomalySummary } from "@pdm/contracts";
import { HealthBadge, Select, Skeleton, cx, type Health } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatAgo } from "../../shared/format";
import { useSimNow } from "../../shared/sim-time";
import { useGlobalSearch } from "../../shared/time-range";
import { DashboardWidget } from "../../shared/widgets/DashboardWidget";
import { PredictiveNav } from "./PredictiveNav";

/** Each state's look, borrowed from the health scale so colours mean the same everywhere. */
const LOOK: Record<AnomalyState, Health> = { anomalous: "warning", rising: "degraded", normal: "healthy", no_data: "offline" };
const DEFAULT_STATES: AnomalyState[] = ["anomalous", "rising"];

const searchSchema = z.object({
  state: z
    .string()
    .optional()
    .transform((s) => (s === undefined ? DEFAULT_STATES : s.split(",").filter((x): x is AnomalyState => AnomalyState.safeParse(x).success)))
    .catch(DEFAULT_STATES),
  sort: z.enum(["score", "rise"]).catch("score"),
  q: z.string().max(100).optional().catch(undefined),
});

export function AnomaliesPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const navigate = useNavigate();
  const search = searchSchema.parse(useSearch({ strict: false }));
  const set = (patch: Record<string, string | undefined>) =>
    void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, ...patch }), replace: true });
  const [text, setText] = useState(search.q ?? "");

  const fleet = useApiQuery(
    "anomalies.fleet",
    // An empty list really means "none": switching every group off shows nothing, not everything.
    { scopeId, state: search.state, search: search.q, sort: search.sort, limit: 200 },
    { placeholderData: keepPreviousData, refetchInterval: 60_000 },
  );

  useEffect(() => {
    document.title = `${t("anomalies.title")} · ${t("app.name")}`;
  }, [t]);

  const toggle = (state: AnomalyState) => {
    const next = search.state.includes(state) ? search.state.filter((s) => s !== state) : [...search.state, state];
    set({ state: next.join(",") });
  };
  const items = fleet.data?.items ?? [];

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.predictive.name")}</h1>
        <p className="text-fg-muted">{t("anomalies.intro")}</p>
      </header>
      <PredictiveNav />

      {/* The counts double as filters: press one to show or hide that group. */}
      <div role="group" aria-label={t("anomalies.filterLabel")} className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {AnomalyState.options.map((state) => {
          const on = search.state.includes(state);
          return (
            <button
              key={state}
              type="button"
              aria-pressed={on}
              onClick={() => toggle(state)}
              className={cx(
                "flex flex-col items-start gap-1 rounded-lg border p-3 text-left",
                on ? "border-accent bg-surface ring-1 ring-accent" : "border-line bg-sunken text-fg-muted hover:bg-surface",
              )}
            >
              <HealthBadge state={LOOK[state]} label={t(`anomalies.state.${state}`)} />
              <span className="text-2xl font-semibold text-fg tabular-nums">{fleet.data ? fleet.data.counts[state] : "…"}</span>
              <span className="text-xs">{t(`anomalies.stateHint.${state}`)}</span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            set({ q: text.trim() || undefined });
          }}
          className="flex items-end gap-2"
        >
          <label className="flex flex-col gap-1 text-sm">
            {t("anomalies.search")}
            <input
              type="search"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onBlur={() => set({ q: text.trim() || undefined })}
              className="h-9 w-64 rounded-md border border-line bg-surface px-2"
            />
          </label>
        </form>
        <Select
          label={t("anomalies.sortLabel")}
          value={search.sort}
          options={[
            { value: "score", label: t("anomalies.sort.score") },
            { value: "rise", label: t("anomalies.sort.rise") },
          ]}
          onChange={(v) => set({ sort: v })}
        />
      </div>

      <DashboardWidget
        title={t("anomalies.count", { count: fleet.data?.total ?? 0 })}
        query={fleet}
        isEmpty={items.length === 0}
        emptyText={t(search.state.length === 0 ? "anomalies.pickAState" : "anomalies.empty")}
      >
        {fleet.isPending ? (
          <Skeleton className="h-64" />
        ) : (
          <div className={cx("-mx-4 overflow-x-auto transition-opacity", fleet.isPlaceholderData && "opacity-60")}>
            <table className="w-full min-w-[1000px] text-sm">
              <caption className="sr-only">{t("anomalies.caption")}</caption>
              <thead>
                <tr className="border-b border-line text-left text-xs text-fg-muted">
                  <th scope="col" className="px-4 py-2 font-medium">
                    {t("assets.col.asset")}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t("anomalies.col.state")}
                  </th>
                  <th scope="col" className="py-2 pr-3 text-right font-medium">
                    {t("anomalies.col.score")}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t("anomalies.col.trend")}
                  </th>
                  <th scope="col" className="py-2 pr-3 font-medium">
                    {t("anomalies.col.drivers")}
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    {t("anomalies.col.prediction")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((row) => (
                  <Row key={row.assetId} row={row} />
                ))}
              </tbody>
            </table>
            {fleet.data && fleet.data.total > items.length && (
              <p className="px-4 pt-3 text-sm text-fg-muted">
                {t("anomalies.showingFirst", { shown: items.length, total: fleet.data.total })}
              </p>
            )}
          </div>
        )}
      </DashboardWidget>
    </div>
  );
}

function Row({ row }: { row: AnomalySummary }) {
  const { t } = useTranslation();
  const { now } = useSimNow();
  const change = row.score !== null && row.scoreDayAgo !== null ? row.score - row.scoreDayAgo : null;
  return (
    <tr className="border-b border-line align-top last:border-0">
      <td className="px-4 py-2">
        <Link to="/assets/$assetId" params={{ assetId: row.assetId }} search={(prev) => prev} className="font-medium hover:underline">
          {row.assetName}
        </Link>
        <span className="block font-mono text-xs text-fg-muted">
          {row.assetId} · {t(`assetClass.${row.assetClass}`)}
        </span>
      </td>
      <td className="py-2 pr-3">
        <HealthBadge state={LOOK[row.state]} label={t(`anomalies.state.${row.state}`)} />
        {row.aboveSince && (
          <span className="block text-xs text-fg-muted">{t("anomalies.since", { ago: formatAgo(Date.parse(row.aboveSince), now) })}</span>
        )}
      </td>
      <td className="py-2 pr-3 text-right tabular-nums">
        {row.score === null ? "—" : row.score.toFixed(2)}
        {change !== null && Math.abs(change) >= 0.005 && (
          <span className={cx("block text-xs", change > 0 ? "text-fg" : "text-fg-muted")}>
            {t("anomalies.change", { change: `${change > 0 ? "+" : "−"}${Math.abs(change).toFixed(2)}` })}
          </span>
        )}
      </td>
      <td className="py-2 pr-3">
        <Trend values={row.trend} threshold={row.threshold} />
      </td>
      <td className="py-2 pr-3">
        {row.contributions.length === 0 ? (
          <span className="text-fg-muted">{t("anomalies.nothingStandsOut")}</span>
        ) : (
          <ul className="flex flex-col gap-0.5">
            {row.contributions.slice(0, 3).map((c) => (
              <li key={c.tagId} className="flex items-center gap-2">
                {/* A bar for the share, plus the number: never the bar alone. */}
                <span aria-hidden className="h-1.5 w-12 shrink-0 overflow-hidden rounded-full bg-sunken">
                  <span className="block h-full bg-fg-muted" style={{ width: `${Math.round(Math.abs(c.weight) * 100)}%` }} />
                </span>
                <span className="w-9 shrink-0 text-right text-xs tabular-nums">{Math.round(Math.abs(c.weight) * 100)}%</span>
                <span className="truncate">{c.label}</span>
              </li>
            ))}
          </ul>
        )}
      </td>
      <td className="px-4 py-2">
        {row.predictionId ? (
          <Link
            to="/predictive/$predictionId"
            params={{ predictionId: row.predictionId }}
            search={(prev) => prev}
            className="text-accent hover:underline"
          >
            {row.predictionId}
          </Link>
        ) : row.state === "anomalous" ? (
          <span className="text-xs">{t("anomalies.noPredictionYet")}</span>
        ) : (
          <span className="text-fg-muted">—</span>
        )}
      </td>
    </tr>
  );
}

/**
 * The last 24 hours on a fixed 0–1 scale with the threshold dashed, so a flat line near zero
 * looks calm and a climb looks like a climb. Decorative: the score and its change beside it
 * carry the meaning.
 */
function Trend({
  values,
  threshold,
  width = 120,
  height = 32,
}: {
  values: readonly (number | null)[];
  threshold: number;
  width?: number;
  height?: number;
}) {
  const y = (v: number) => 2 + (1 - v) * (height - 4);
  const x = (i: number) => (i / Math.max(1, values.length - 1)) * width;
  // Break the line where there's no data, rather than drawing through the gap.
  const segments: string[] = [];
  let current: string[] = [];
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length > 1) segments.push(current.join(" "));
      current = [];
    } else current.push(`${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  });
  if (current.length > 1) segments.push(current.join(" "));
  return (
    <svg aria-hidden width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="text-fg-muted">
      <line
        x1={0}
        x2={width}
        y1={y(threshold)}
        y2={y(threshold)}
        stroke="var(--pdm-health-warning)"
        strokeDasharray="3 3"
        strokeWidth={1}
      />
      {segments.map((points) => (
        <polyline key={points} points={points} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" />
      ))}
    </svg>
  );
}
