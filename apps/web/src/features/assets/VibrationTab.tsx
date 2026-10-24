/**
 * Asset 360 → Vibration (spec §6.3), for rotating machines: what the analyst reads after the
 * overall level says "this machine shakes more than it should".
 *   1. Findings: the fault patterns found in the selected spectrum, and how urgent they are.
 *   2. The spectrum, with this machine's fault frequencies marked.
 *   3. The waterfall: the last twelve weeks of spectra, to see what grew.
 *   4. The orbit (oil-film bearings only): how the shaft actually moves.
 */
import { useApiQuery } from "@pdm/api-client";
import {
  VIBRATION_CLASSES,
  bearingOrders,
  peakAt,
  vibrationMarkers,
  type Asset,
  type Vibration,
  type VibrationFinding,
  type VibrationMarkerKey,
  type VibrationSlice,
} from "@pdm/contracts";
import { Select, Skeleton, cx } from "@pdm/ui";
import { keepPreviousData } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Eye } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatDate, formatNumber } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { formatMeasurement, toDisplay } from "../../shared/units";
import { SpectrumChart, type SpectrumMarker } from "./SpectrumChart";
import { OrbitPlot, Waterfall, type WaterfallRow } from "./VibrationPlots";

/** Classes with a Vibration tab. */
export const VIBRATION_TAB_CLASSES: ReadonlySet<Asset["assetClass"]> = new Set(VIBRATION_CLASSES);

/** Cage and ball-spin frequencies go in the table but not on the chart, where they crowd 2× and 3×. */
const TABLE_ONLY: ReadonlySet<VibrationMarkerKey> = new Set(["ftf", "bsf"]);
/** The waterfall table's columns, when the machine has them. */
const TREND_KEYS: readonly VibrationMarkerKey[] = ["1x", "2x", "vane_pass", "bpfo", "bpfi", "oil_whirl"];

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function VibrationTab({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  const [point, setPoint] = useState<string | undefined>(undefined);
  const [pick, setPick] = useState<string | null>(null);
  const data = useApiQuery(
    "assets.vibration",
    { assetId: asset.id, point },
    { refetchInterval: 120_000, placeholderData: keepPreviousData },
  );

  const amp = (a: number) => {
    const d = toDisplay(a, "vibration_velocity", units);
    return `${formatMeasurement(d.value)} ${t(`unitSymbol.${d.unit}`)}`;
  };

  if (data.isPending) return <Skeleton className="h-96" />;
  if (!data.data) return <p className="text-health-warning">{t("widget.failed")}</p>;
  const v = data.data;
  const running = v.slices.filter((s) => s.amps !== null);
  const latest = running.at(-1);
  const slice = running.find((s) => s.t === pick) ?? latest;

  return (
    <div className={cx("flex flex-col gap-4", data.isPlaceholderData && "opacity-60")}>
      <div className="flex flex-wrap items-end gap-3">
        {v.points.length > 1 && (
          <Select
            label={t("vibration.point")}
            value={v.point}
            options={v.points.map((p) => ({ value: p.tag, label: `${p.description} (${p.tag})` }))}
            onChange={(tag) => {
              setPoint(tag);
              setPick(null);
            }}
          />
        )}
        {slice && (
          <Select
            label={t("vibration.measurement")}
            value={slice.t}
            options={[...running].reverse().map((s) => ({
              value: s.t,
              label: s === latest ? t("vibration.latest", { date: formatDate(s.t) }) : formatDate(s.t),
            }))}
            onChange={setPick}
          />
        )}
      </div>

      {!slice ? (
        <p className="rounded-lg border border-line bg-surface p-4 text-fg-muted">{t("vibration.neverRunning")}</p>
      ) : (
        <>
          <Facts v={v} slice={slice} amp={amp} />
          <Findings findings={slice.findings} amp={amp} />
          <section aria-labelledby="vib-spectrum" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="vib-spectrum" className="font-semibold">
              {t("vibration.spectrumTitle", { date: formatDate(slice.t) })}
            </h2>
            <p className="mb-2 text-sm text-fg-muted">{t("vibration.spectrumIntro")}</p>
            <Spectrum v={v} slice={slice} amp={amp} />
          </section>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
            <section aria-labelledby="vib-waterfall" className="min-w-0 rounded-lg border border-line bg-surface p-4">
              <h2 id="vib-waterfall" className="font-semibold">
                {t("vibration.waterfallTitle")}
              </h2>
              <p className="mb-2 text-sm text-fg-muted">{t("vibration.waterfallIntro")}</p>
              <Trend v={v} selected={slice.t} amp={amp} />
            </section>
            <section aria-labelledby="vib-orbit" className="rounded-lg border border-line bg-surface p-4">
              <h2 id="vib-orbit" className="font-semibold">
                {t("vibration.orbitTitle")}
              </h2>
              {v.orbit ? (
                <>
                  <p className="mb-2 text-sm text-fg-muted">{t("vibration.orbitIntro", { date: formatDate(v.orbit.t) })}</p>
                  <OrbitPlot
                    orbit={v.orbit}
                    label={t("vibration.orbitLabel", { point: v.point })}
                    summary={t("vibration.orbitSummary", {
                      x: formatNumber(v.orbit.pkPkXUm, 1),
                      y: formatNumber(v.orbit.pkPkYUm, 1),
                    })}
                  />
                  <dl className="mt-2 flex gap-6 text-sm">
                    <div>
                      <dt className="text-xs text-fg-muted">{t("vibration.pkPkX")}</dt>
                      <dd className="font-semibold tabular-nums">{t("vibration.um", { value: formatNumber(v.orbit.pkPkXUm, 1) })}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-fg-muted">{t("vibration.pkPkY")}</dt>
                      <dd className="font-semibold tabular-nums">{t("vibration.um", { value: formatNumber(v.orbit.pkPkYUm, 1) })}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="text-sm text-fg-muted">{t("vibration.noOrbit")}</p>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}

type Amp = (a: number) => string;

function Facts({ v, slice, amp }: { v: Vibration; slice: VibrationSlice; amp: Amp }) {
  const { t } = useTranslation();
  const overall = slice.overall!;
  const state = overall >= v.limits.alarm ? "alarm" : overall >= v.limits.alert ? "alert" : "normal";
  const g = v.bearing.geometry;
  const o = g && bearingOrders(g);
  return (
    <dl className="grid gap-3 rounded-lg border border-line bg-surface p-4 text-sm sm:grid-cols-3">
      <div>
        <dt className="text-xs text-fg-muted">{t("vibration.overall")}</dt>
        <dd>
          <span className="text-xl font-semibold tabular-nums">{amp(overall)}</span>{" "}
          <span className={cx(state !== "normal" && "font-semibold text-health-warning")}>{t(`vibration.state.${state}`)}</span>
        </dd>
        <dd className="text-xs text-fg-muted">{t("vibration.limits", { alert: amp(v.limits.alert), alarm: amp(v.limits.alarm) })}</dd>
      </div>
      <div>
        <dt className="text-xs text-fg-muted">{t("vibration.speed")}</dt>
        <dd className="text-xl font-semibold tabular-nums">{t("vibration.rpm", { value: formatNumber(slice.runningHz! * 60) })}</dd>
        <dd className="text-xs text-fg-muted">{t("vibration.speedHz", { hz: slice.runningHz!.toFixed(2) })}</dd>
      </div>
      <div>
        <dt className="text-xs text-fg-muted">{t("vibration.bearings")}</dt>
        {g && o ? (
          <>
            <dd className="font-semibold">{t("vibration.rolling", { designation: g.designation, balls: g.balls })}</dd>
            <dd className="text-xs text-fg-muted">
              {t("vibration.orders", { bpfo: o.bpfo.toFixed(2), bpfi: o.bpfi.toFixed(2), bsf: o.bsf.toFixed(2), ftf: o.ftf.toFixed(2) })}
            </dd>
          </>
        ) : (
          <>
            <dd className="font-semibold">{t("vibration.journal")}</dd>
            <dd className="text-xs text-fg-muted">{t("vibration.journalNote")}</dd>
          </>
        )}
      </div>
    </dl>
  );
}

function Findings({ findings, amp }: { findings: readonly VibrationFinding[]; amp: Amp }) {
  const { t } = useTranslation();
  return (
    <section aria-labelledby="vib-findings" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="vib-findings" className="mb-2 font-semibold">
        {t("vibration.findingsTitle")}
      </h2>
      {findings.length === 0 ? (
        <p className="flex items-center gap-2 text-sm">
          <CheckCircle2 aria-hidden className="size-4 text-health-healthy" />
          {t("vibration.noFindings")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {findings.map((f) => (
            <li key={f.code} className="flex gap-2 text-sm">
              {f.level === "act" ? (
                <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0 text-health-warning" />
              ) : (
                <Eye aria-hidden className="mt-0.5 size-4 shrink-0 text-health-watch" />
              )}
              <div>
                <p className="font-semibold">
                  {t(`vibration.level.${f.level}`)}: {t(`vibration.finding.${f.code}.title`)}
                </p>
                <p className="text-fg-muted">
                  {t(`vibration.finding.${f.code}.why`, { hz: f.hz === null ? "" : f.hz.toFixed(1), amp: amp(f.amplitude) })}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function markersOf(v: Vibration, slice: VibrationSlice): SpectrumMarker[] {
  const df = v.fMaxHz / v.lines;
  return vibrationMarkers(v).map((m) => {
    const hz = m.order * slice.runningHz!;
    return { key: m.key, order: m.order, hz, amp: peakAt(slice.amps!, hz, df).amp, onChart: !TABLE_ONLY.has(m.key), label: "", name: "" };
  });
}

function Spectrum({ v, slice, amp }: { v: Vibration; slice: VibrationSlice; amp: Amp }) {
  const { t } = useTranslation();
  const df = v.fMaxHz / v.lines;
  const markers = markersOf(v, slice).map((m) => ({
    ...m,
    label: t(`vibration.marker.${m.key}`),
    name: t(`vibration.markerName.${m.key}`),
  }));
  const amps = slice.amps!;
  const top = amps.reduce((best, a, i) => (a > amps[best]! ? i : best), 0);
  const topHz = (top + 1) * df;
  const findings = slice.findings.map((f) => t(`vibration.finding.${f.code}.title`)).join(", ");
  return (
    <SpectrumChart
      amps={amps}
      df={df}
      runningHz={slice.runningHz!}
      markers={markers}
      format={amp}
      label={t("vibration.spectrumLabel", { point: v.point, date: formatDate(slice.t) })}
      summary={`${t("vibration.spectrumSummary", {
        amp: amp(amps[top]!),
        hz: topHz.toFixed(1),
        order: (topHz / slice.runningHz!).toFixed(2),
      })} ${findings ? t("vibration.spectrumFindings", { findings }) : t("vibration.noFindings")}`}
    />
  );
}

function Trend({ v, selected, amp }: { v: Vibration; selected: string; amp: Amp }) {
  const { t } = useTranslation();
  const df = v.fMaxHz / v.lines;
  const orders = Object.fromEntries(vibrationMarkers(v).map((m) => [m.key, m.order]));
  const keys = TREND_KEYS.filter((k) => orders[k] !== undefined);
  const rows: WaterfallRow[] = v.slices.map((s) => ({
    t: s.t,
    date: shortDate(s.t),
    amps: s.amps,
    overall: s.overall,
    peaks: s.amps ? keys.map((k) => peakAt(s.amps!, orders[k]! * s.runningHz!, df).amp) : [],
  }));
  // The summary names the peak that grew the most between the first and the last measurement.
  const measured = rows.filter((r) => r.amps);
  const first = measured[0];
  const last = measured.at(-1);
  const growth = keys
    .map((k, i) => ({ k, from: first?.peaks[i] ?? 0, to: last?.peaks[i] ?? 0 }))
    .sort((a, b) => b.to / Math.max(b.from, 1e-3) - a.to / Math.max(a.from, 1e-3))[0];
  return (
    <Waterfall
      rows={rows}
      columns={keys.map((k) => t(`vibration.marker.${k}`))}
      selected={selected}
      df={df}
      format={amp}
      label={t("vibration.waterfallLabel", { point: v.point, n: measured.length })}
      summary={
        growth
          ? t("vibration.waterfallSummary", { marker: t(`vibration.markerName.${growth.k}`), from: amp(growth.from), to: amp(growth.to) })
          : ""
      }
    />
  );
}
