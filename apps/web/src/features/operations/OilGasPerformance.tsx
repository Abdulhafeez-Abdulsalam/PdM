/**
 * Asset 360 → Performance for oil & gas equipment: a well against its decline curve, an ESP's
 * diagnosis, a compressor's efficiency and surge margin, an exchanger's fouling, and the wall
 * thickness and inspection dates of pipelines, vessels, tanks and relief valves.
 */
import {
  EXCHANGER_CLEAN_PCT,
  type CompressorRow,
  type EspRow,
  type ExchangerRow,
  type IntegrityPerformance,
  type WellPerformance,
} from "@pdm/contracts";
import { KpiCard } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { formatDate, formatNumber } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { useSimNow } from "../../shared/sim-time";
import { LineChart } from "../../shared/widgets/LineChart";
import { DeclineChart, Flagged } from "./oil-gas-parts";
import { formatIn } from "./power-format";

const dayTick = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

export function WellPerformanceView({ data }: { data: WellPerformance }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  const w = data.well;
  const flow = (x: number | null) => (x === null ? "—" : formatIn(x, "liquid_flow", units, t, 1));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t("oilGas.col.oil")} value={flow(w.oilRate)} />
        <KpiCard label={t("oilGas.col.waterCut")} value={w.waterCutPct === null ? "—" : `${w.waterCutPct.toFixed(1)} %`} />
        <KpiCard
          label={t("oilGas.col.lost")}
          value={w.lostOilRate > 0.05 ? flow(w.lostOilRate) : "—"}
          change={w.lostOilRate > 0.5 ? t("oilGas.perf.liftProblem") : undefined}
          changeTone={w.lostOilRate > 0.5 ? "bad" : "neutral"}
          changeDirection={w.lostOilRate > 0.5 ? "down" : "flat"}
        />
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-3">
          <p className="text-xs font-medium text-fg-muted">{t("oilGas.perf.lift")}</p>
          <p className="text-lg">{t(`oilGas.lift.${w.liftType}`)}</p>
          {w.liftAssetId && (
            <Link
              to="/assets/$assetId/$tab"
              params={{ assetId: w.liftAssetId, tab: "performance" }}
              className="font-mono text-sm hover:underline"
            >
              {w.liftAssetId}
            </Link>
          )}
        </div>
      </div>
      <section aria-labelledby="well-decline" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="well-decline" className="font-semibold">
          {t("oilGas.up.declineTitle")}
        </h2>
        <p className="mb-2 text-sm text-fg-muted">{t("oilGas.perf.wellDeclineIntro", { pct: w.declinePctPerYear.toFixed(0) })}</p>
        <DeclineChart production={data.production} fit={data.fit} label={t("oilGas.perf.wellDeclineLabel", { id: w.assetId })} />
      </section>
    </div>
  );
}

export function EspPerformanceView({ data: e }: { data: EspRow }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  return (
    <div className="flex flex-col gap-4">
      <section aria-labelledby="esp-dx" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="esp-dx" className="font-semibold">
          {t("oilGas.perf.diagnosisTitle")}
        </h2>
        <p className="my-2 text-lg">
          <Flagged on={e.diagnosis !== "normal"}>{t(`oilGas.diagnosis.${e.diagnosis}`)}</Flagged>
        </p>
        <p className="text-sm text-fg-muted">{t(`oilGas.diagnosisMeans.${e.diagnosis}`)}</p>
        {e.wellId && (
          <p className="mt-2 text-sm">
            {t("oilGas.perf.lifts")}{" "}
            <Link to="/assets/$assetId/$tab" params={{ assetId: e.wellId, tab: "performance" }} className="font-mono hover:underline">
              {e.wellId}
            </Link>
          </p>
        )}
      </section>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label={t("oilGas.col.motorTemp")} value={e.motorTemp === null ? "—" : formatIn(e.motorTemp, "temperature", units, t, 1)} />
        <KpiCard label={t("oilGas.col.amps")} value={e.motorAmps === null ? "—" : `${formatNumber(e.motorAmps, 1)} A`} />
        <KpiCard
          label={t("oilGas.col.intake")}
          value={e.intakePressure === null ? "—" : formatIn(e.intakePressure, "pressure", units, t, 1)}
        />
        <KpiCard label={t("oilGas.perf.frequency")} value={e.frequency === null ? "—" : `${formatNumber(e.frequency, 1)} Hz`} />
      </div>
    </div>
  );
}

export function CompressorPerformanceView({ data: c }: { data: CompressorRow }) {
  const { t } = useTranslation();
  const units = usePreferences((p) => p.units);
  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg">
        <Flagged on={c.flag === "surge_close" || c.flag === "efficiency_low"}>{t(`oilGas.compressorFlag.${c.flag}`)}</Flagged>
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard label={t("oilGas.col.flow")} value={c.flow === null ? "—" : formatIn(c.flow, "gas_flow", units, t)} />
        <KpiCard
          label={t("oilGas.col.polyEff")}
          value={c.polytropicEffPct === null ? "—" : `${c.polytropicEffPct.toFixed(1)} %`}
          target={t("oilGas.perf.design", { value: c.designEffPct })}
        />
        <KpiCard label={t("oilGas.col.surge")} value={c.surgeMarginPct === null ? "—" : `${c.surgeMarginPct.toFixed(1)} %`} />
      </div>
      <p className="text-sm text-fg-muted">{t("oilGas.mid.compressorsIntro")}</p>
    </div>
  );
}

export function ExchangerPerformanceView({ data: x }: { data: ExchangerRow }) {
  const { t } = useTranslation();
  const { now } = useSimNow();
  // One point a day at noon, oldest first, ending today (simulated time).
  const end = Math.floor(now / 86_400_000) * 86_400_000 + 43_200_000;
  const times = x.history.map((_, i) => end - (x.history.length - 1 - i) * 86_400_000);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label={t("oilGas.col.effectiveness")}
          value={x.effectivenessPct === null ? "—" : `${x.effectivenessPct.toFixed(1)} %`}
          target={t("oilGas.perf.design", { value: x.designPct })}
        />
        <KpiCard label={t("oilGas.col.dp")} value={x.tubeDpBar === null ? "—" : `${x.tubeDpBar.toFixed(2)} bar`} />
        <div className="flex flex-col gap-1 rounded-lg border border-line bg-surface p-3">
          <p className="text-xs font-medium text-fg-muted">{t("oilGas.col.clean")}</p>
          <p className="text-lg">
            <Flagged on={x.daysToClean !== null && x.daysToClean <= 30}>
              {x.daysToClean === null
                ? t("oilGas.down.notFouling")
                : x.daysToClean === 0
                  ? t("oilGas.down.cleanNow")
                  : t("oilGas.down.cleanIn", { count: x.daysToClean })}
            </Flagged>
          </p>
        </div>
      </div>
      <section aria-labelledby="hx-trend" className="rounded-lg border border-line bg-surface p-4">
        <h2 id="hx-trend" className="font-semibold">
          {t("oilGas.perf.effTitle")}
        </h2>
        <p className="mb-2 text-sm text-fg-muted">{t("oilGas.down.exchangersIntro", { clean: EXCHANGER_CLEAN_PCT })}</p>
        <LineChart
          times={times}
          series={[{ id: "eff", label: t("oilGas.col.effectiveness"), values: x.history, color: "var(--pdm-series-1)" }]}
          label={t("oilGas.perf.effLabel", { id: x.assetId })}
          summary={
            x.trendPtsPer30d === null ? t("oilGas.down.notFouling") : t("oilGas.down.ptsPer30d", { value: x.trendPtsPer30d.toFixed(1) })
          }
          format={(v) => `${formatNumber(v, 1)} %`}
          formatTime={(ms) => dayTick.format(ms)}
          formatTick={(ms) => dayTick.format(ms)}
          thresholds={[{ value: EXCHANGER_CLEAN_PCT, label: t("oilGas.perf.cleanLine") }]}
          height={180}
        />
      </section>
    </div>
  );
}

export function IntegrityPerformanceView({ data }: { data: IntegrityPerformance }) {
  const { t } = useTranslation();
  const i = data.integrity;
  const insp = data.inspection;
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {i && (
        <section aria-labelledby="int-wall" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="int-wall" className="font-semibold">
            {t("oilGas.perf.wallTitle")}
          </h2>
          <p className="my-2">
            <Flagged on={i.status !== "ok"}>{t(`oilGas.integrity.${i.status}`)}</Flagged>
          </p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
            <dt className="text-fg-muted">{t("oilGas.perf.wallNow")}</dt>
            <dd className="text-right tabular-nums">{i.wallMm.toFixed(2)} mm</dd>
            <dt className="text-fg-muted">{t("oilGas.perf.wallNew")}</dt>
            <dd className="text-right tabular-nums">{i.nominalMm.toFixed(2)} mm</dd>
            <dt className="text-fg-muted">{t("oilGas.perf.wallRequired")}</dt>
            <dd className="text-right tabular-nums">{i.requiredMm.toFixed(2)} mm</dd>
            <dt className="text-fg-muted">{t("oilGas.perf.longTerm")}</dt>
            <dd className="text-right tabular-nums">{t("oilGas.mmPerYear", { value: i.longTermRate.toFixed(3) })}</dd>
            <dt className="text-fg-muted">{t("oilGas.perf.shortTerm")}</dt>
            <dd className="text-right tabular-nums">
              {i.shortTermRate === null ? "—" : t("oilGas.mmPerYear", { value: i.shortTermRate.toFixed(3) })}
            </dd>
            <dt className="font-medium">{t("oilGas.col.life")}</dt>
            <dd className="text-right font-medium tabular-nums">
              {i.remainingLifeYears === null ? "—" : t("oilGas.years", { value: i.remainingLifeYears.toFixed(1) })}
            </dd>
          </dl>
          <p className="mt-2 text-xs text-fg-muted">{t("oilGas.perf.lifeHow")}</p>
        </section>
      )}
      {insp && (
        <section aria-labelledby="int-insp" className="rounded-lg border border-line bg-surface p-4">
          <h2 id="int-insp" className="font-semibold">
            {t("oilGas.perf.inspectionTitle")}
          </h2>
          <p className="my-2">
            <Flagged on={insp.status !== "ok"}>
              {formatDate(insp.nextDueAt)} · {t(`oilGas.inspStatus.${insp.status}`)}
            </Flagged>
          </p>
          <dl className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-sm">
            <dt className="text-fg-muted">{t("oilGas.col.rule")}</dt>
            <dd className="text-right">{t(`oilGas.code.${insp.code}`)}</dd>
            <dt className="text-fg-muted">{t("oilGas.col.last")}</dt>
            <dd className="text-right">{formatDate(insp.lastAt)}</dd>
            <dt className="text-fg-muted">{t("oilGas.col.interval")}</dt>
            <dd className="text-right">
              {t("oilGas.years", { value: insp.intervalYears })}
              <span className="block text-xs text-fg-muted">{t(`oilGas.basis.${insp.basis}`)}</span>
            </dd>
          </dl>
          <p className="mt-2 text-xs text-fg-muted">{t(`oilGas.codeMeans.${insp.code}`)}</p>
        </section>
      )}
    </div>
  );
}
