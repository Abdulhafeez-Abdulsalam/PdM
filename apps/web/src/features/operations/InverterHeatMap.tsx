/**
 * Every inverter of a plant as a tile, grouped by block, shaded by how far it fell short of
 * what the sunlight should have given it over the last 24 hours. One hue, lighter → stronger
 * as the shortfall grows (a sequential scale: the shade means "how much", not "how bad a
 * status"). The number is printed in every tile, so the shade is never the only cue, and each
 * tile opens the inverter's Asset 360.
 *
 * The strongest shade stays at 60% so dark text (light themes) or light text (dark themes)
 * keeps its contrast on every tile.
 */
import { INVERTER_FLAG_PCT, type InverterTile } from "@pdm/contracts";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/** Shortfall buckets: [lowest performance %, tint %]. */
const BUCKETS: readonly (readonly [number, number])[] = [
  [98, 0],
  [95, 15],
  [90, 30],
  [80, 45],
  [-Infinity, 60],
];

const tintOf = (pct: number) => BUCKETS.find(([lo]) => pct >= lo)![1];
const shade = (tint: number) =>
  tint === 0 ? "var(--pdm-bg-surface)" : `color-mix(in oklab, var(--pdm-series-1) ${tint}%, var(--pdm-bg-surface))`;

export function InverterHeatMap({ tiles }: { tiles: readonly InverterTile[] }) {
  const { t } = useTranslation();
  const blocks = [...new Set(tiles.map((x) => x.areaName))];
  const legend = [
    t("solar.heat.bucket0"),
    t("solar.heat.bucket1"),
    t("solar.heat.bucket2"),
    t("solar.heat.bucket3"),
    t("solar.heat.bucket4"),
  ];
  return (
    <div className="flex flex-col gap-3">
      <ul aria-label={t("chart.legend")} className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
        {BUCKETS.map(([, tint], i) => (
          <li key={tint} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block size-3.5 rounded-sm border border-line" style={{ background: shade(tint) }} />
            {legend[i]}
          </li>
        ))}
        <li className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block size-3.5 rounded-sm border border-dashed border-line" />
          {t("solar.heat.noData")}
        </li>
      </ul>
      {blocks.map((block) => (
        <section key={block} aria-label={block}>
          <h3 className="mb-1 text-xs font-medium text-fg-muted">{block}</h3>
          <ul className="grid grid-cols-4 gap-1 sm:grid-cols-8">
            {tiles
              .filter((x) => x.areaName === block)
              .map((x) => {
                const flagged = x.performancePct !== null && x.performancePct < INVERTER_FLAG_PCT;
                return (
                  <li key={x.assetId}>
                    <Link
                      to="/assets/$assetId/$tab"
                      params={{ assetId: x.assetId, tab: "performance" }}
                      className={
                        "flex flex-col rounded border px-1.5 py-1 text-xs hover:outline-2 hover:outline-[var(--pdm-focus-ring)] " +
                        (x.performancePct === null ? "border-dashed border-line" : flagged ? "border-fg" : "border-line")
                      }
                      style={{ background: x.performancePct === null ? undefined : shade(tintOf(x.performancePct)) }}
                    >
                      {/* Short id on screen; screen readers hear the whole id and what the number means. */}
                      <span className="font-mono text-fg">
                        <span className="sr-only">{x.assetId.split("-").slice(0, -1).join("-")}-</span>
                        {x.assetId.split("-").at(-1)}
                      </span>
                      <span className="font-semibold text-fg tabular-nums">
                        {x.performancePct === null ? t("solar.heat.noDataShort") : `${x.performancePct.toFixed(1)} %`}
                        <span className="sr-only"> {t("solar.heat.ofExpected")}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}
