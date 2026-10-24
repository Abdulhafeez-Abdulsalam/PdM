/**
 * Draws one area of the digital twin at one moment, the way the area works:
 *   - process areas as a flow from left to right (supply → drive → process → power → grid), with
 *     the valves that protect them underneath;
 *   - solar blocks as inverters, each with the strings that feed it;
 *   - pipelines as a route by distance, then a table of every segment.
 * Every asset is a link to its Asset 360. Health shows as a coloured border *and* the health
 * word; anything past a limit gets a warning icon and says which sensor and how far.
 */
import {
  STAGE_OF,
  TWIN_STAGES,
  type HealthState,
  type TwinArea,
  type TwinAssetState,
  type TwinStage,
  type TwinValue,
} from "@pdm/contracts";
import { HealthBadge, cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ArrowDown, ArrowRight } from "lucide-react";
import { Fragment } from "react";
import { useTranslation } from "react-i18next";
import { usePreferences } from "../../shared/preferences";
import { formatMeasurement, toDisplay } from "../../shared/units";

const BORDER: Record<HealthState, string> = {
  healthy: "border-health-healthy",
  watch: "border-health-watch",
  degraded: "border-health-degraded",
  warning: "border-health-warning",
  critical: "border-health-critical",
  offline: "border-health-offline",
  maintenance: "border-health-maintenance",
};
const FILL: Record<HealthState, string> = {
  healthy: "bg-health-healthy",
  watch: "bg-health-watch",
  degraded: "bg-health-degraded",
  warning: "bg-health-warning",
  critical: "bg-health-critical",
  offline: "bg-health-offline",
  maintenance: "bg-health-maintenance",
};

function useFormatValue() {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  return (v: TwinValue) => {
    if (v.value === null) return "—";
    const d = toDisplay(v.value, v.quantity, units);
    return `${formatMeasurement(d.value)} ${t(`unitSymbol.${d.unit}`)}`;
  };
}

export function TwinView({ area, highlight }: { area: TwinArea; highlight?: string }) {
  if (area.kind === "solar") return <SolarView area={area} highlight={highlight} />;
  if (area.kind === "pipeline") return <PipelineView area={area} highlight={highlight} />;
  return <ProcessView area={area} highlight={highlight} />;
}

/** The line under an asset's name when something's wrong: which sensor is past which limit. */
function LimitNote({ a }: { a: TwinAssetState }) {
  const { t } = useTranslation();
  const format = useFormatValue();
  if (a.limit === "normal" || !a.limitTag) return null;
  return (
    <span className="mt-1 flex items-start gap-1 font-medium text-health-warning">
      <AlertTriangle aria-hidden className="mt-px size-3.5 shrink-0" />
      <span>
        {t(`twin.limit.${a.limit}`)}: {a.limitTag.description} {format(a.limitTag)}
      </span>
    </span>
  );
}

function AssetCard({ a, highlight, compact = false }: { a: TwinAssetState; highlight?: string; compact?: boolean }) {
  const { t } = useTranslation();
  const format = useFormatValue();
  const headline = a.values[0];
  return (
    <Link
      to="/assets/$assetId/$tab"
      params={{ assetId: a.assetId, tab: "overview" }}
      aria-current={a.assetId === highlight ? "true" : undefined}
      className={cx(
        "block rounded-md border-2 bg-surface p-2 text-xs hover:bg-raised",
        BORDER[a.health],
        a.assetId === highlight && "outline-2 outline-offset-2 outline-[var(--pdm-text-primary)]",
      )}
    >
      <span className="block font-mono font-semibold">{a.assetId}</span>
      {!compact && <span className="block text-fg-muted">{t(`assetClass.${a.assetClass}`)}</span>}
      <span className="mt-1 flex flex-wrap items-center gap-x-2">
        <HealthBadge state={a.health} label={t(`health.${a.health}`)} />
        {a.status !== "running" && <span className="text-fg-muted">{t(`operatingStatus.${a.status}`)}</span>}
      </span>
      {!compact && headline && (
        <span className="mt-1 block tabular-nums">
          <span className="text-fg-muted">{headline.description}:</span> {format(headline)}
        </span>
      )}
      <LimitNote a={a} />
    </Link>
  );
}

function ProcessView({ area, highlight }: { area: TwinArea; highlight?: string }) {
  const { t } = useTranslation();
  const byStage = new Map<TwinStage, TwinAssetState[]>();
  for (const a of area.assets) {
    const stage = STAGE_OF[a.assetClass];
    byStage.set(stage, [...(byStage.get(stage) ?? []), a]);
  }
  const flow = TWIN_STAGES.filter((s) => s !== "protection" && byStage.has(s));
  const protection = byStage.get("protection") ?? [];
  return (
    <div className="flex flex-col gap-4">
      <ol aria-label={t("twin.flowLabel", { name: area.areaName })} className="flex flex-col gap-2 lg:flex-row lg:items-stretch">
        {flow.map((stage, i) => (
          <Fragment key={stage}>
            {i > 0 && (
              <li aria-hidden className="flex items-center justify-center text-fg-muted">
                <ArrowDown className="size-5 lg:hidden" />
                <ArrowRight className="hidden size-5 lg:block" />
              </li>
            )}
            <li className="min-w-0 flex-1 rounded-lg border border-line bg-sunken p-2">
              <h3 className="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">{t(`twin.stage.${stage}`)}</h3>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-1">
                {byStage.get(stage)!.map((a) => (
                  <li key={a.assetId}>
                    <AssetCard a={a} highlight={highlight} />
                  </li>
                ))}
              </ul>
            </li>
          </Fragment>
        ))}
      </ol>
      {protection.length > 0 && (
        <section aria-labelledby="twin-protection">
          <h3 id="twin-protection" className="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            {t("twin.stage.protection")}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {protection.map((a) => (
              <li key={a.assetId}>
                <AssetCard a={a} highlight={highlight} compact />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function SolarView({ area, highlight }: { area: TwinArea; highlight?: string }) {
  const { t } = useTranslation();
  const format = useFormatValue();
  const inverters = area.assets.filter((a) => a.assetClass === "inverter");
  const strings = area.assets.filter((a) => a.assetClass === "pv_string").sort((x, y) => x.assetId.localeCompare(y.assetId));
  const others = area.assets.filter((a) => a.assetClass !== "inverter" && a.assetClass !== "pv_string");
  return (
    <div className="flex flex-col gap-4">
      <ul aria-label={t("twin.invertersLabel", { name: area.areaName })} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {inverters.map((inv) => (
          <li key={inv.assetId} className="flex flex-col gap-2 rounded-lg border border-line bg-sunken p-2">
            <AssetCard a={inv} highlight={highlight} />
            <ul aria-label={t("twin.stringsOf", { id: inv.assetId })} className="grid grid-cols-3 gap-1">
              {strings
                .filter((s) => s.parentAssetId === inv.assetId)
                .map((s) => {
                  const perf = s.values.find((v) => v.tag === "PERF_INDEX");
                  return (
                    <li key={s.assetId}>
                      <Link
                        to="/assets/$assetId/$tab"
                        params={{ assetId: s.assetId, tab: "overview" }}
                        aria-current={s.assetId === highlight ? "true" : undefined}
                        className={cx(
                          "block rounded border-2 bg-surface px-1 py-0.5 text-center text-[11px] leading-tight hover:bg-raised",
                          BORDER[s.health],
                          s.assetId === highlight && "outline-2 outline-offset-1 outline-[var(--pdm-text-primary)]",
                        )}
                      >
                        <span className="block font-mono">{s.assetId.replace(/^[A-Z]+-/, "")}</span>
                        <span className="block tabular-nums">{perf ? format(perf) : "—"}</span>
                        <span className="sr-only">
                          {t(`health.${s.health}`)}
                          {s.limit !== "normal" && `, ${t(`twin.limit.${s.limit}`)}`}
                        </span>
                        {s.limit !== "normal" && <AlertTriangle aria-hidden className="mx-auto size-3 text-health-warning" />}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </li>
        ))}
      </ul>
      <p className="text-xs text-fg-muted">{t("twin.stringsNote")}</p>
      {others.length > 0 && (
        <section aria-labelledby="twin-solar-others">
          <h3 id="twin-solar-others" className="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            {t("twin.solarOthers")}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {others.map((a) => (
              <li key={a.assetId}>
                <AssetCard a={a} highlight={highlight} compact />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function PipelineView({ area, highlight }: { area: TwinArea; highlight?: string }) {
  const { t } = useTranslation();
  const format = useFormatValue();
  const segments = area.assets.filter((a) => a.fromKm !== null).sort((x, y) => x.fromKm! - y.fromKm!);
  const others = area.assets.filter((a) => a.fromKm === null);
  const length = segments.at(-1)?.toKm ?? 0;
  const value = (a: TwinAssetState, tag: string) => {
    const v = a.values.find((x) => x.tag === tag);
    return v ? format(v) : "—";
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="pt-5">
        <ol aria-label={t("twin.routeLabel", { name: area.areaName, km: length })} className="flex h-10 gap-0.5">
          {segments.map((s) => (
            <li key={s.assetId} style={{ flexGrow: s.toKm! - s.fromKm! }} className="relative min-w-0 basis-0">
              <Link
                to="/assets/$assetId/$tab"
                params={{ assetId: s.assetId, tab: "overview" }}
                aria-current={s.assetId === highlight ? "true" : undefined}
                className={cx(
                  "block h-full rounded-sm opacity-80 hover:opacity-100",
                  FILL[s.health],
                  s.assetId === highlight && "outline-2 outline-offset-2 outline-[var(--pdm-text-primary)]",
                )}
              >
                <span className="sr-only">
                  {t("twin.segment", { id: s.assetId, from: s.fromKm, to: s.toKm, health: t(`health.${s.health}`) })}
                  {s.limit !== "normal" && `, ${t(`twin.limit.${s.limit}`)}`}
                </span>
              </Link>
              {s.limit !== "normal" && (
                <AlertTriangle aria-hidden className="absolute -top-5 left-1/2 size-4 -translate-x-1/2 text-health-warning" />
              )}
            </li>
          ))}
        </ol>
        <div aria-hidden className="mt-1 flex justify-between text-xs text-fg-muted">
          <span>{t("twin.km", { km: 0 })}</span>
          <span>{t("twin.km", { km: Math.round(length / 2) })}</span>
          <span>{t("twin.km", { km: length })}</span>
        </div>
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <caption className="sr-only">{t("twin.segmentsCaption", { name: area.areaName })}</caption>
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <th scope="col" className="py-1 font-medium">
                {t("twin.col.segment")}
              </th>
              <th scope="col" className="py-1 font-medium">
                {t("twin.col.km")}
              </th>
              <th scope="col" className="py-1 font-medium">
                {t("twin.col.health")}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {t("twin.col.wall")}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {t("twin.col.corrosion")}
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                {t("twin.col.pressure")}
              </th>
            </tr>
          </thead>
          <tbody>
            {segments.map((s) => (
              <tr key={s.assetId} className={cx("border-b border-line last:border-0", s.assetId === highlight && "bg-sunken")}>
                <th scope="row" className="py-1 text-left font-normal">
                  <Link
                    to="/assets/$assetId/$tab"
                    params={{ assetId: s.assetId, tab: "overview" }}
                    className="font-mono text-accent underline"
                  >
                    {s.assetId}
                  </Link>
                </th>
                <td className="py-1 tabular-nums">
                  {s.fromKm}–{s.toKm}
                </td>
                <td className="py-1">
                  <HealthBadge state={s.health} label={t(`health.${s.health}`)} />
                  <LimitNote a={s} />
                </td>
                <td className="py-1 text-right tabular-nums">{value(s, "WALL_THK")}</td>
                <td className="py-1 text-right tabular-nums">{value(s, "CORR_RATE")}</td>
                <td className="py-1 text-right tabular-nums">{value(s, "INLET_P")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {others.length > 0 && (
        <section aria-labelledby="twin-line-valves">
          <h3 id="twin-line-valves" className="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">
            {t("twin.stage.protection")}
          </h3>
          <ul className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {others.map((a) => (
              <li key={a.assetId}>
                <AssetCard a={a} highlight={highlight} compact />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
