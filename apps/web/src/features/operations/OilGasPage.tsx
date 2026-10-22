/**
 * Oil & gas operations (spec §6.3), one tab per part of the industry:
 *
 *   Upstream    the wells: production against the decline curve, and the pumps lifting the oil
 *   Midstream   the pipeline: wall thickness and corrosion along the route; compressor stations
 *   Downstream  the refinery: exchanger fouling, and every inspection the codes require
 *
 * The cards at the top summarise all three and switch between them.
 */
import { useApiQuery } from "@pdm/api-client";
import {
  CP_CRITERION_V,
  EXCHANGER_CLEAN_PCT,
  OilGasSegment,
  type DownstreamView,
  type MidstreamView,
  type OilGasSummary,
  type UpstreamView,
} from "@pdm/contracts";
import { Skeleton, Sparkline, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { Link, useSearch } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";
import { formatDate, formatNumber } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { useGlobalSearch } from "../../shared/time-range";
import { LineChart } from "../../shared/widgets/LineChart";
import { AssetLink, DeclineChart, Flagged, ScrollTable, Th } from "./oil-gas-parts";
import { OperationsNav } from "./OperationsNav";
import { formatIn } from "./power-format";

const searchSchema = z.object({ part: OilGasSegment.catch("upstream").default("upstream") });

export function OilGasPage() {
  const { t } = useTranslation();
  const { scopeId } = useGlobalSearch();
  const { part } = searchSchema.parse(useSearch({ strict: false }));
  const data = useApiQuery("operations.oilGas", { scopeId, segment: part }, { placeholderData: keepPreviousData, refetchInterval: 60_000 });

  useEffect(() => {
    document.title = `${t("oilGas.title")} · ${t("app.name")}`;
  }, [t]);

  const r = data.data;
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold">{t("oilGas.title")}</h1>
        <p className="text-fg-muted">{t("oilGas.intro")}</p>
      </header>
      <OperationsNav />
      {data.isPending ? (
        <Skeleton className="h-96" />
      ) : data.isError || !r ? (
        <p className="text-health-warning">{t("widget.failed")}</p>
      ) : (
        <div className={cx("flex flex-col gap-4 transition-opacity", data.isPlaceholderData && "opacity-60")}>
          <PartCards summary={r.summary} current={part} />
          {r.view.segment === "upstream" && <Upstream v={r.view} />}
          {r.view.segment === "midstream" && <Midstream v={r.view} />}
          {r.view.segment === "downstream" && <Downstream v={r.view} />}
        </div>
      )}
    </div>
  );
}

function PartCards({ summary: s, current }: { summary: OilGasSummary; current: OilGasSegment }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  const lines: Record<OilGasSegment, string[]> = {
    upstream: [
      t("oilGas.card.oil", { value: formatIn(s.upstream.oilRate, "liquid_flow", units, t) }),
      t("oilGas.card.wells", { producing: s.upstream.wellsProducing, total: s.upstream.wellsTotal }),
    ],
    midstream: [t("oilGas.card.segments", { count: s.midstream.segments })],
    downstream: [t("oilGas.card.downstream")],
  };
  const flags: Record<OilGasSegment, string[]> = {
    upstream: s.upstream.espsFlagged ? [t("oilGas.card.espsFlagged", { count: s.upstream.espsFlagged })] : [],
    midstream: [
      ...(s.midstream.segmentsFlagged ? [t("oilGas.card.segmentsFlagged", { count: s.midstream.segmentsFlagged })] : []),
      ...(s.midstream.compressorsFlagged ? [t("oilGas.card.compressorsFlagged", { count: s.midstream.compressorsFlagged })] : []),
    ],
    downstream: [
      ...(s.downstream.exchangersToClean ? [t("oilGas.card.exchangersToClean", { count: s.downstream.exchangersToClean })] : []),
      ...(s.downstream.inspectionsDue ? [t("oilGas.card.inspectionsDue", { count: s.downstream.inspectionsDue })] : []),
    ],
  };
  return (
    <nav aria-label={t("oilGas.partsLabel")}>
      <ul className="grid gap-3 md:grid-cols-3">
        {OilGasSegment.options.map((p) => (
          <li key={p}>
            <Link
              to="."
              search={(prev: Record<string, unknown>) => ({ ...prev, part: p })}
              replace
              aria-current={p === current ? "page" : undefined}
              className={cx(
                "flex h-full flex-col gap-1 rounded-lg border bg-surface p-3 hover:bg-sunken",
                p === current ? "border-accent ring-1 ring-accent" : "border-line",
              )}
            >
              <span className="font-semibold">{t(`oilGas.part.${p}`)}</span>
              <span className="text-xs text-fg-muted">{t(`oilGas.partWhat.${p}`)}</span>
              {lines[p].map((l) => (
                <span key={l} className="text-sm">
                  {l}
                </span>
              ))}
              {flags[p].map((f) => (
                <span key={f} className="flex items-center gap-1 text-xs">
                  <AlertTriangle aria-hidden className="size-3.5 text-health-warning" />
                  {f}
                </span>
              ))}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

// ─── Upstream ────────────────────────────────────────────────────────────────

function Upstream({ v }: { v: UpstreamView }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  const flow = (x: number | null) => (x === null ? "—" : formatIn(x, "liquid_flow", units, t, 1));
  return (
    <>
      <section aria-labelledby="og-decline" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="og-decline" className="font-semibold">
          {t("oilGas.up.declineTitle")}
        </h2>
        <p className="mb-2 text-sm text-fg-muted">{t("oilGas.up.declineIntro")}</p>
        <dl className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <div>
            <dt className="text-xs text-fg-muted">{t("oilGas.up.oilNow")}</dt>
            <dd className="font-semibold tabular-nums">{flow(v.oilRate)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">{t("oilGas.up.gasNow")}</dt>
            <dd className="font-semibold tabular-nums">{formatIn(v.gasRate, "gas_flow", units, t)}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">{t("oilGas.up.waterCut")}</dt>
            <dd className="font-semibold tabular-nums">{v.waterCutPct === null ? "—" : `${v.waterCutPct.toFixed(1)} %`}</dd>
          </div>
          <div>
            <dt className="text-xs text-fg-muted">{t("oilGas.up.lost")}</dt>
            <dd className="font-semibold tabular-nums">{flow(v.lostOilRate)}</dd>
          </div>
        </dl>
        <DeclineChart production={v.production} fit={v.fit} label={t("oilGas.up.declineLabel")} />
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section aria-labelledby="og-esps" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="og-esps" className="font-semibold">
            {t("oilGas.up.espTitle")}
          </h2>
          <p className="mb-2 text-sm text-fg-muted">{t("oilGas.up.espIntro")}</p>
          <ScrollTable label={t("oilGas.up.espTitle")}>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <Th>{t("oilGas.col.pump")}</Th>
                <Th>{t("oilGas.col.diagnosis")}</Th>
                <Th right>{t("oilGas.col.motorTemp")}</Th>
                <Th right>{t("oilGas.col.amps")}</Th>
                <Th right>{t("oilGas.col.intake")}</Th>
              </tr>
            </thead>
            <tbody>
              {v.esps.map((e) => (
                <tr key={e.assetId} className="border-b border-line last:border-0">
                  <td className="py-1 pr-3">
                    <AssetLink id={e.assetId} />
                    {e.wellId && <span className="block text-xs text-fg-muted">{t("oilGas.up.liftsWell", { id: e.wellId })}</span>}
                  </td>
                  <td className="py-1 pr-3">
                    <Flagged on={e.diagnosis !== "normal"}>{t(`oilGas.diagnosis.${e.diagnosis}`)}</Flagged>
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {e.motorTemp === null ? "—" : formatIn(e.motorTemp, "temperature", units, t)}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{e.motorAmps === null ? "—" : `${formatNumber(e.motorAmps)} A`}</td>
                  <td className="py-1 text-right tabular-nums">
                    {e.intakePressure === null ? "—" : formatIn(e.intakePressure, "pressure", units, t, 1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </section>

        <section aria-labelledby="og-wells" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="og-wells" className="font-semibold">
            {t("oilGas.up.wellsTitle")}
          </h2>
          <p className="mb-2 text-sm text-fg-muted">{t("oilGas.up.wellsIntro")}</p>
          <ScrollTable label={t("oilGas.up.wellsTitle")}>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <Th>{t("oilGas.col.well")}</Th>
                <Th right>{t("oilGas.col.oil")}</Th>
                <Th right>{t("oilGas.col.lost")}</Th>
                <Th right>{t("oilGas.col.waterCut")}</Th>
                <Th right>{t("oilGas.col.decline")}</Th>
              </tr>
            </thead>
            <tbody>
              {v.wells.map((w) => (
                <tr key={w.assetId} className="border-b border-line last:border-0">
                  <td className="py-1 pr-3">
                    <AssetLink id={w.assetId} />
                    <span className="block text-xs text-fg-muted">
                      {t(`oilGas.lift.${w.liftType}`)}
                      {w.liftAssetId ? ` · ${w.liftAssetId}` : ""}
                    </span>
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{flow(w.oilRate)}</td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    <Flagged on={w.lostOilRate > 0.5}>{w.lostOilRate > 0.05 ? flow(w.lostOilRate) : "—"}</Flagged>
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{w.waterCutPct === null ? "—" : `${w.waterCutPct.toFixed(0)} %`}</td>
                  <td className="py-1 text-right tabular-nums">{t("oilGas.perYear", { pct: w.declinePctPerYear.toFixed(0) })}</td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        </section>
      </div>
    </>
  );
}

// ─── Midstream ───────────────────────────────────────────────────────────────

function Midstream({ v }: { v: MidstreamView }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  const mid = v.pipelines.map((p) => (p.kmFrom + p.kmTo) / 2);
  const flagged = v.pipelines.filter((p) => p.integrity && p.integrity.status !== "ok");
  const thinnest = [...v.pipelines].sort((a, b) => (a.integrity?.wallMm ?? 99) - (b.integrity?.wallMm ?? 99))[0];
  const summary = t("oilGas.mid.profileSummary", {
    count: v.pipelines.length,
    thinnest: thinnest ? `${thinnest.assetId} (${thinnest.integrity?.wallMm.toFixed(1)} mm)` : "—",
    required: v.requiredWallMm.toFixed(1),
  });
  return (
    <>
      <section aria-labelledby="og-profile" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="og-profile" className="font-semibold">
          {t("oilGas.mid.profileTitle")}
        </h2>
        <p className="mb-2 text-sm text-fg-muted">{t("oilGas.mid.profileIntro", { required: v.requiredWallMm.toFixed(1) })}</p>
        {v.throughput !== null && (
          <p className="mb-2 text-sm">{t("oilGas.mid.throughput", { value: formatIn(v.throughput, "gas_flow", units, t) })}</p>
        )}
        <LineChart
          times={mid}
          series={[
            {
              id: "wall",
              label: t("oilGas.mid.wall"),
              values: v.pipelines.map((p) => p.integrity?.wallMm ?? null),
              color: "var(--pdm-series-1)",
            },
          ]}
          label={t("oilGas.mid.profileLabel")}
          summary={summary}
          format={(mm) => `${formatNumber(mm, 1)} mm`}
          formatTime={(km) => t("oilGas.mid.km", { km })}
          formatTick={(km) => `${Math.round(km)} km`}
          thresholds={[{ value: v.requiredWallMm, label: t("oilGas.mid.requiredLine") }]}
          markers={flagged.map((p) => ({ t: (p.kmFrom + p.kmTo) / 2, label: p.assetId }))}
          includeZero
        />
      </section>

      <section aria-labelledby="og-pipes" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="og-pipes" className="font-semibold">
          {t("oilGas.mid.segmentsTitle")}
        </h2>
        <p className="mb-2 text-sm text-fg-muted">{t("oilGas.mid.segmentsIntro", { cp: CP_CRITERION_V })}</p>
        <ScrollTable label={t("oilGas.mid.segmentsTitle")} minWidth={760}>
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <Th>{t("oilGas.col.segment")}</Th>
              <Th right>{t("oilGas.col.wall")}</Th>
              <Th right>{t("oilGas.col.rates")}</Th>
              <Th right>{t("oilGas.col.life")}</Th>
              <Th right>{t("oilGas.col.cp")}</Th>
              <Th>{t("oilGas.col.status")}</Th>
            </tr>
          </thead>
          <tbody>
            {[...v.pipelines]
              .sort((a, b) => (a.integrity?.remainingLifeYears ?? 999) - (b.integrity?.remainingLifeYears ?? 999))
              .map((p) => (
                <tr key={p.assetId} className="border-b border-line last:border-0">
                  <td className="py-1 pr-3">
                    <AssetLink id={p.assetId} />
                    <span className="block text-xs text-fg-muted">
                      {p.sectionName} · {t("oilGas.mid.kmRange", { from: p.kmFrom, to: p.kmTo })}
                    </span>
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">{p.integrity ? `${p.integrity.wallMm.toFixed(2)} mm` : "—"}</td>
                  <td className="py-1 pr-3 text-right text-xs tabular-nums">
                    {p.integrity
                      ? t("oilGas.mid.rates", {
                          long: p.integrity.longTermRate.toFixed(3),
                          short: p.integrity.shortTermRate?.toFixed(3) ?? "—",
                        })
                      : "—"}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    {p.integrity?.remainingLifeYears == null
                      ? "—"
                      : t("oilGas.years", { value: p.integrity.remainingLifeYears.toFixed(0) })}
                  </td>
                  <td className="py-1 pr-3 text-right tabular-nums">
                    <Flagged on={p.cpOk === false}>{p.cpPotentialV === null ? "—" : `−${p.cpPotentialV.toFixed(2)} V`}</Flagged>
                  </td>
                  <td className="py-1">
                    <Flagged on={p.integrity?.status !== "ok"}>{p.integrity ? t(`oilGas.integrity.${p.integrity.status}`) : "—"}</Flagged>
                  </td>
                </tr>
              ))}
          </tbody>
        </ScrollTable>
      </section>

      <section aria-labelledby="og-comp" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="og-comp" className="font-semibold">
          {t("oilGas.mid.compressorsTitle")}
        </h2>
        <p className="mb-2 text-sm text-fg-muted">{t("oilGas.mid.compressorsIntro")}</p>
        <ScrollTable label={t("oilGas.mid.compressorsTitle")}>
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <Th>{t("oilGas.col.compressor")}</Th>
              <Th right>{t("oilGas.col.flow")}</Th>
              <Th right>{t("oilGas.col.polyEff")}</Th>
              <Th right>{t("oilGas.col.surge")}</Th>
              <Th>{t("oilGas.col.status")}</Th>
            </tr>
          </thead>
          <tbody>
            {v.compressors.map((c) => (
              <tr key={c.assetId} className="border-b border-line last:border-0">
                <td className="py-1 pr-3">
                  <AssetLink id={c.assetId} />
                  <span className="block text-xs text-fg-muted">{c.areaName}</span>
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{c.flow === null ? "—" : formatIn(c.flow, "gas_flow", units, t)}</td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {c.polytropicEffPct === null
                    ? "—"
                    : t("oilGas.mid.effOfDesign", { value: c.polytropicEffPct.toFixed(1), design: c.designEffPct })}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {c.surgeMarginPct === null ? "—" : `${c.surgeMarginPct.toFixed(1)} %`}
                </td>
                <td className="py-1">
                  <Flagged on={c.flag === "surge_close" || c.flag === "efficiency_low"}>{t(`oilGas.compressorFlag.${c.flag}`)}</Flagged>
                </td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      </section>
    </>
  );
}

// ─── Downstream ──────────────────────────────────────────────────────────────

function Downstream({ v }: { v: DownstreamView }) {
  const { t } = useTranslation();
  const [all, setAll] = useState(false);
  const due = useMemo(() => v.inspections.filter((i) => i.status !== "ok"), [v.inspections]);
  const shown = all ? v.inspections : due;
  return (
    <>
      <section aria-labelledby="og-hx" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="og-hx" className="font-semibold">
          {t("oilGas.down.exchangersTitle")}
        </h2>
        <p className="mb-2 text-sm text-fg-muted">{t("oilGas.down.exchangersIntro", { clean: EXCHANGER_CLEAN_PCT })}</p>
        <ScrollTable label={t("oilGas.down.exchangersTitle")} minWidth={700}>
          <thead>
            <tr className="border-b border-line text-left text-xs text-fg-muted">
              <Th>{t("oilGas.col.exchanger")}</Th>
              <Th right>{t("oilGas.col.effectiveness")}</Th>
              <Th>{t("oilGas.col.last30")}</Th>
              <Th right>{t("oilGas.col.trend")}</Th>
              <Th right>{t("oilGas.col.dp")}</Th>
              <Th>{t("oilGas.col.clean")}</Th>
            </tr>
          </thead>
          <tbody>
            {v.exchangers.map((x) => (
              <tr key={x.assetId} className="border-b border-line last:border-0">
                <td className="py-1 pr-3">
                  <AssetLink id={x.assetId} />
                  <span className="block text-xs text-fg-muted">{x.areaName}</span>
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {x.effectivenessPct === null ? "—" : `${x.effectivenessPct.toFixed(1)} %`}
                </td>
                <td className="py-1 pr-3">
                  <Sparkline values={x.history.filter((h): h is number => h !== null)} className="text-fg-muted" width={80} height={20} />
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">
                  {x.trendPtsPer30d === null ? "—" : t("oilGas.down.ptsPer30d", { value: x.trendPtsPer30d.toFixed(1) })}
                </td>
                <td className="py-1 pr-3 text-right tabular-nums">{x.tubeDpBar === null ? "—" : `${x.tubeDpBar.toFixed(2)} bar`}</td>
                <td className="py-1">
                  <Flagged on={x.daysToClean !== null && x.daysToClean <= 30}>
                    {x.daysToClean === null
                      ? t("oilGas.down.notFouling")
                      : x.daysToClean === 0
                        ? t("oilGas.down.cleanNow")
                        : t("oilGas.down.cleanIn", { count: x.daysToClean })}
                  </Flagged>
                </td>
              </tr>
            ))}
          </tbody>
        </ScrollTable>
      </section>

      <section aria-labelledby="og-insp" className="rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="og-insp" className="font-semibold">
            {t("oilGas.down.inspectionsTitle")}
          </h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            {t("oilGas.down.showAll", { count: v.inspections.length })}
          </label>
        </div>
        <p className="mb-2 text-sm text-fg-muted">{t("oilGas.down.inspectionsIntro")}</p>
        {shown.length === 0 ? (
          <p className="text-sm text-fg-muted">{t("oilGas.down.noneDue")}</p>
        ) : (
          <ScrollTable label={t("oilGas.down.inspectionsTitle")} minWidth={760}>
            <thead>
              <tr className="border-b border-line text-left text-xs text-fg-muted">
                <Th>{t("oilGas.col.equipment")}</Th>
                <Th>{t("oilGas.col.rule")}</Th>
                <Th>{t("oilGas.col.last")}</Th>
                <Th>{t("oilGas.col.interval")}</Th>
                <Th>{t("oilGas.col.next")}</Th>
              </tr>
            </thead>
            <tbody>
              {shown.map((i) => (
                <tr key={i.assetId} className="border-b border-line last:border-0">
                  <td className="py-1 pr-3">
                    <AssetLink id={i.assetId} />
                    <span className="block text-xs text-fg-muted">{t(`assetClass.${i.assetClass}`)}</span>
                  </td>
                  <td className="py-1 pr-3">{t(`oilGas.code.${i.code}`)}</td>
                  <td className="py-1 pr-3">{formatDate(i.lastAt)}</td>
                  <td className="py-1 pr-3">
                    {t("oilGas.years", { value: i.intervalYears })}
                    <span className="block text-xs text-fg-muted">{t(`oilGas.basis.${i.basis}`)}</span>
                  </td>
                  <td className="py-1">
                    <Flagged on={i.status !== "ok"}>
                      {formatDate(i.nextDueAt)} · {t(`oilGas.inspStatus.${i.status}`)}
                    </Flagged>
                  </td>
                </tr>
              ))}
            </tbody>
          </ScrollTable>
        )}
      </section>
    </>
  );
}
