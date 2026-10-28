/**
 * The predictive tools (Phase 4, chunk 9): "which models do we trust, what rules fire, what if
 * we wait?"
 *  - Models: each class's model, its versions' backtests, live verdicts, and candidates to approve.
 *  - Rules: threshold rules, each tested on the last 24 h of readings before it can be saved.
 *  - What if: the chance a predicted failure happens before a deferred repair, and what it costs.
 */
import { useApiMutation, useApiQuery } from "@pdm/api-client";
import {
  AlarmPriority,
  RULE_STEP_MINUTES,
  RULE_TEST_HOURS,
  type AssetClass,
  type ModelEntry,
  type RuleCondition,
  type RuleTestResult,
} from "@pdm/contracts";
import { Button, Field, KpiCard, Select, Skeleton, cx, inputClass } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatNumber, formatProbability } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { canDo } from "../../shared/roles/roles";
import { useSimNow } from "../../shared/sim-time";
import { useToasts } from "../../shared/toast";
import { formatMeasurement, fromDisplay, toDisplay } from "../../shared/units";
import { LineChart } from "../../shared/widgets/LineChart";
import { PredictiveNav } from "./PredictiveNav";
import { deferral } from "./what-if";

const DAY = 86_400_000;
const pct = (p: number) => formatProbability(p);
/** Fewer verdicts than this and a live precision would mostly be luck. */
const MIN_VERDICTS = 5;

function ToolsHeader({ intro }: { intro: string }) {
  const { t } = useTranslation();
  useEffect(() => {
    document.title = `${t("modules.predictive.name")} · ${t("app.name")}`;
  }, [t]);
  return (
    <>
      <header>
        <h1 className="text-2xl font-semibold">{t("modules.predictive.name")}</h1>
        <p className="text-fg-muted">{intro}</p>
      </header>
      <PredictiveNav />
    </>
  );
}

/** "0.83 ▲ 0.05 better" against production, in words as well as an arrow. */
function Delta({
  value,
  base,
  higherIsBetter = true,
  format,
}: {
  value: number;
  base: number;
  higherIsBetter?: boolean;
  format: (v: number) => string;
}) {
  const { t } = useTranslation();
  const diff = value - base;
  if (Math.abs(diff) < 1e-9) return <span className="text-fg-muted">{t("tools.models.same")}</span>;
  const good = diff > 0 === higherIsBetter;
  const Icon = diff > 0 ? ArrowUp : ArrowDown;
  return (
    <span className={cx("inline-flex items-center gap-0.5", good ? "text-health-healthy" : "font-medium text-health-warning")}>
      <Icon aria-hidden className="size-3" />
      {t(good ? "tools.models.better" : "tools.models.worse", { by: format(Math.abs(diff)) })}
    </span>
  );
}

export function ModelsPage() {
  const { t } = useTranslation();
  const role = usePreferences((p) => p.role);
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const models = useApiQuery("models.list", {});
  const done = (key: "approved" | "rejected") => (m: ModelEntry) => {
    void client.invalidateQueries({ queryKey: ["models.list"] });
    void client.invalidateQueries({ queryKey: ["predictions.list"] });
    toast("success", t(`tools.models.${key}`, { model: t(`assetClass.${m.assetClass}`) }));
  };
  const approve = useApiMutation("models.approve", { onSuccess: done("approved"), onError: (e) => toast("error", e.message) });
  const reject = useApiMutation("models.reject", { onSuccess: done("rejected"), onError: (e) => toast("error", e.message) });
  const may = canDo(role, "model.approve");
  const two = (v: number) => v.toFixed(2);
  const items = models.data?.items ?? [];
  const candidates = items.filter((m) => m.versions.some((v) => v.status === "candidate"));
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <ToolsHeader intro={t("tools.models.intro")} />
      {!models.data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <section aria-labelledby="models-candidates" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="models-candidates" className="font-semibold">
              {t("tools.models.candidatesTitle", { count: candidates.length })}
            </h2>
            <p className="mb-3 text-sm text-fg-muted">{t("tools.models.candidatesIntro")}</p>
            <div className="relative -mx-4 overflow-x-auto">
              <table className="w-full min-w-[920px] text-sm">
                <caption className="sr-only">{t("tools.models.candidatesCaption")}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-1 font-medium">
                      {t("tools.models.col.model")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("tools.models.col.precision")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("tools.models.col.recall")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("tools.models.col.lead")}
                    </th>
                    <th scope="col" className="py-1 pr-4 font-medium">
                      {t("tools.models.col.decision")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((m) => {
                    const cand = m.versions.find((v) => v.status === "candidate")!;
                    const prod = m.versions.find((v) => v.status === "production")!;
                    const name = t(`assetClass.${m.assetClass}`);
                    return (
                      <tr key={m.id} className="border-b border-line align-top last:border-0">
                        <th scope="row" className="px-4 py-1.5 text-left font-normal">
                          {name}
                          <span className="block text-xs text-fg-muted">
                            {t("tools.models.candidateVs", { candidate: cand.version, production: prod.version })}
                          </span>
                        </th>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {two(cand.backtest.precision)}{" "}
                          <span className="block text-xs">
                            <Delta value={cand.backtest.precision} base={prod.backtest.precision} format={two} />
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {two(cand.backtest.recall)}{" "}
                          <span className="block text-xs">
                            <Delta value={cand.backtest.recall} base={prod.backtest.recall} format={two} />
                          </span>
                        </td>
                        <td className="py-1.5 pr-3 tabular-nums">
                          {t("tools.days", { count: cand.backtest.leadDays })}{" "}
                          <span className="block text-xs">
                            <Delta
                              value={cand.backtest.leadDays}
                              base={prod.backtest.leadDays}
                              format={(v) => t("tools.days", { count: v })}
                            />
                          </span>
                        </td>
                        <td className="py-1.5 pr-4">
                          {may ? (
                            <span className="flex flex-wrap gap-2">
                              <Button
                                size="sm"
                                variant="primary"
                                disabled={approve.isPending || reject.isPending}
                                onClick={() => approve.mutate({ modelId: m.id, version: cand.version })}
                                aria-label={t("tools.models.approveFor", { model: name, version: cand.version })}
                              >
                                {t("tools.models.approve")}
                              </Button>
                              <Button
                                size="sm"
                                disabled={approve.isPending || reject.isPending}
                                onClick={() => reject.mutate({ modelId: m.id, version: cand.version })}
                                aria-label={t("tools.models.rejectFor", { model: name, version: cand.version })}
                              >
                                {t("tools.models.reject")}
                              </Button>
                            </span>
                          ) : (
                            <span className="text-fg-muted">{t("tools.models.awaiting")}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {candidates.length === 0 && <p className="text-sm text-fg-muted">{t("tools.models.noCandidates")}</p>}
          </section>

          <section aria-labelledby="models-all" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="models-all" className="font-semibold">
              {t("tools.models.allTitle")}
            </h2>
            <p className="mb-3 text-sm text-fg-muted">{t("tools.models.allIntro", { min: MIN_VERDICTS })}</p>
            <div className="relative -mx-4 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <caption className="sr-only">{t("tools.models.allCaption")}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-1 font-medium">
                      {t("tools.models.col.model")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("tools.models.col.version")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("tools.models.col.backtest")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("tools.models.col.verdicts")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("tools.models.col.live")}
                    </th>
                    <th scope="col" className="py-1 pr-4 text-right font-medium">
                      {t("tools.models.col.open")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((m) => {
                    const prod = m.versions.find((v) => v.status === "production")!;
                    const judged = m.live.confirmed + m.live.falseAlarms;
                    return (
                      <tr key={m.id} className="border-b border-line align-top last:border-0">
                        <th scope="row" className="px-4 py-1.5 text-left font-normal">
                          {t(`assetClass.${m.assetClass}`)}
                          <span className="block text-xs text-fg-muted">{t("tools.models.assets", { count: m.assets })}</span>
                        </th>
                        <td className="py-1.5 pr-3 font-mono">{prod.version}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {t("tools.models.backtestValue", {
                            precision: two(prod.backtest.precision),
                            recall: two(prod.backtest.recall),
                            lead: prod.backtest.leadDays,
                          })}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {t("tools.models.verdictsValue", { confirmed: m.live.confirmed, falseAlarms: m.live.falseAlarms })}
                        </td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">
                          {judged >= MIN_VERDICTS && m.live.precision !== null ? (
                            two(m.live.precision)
                          ) : (
                            <span className="text-fg-muted">{t("tools.models.tooFew")}</span>
                          )}
                        </td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">{formatNumber(m.openPredictions)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

const DURATIONS = [5, 10, 15, 30, 60, 120] as const;

export function RulesPage() {
  const { t } = useTranslation();
  const role = usePreferences((p) => p.role);
  const units = usePreferences((p) => p.units);
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const overview = useApiQuery("rules.overview", {});
  const signals = useMemo(() => overview.data?.signals ?? [], [overview.data]);
  const classes = useMemo(() => [...new Set(signals.map((s) => s.assetClass))], [signals]);
  const may = canDo(role, "threshold.edit");

  const [assetClass, setAssetClass] = useState<AssetClass>("pump");
  const classSignals = signals.filter((s) => s.assetClass === assetClass);
  const [signalName, setSignalName] = useState("");
  const signal = classSignals.find((s) => s.signal === signalName) ?? classSignals[0];
  const [comparator, setComparator] = useState<"above" | "below">("above");
  const [threshold, setThreshold] = useState("");
  const [duration, setDuration] = useState<(typeof DURATIONS)[number]>(10);
  const [priority, setPriority] = useState<AlarmPriority>("p3");
  const [name, setName] = useState("");
  const [tested, setTested] = useState<{ key: string; result: RuleTestResult } | null>(null);
  const unit = signal ? t(`unitSymbol.${toDisplay(0, signal.quantity, units).unit}`) : "";
  const thresholdSi =
    signal && threshold.trim() !== "" && Number.isFinite(Number(threshold)) ? fromDisplay(Number(threshold), signal.quantity, units) : null;
  const cond: RuleCondition | null =
    signal && thresholdSi !== null
      ? { assetClass, signal: signal.signal, comparator, threshold: thresholdSi, durationMinutes: duration }
      : null;
  const condKey = JSON.stringify(cond);
  const result = tested && tested.key === condKey ? tested.result : null;

  const test = useApiMutation("rules.test", {
    onSuccess: (r, input) => setTested({ key: JSON.stringify(input), result: r }),
    onError: (e) => toast("error", e.message),
  });
  const create = useApiMutation("rules.create", {
    onSuccess: (r) => {
      void client.invalidateQueries({ queryKey: ["rules.overview"] });
      toast("success", t("tools.rules.saved", { name: r.name }));
      setName("");
    },
    onError: (e) => toast("error", e.message),
  });
  const toggle = useApiMutation("rules.setEnabled", {
    onSuccess: () => void client.invalidateQueries({ queryKey: ["rules.overview"] }),
    onError: (e) => toast("error", e.message),
  });
  const describe = (r: RuleCondition) => {
    const s = signals.find((x) => x.assetClass === r.assetClass && x.signal === r.signal);
    const d = s ? toDisplay(r.threshold, s.quantity, units) : null;
    return t("tools.rules.condition", {
      signal: s ? `${s.description} (${s.signal})` : r.signal,
      comparator: t(`tools.rules.${r.comparator}`),
      threshold: d ? `${formatMeasurement(d.value)} ${t(`unitSymbol.${d.unit}`)}`.trim() : r.threshold,
      minutes: r.durationMinutes,
      cls: t(`assetClass.${r.assetClass}`),
    });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (cond && result && name.trim().length >= 3) create.mutate({ ...cond, name: name.trim(), priority });
  };
  const pickSignal = (s: string) => {
    setSignalName(s);
    const found = classSignals.find((x) => x.signal === s);
    // A starting point: half as much again as the healthy value (or half of it, for "below").
    if (found)
      setThreshold(
        String(Number(toDisplay(found.typical * (comparator === "above" ? 1.5 : 0.5), found.quantity, units).value.toPrecision(3))),
      );
  };

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <ToolsHeader intro={t("tools.rules.intro", { hours: RULE_TEST_HOURS })} />
      {!overview.data ? (
        <Skeleton className="h-96" />
      ) : (
        <>
          <section aria-labelledby="rules-list" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="rules-list" className="font-semibold">
              {t("tools.rules.listTitle")}
            </h2>
            <p className="mb-3 text-sm text-fg-muted">{t("tools.rules.listIntro", { hours: RULE_TEST_HOURS })}</p>
            <div className="relative -mx-4 overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <caption className="sr-only">{t("tools.rules.listTitle")}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-1 font-medium">
                      {t("tools.rules.col.rule")}
                    </th>
                    <th scope="col" className="py-1 pr-3 font-medium">
                      {t("tools.rules.col.priority")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("tools.rules.col.fired", { hours: RULE_TEST_HOURS })}
                    </th>
                    <th scope="col" className="py-1 pr-4 font-medium">
                      {t("tools.rules.col.state")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {overview.data.rules.map((r) => (
                    <tr key={r.id} className="border-b border-line align-top last:border-0">
                      <th scope="row" className="px-4 py-1.5 text-left font-normal">
                        {r.name}
                        <span className="block text-xs text-fg-muted">{describe(r)}</span>
                      </th>
                      <td className="py-1.5 pr-3">{t(`alarms.priority.${r.priority}`)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums">
                        {t("tools.rules.firedValue", { count: r.hits, assets: r.assetsHit })}
                      </td>
                      <td className="py-1.5 pr-4">
                        <span className={r.enabled ? "font-medium" : "text-fg-muted"}>
                          {t(r.enabled ? "tools.rules.on" : "tools.rules.off")}
                        </span>
                        {may && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-2"
                            disabled={toggle.isPending}
                            onClick={() => toggle.mutate({ ruleId: r.id, enabled: !r.enabled })}
                            aria-label={t(r.enabled ? "tools.rules.switchOffFor" : "tools.rules.switchOnFor", { name: r.name })}
                          >
                            {t(r.enabled ? "tools.rules.switchOff" : "tools.rules.switchOn")}
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-fg-muted">{t("tools.rules.demoNote")}</p>
          </section>

          <section aria-labelledby="rules-build" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="rules-build" className="font-semibold">
              {t("tools.rules.buildTitle")}
            </h2>
            <p className="mb-3 text-sm text-fg-muted">{t("tools.rules.buildIntro", { hours: RULE_TEST_HOURS })}</p>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
                <Select
                  label={t("tools.rules.class")}
                  value={assetClass}
                  options={classes.map((c) => ({ value: c, label: t(`assetClass.${c}`) }))}
                  onChange={(c) => {
                    setAssetClass(c);
                    setSignalName("");
                    setThreshold("");
                  }}
                />
                <Select
                  label={t("tools.rules.signal")}
                  value={signal?.signal ?? ""}
                  options={classSignals.map((s) => ({ value: s.signal, label: `${s.description} (${s.signal})` }))}
                  onChange={pickSignal}
                />
                <Select
                  label={t("tools.rules.when")}
                  value={comparator}
                  options={[
                    { value: "above", label: t("tools.rules.above") },
                    { value: "below", label: t("tools.rules.below") },
                  ]}
                  onChange={setComparator}
                />
                <Field label={t("tools.rules.threshold", { unit })}>
                  {(p) => (
                    <input
                      {...p}
                      inputMode="decimal"
                      value={threshold}
                      onChange={(e) => setThreshold(e.target.value)}
                      className={inputClass}
                    />
                  )}
                </Field>
                <Select
                  label={t("tools.rules.for")}
                  value={String(duration)}
                  options={DURATIONS.map((d) => ({ value: String(d), label: t("tools.minutes", { count: d }) }))}
                  onChange={(v) => setDuration(Number(v) as (typeof DURATIONS)[number])}
                />
              </div>
              <div>
                <Button type="button" disabled={!cond || test.isPending} onClick={() => cond && test.mutate(cond)}>
                  {t("tools.rules.test", { hours: RULE_TEST_HOURS })}
                </Button>
              </div>
              {result && (
                <div aria-live="polite" className="rounded-md bg-sunken p-3 text-sm">
                  <p className="font-medium">
                    {t("tools.rules.result", {
                      count: result.hits,
                      assets: result.assetsHit,
                      checked: result.assetsChecked,
                      hours: RULE_TEST_HOURS,
                    })}
                  </p>
                  {result.examples.length > 0 && (
                    <ul className="mt-1 text-fg-muted">
                      {result.examples.slice(0, 5).map((h) => (
                        <li key={`${h.tagId}-${h.from}`}>
                          <Link
                            to="/assets/$assetId/$tab"
                            params={{ assetId: h.assetId, tab: "telemetry" }}
                            className="font-mono text-accent underline"
                          >
                            {h.assetId}
                          </Link>{" "}
                          {t("tools.rules.spell", {
                            minutes: Math.round((Date.parse(h.to) - Date.parse(h.from)) / 60_000) + RULE_STEP_MINUTES,
                            peak: signal ? `${formatMeasurement(toDisplay(h.peak, signal.quantity, units).value)} ${unit}`.trim() : h.peak,
                          })}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {may && (
                <div className="flex flex-wrap items-end gap-3">
                  <Field label={t("tools.rules.name")}>
                    {(p) => (
                      <input
                        {...p}
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        maxLength={80}
                        className={cx(inputClass, "w-72 max-w-full")}
                      />
                    )}
                  </Field>
                  <Select
                    label={t("tools.rules.priority")}
                    value={priority}
                    options={AlarmPriority.options.map((p) => ({ value: p, label: t(`alarms.priority.${p}`) }))}
                    onChange={setPriority}
                  />
                  <Button type="submit" variant="primary" disabled={!result || name.trim().length < 3 || create.isPending}>
                    {t("tools.rules.save")}
                  </Button>
                  {!result && <p className="text-sm text-fg-muted">{t("tools.rules.testFirst")}</p>}
                </div>
              )}
            </form>
          </section>
        </>
      )}
    </div>
  );
}

const TABLE_DAYS = [0, 7, 14, 30, 60, 90] as const;

export function WhatIfPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { now } = useSimNow();
  const chosenId = (useSearch({ strict: false }) as { for?: unknown }).for;
  const list = useApiQuery("predictions.list", { status: ["open", "acknowledged", "actioned"], sort: "exposure", limit: 50 });
  const options = (list.data?.items ?? []).filter((p) => p.rul);
  const prediction = options.find((p) => p.id === chosenId) ?? options[0];
  const [days, setDays] = useState(30);
  const money = (v: number) => formatCurrency(v, prediction?.recommendedAction.failureCost.currency ?? "USD");
  const elapsed = prediction?.rul ? Math.max(0, (now - Date.parse(prediction.rul.estimatedAt)) / DAY) : 0;
  const at = (d: number) => (prediction ? deferral(prediction, elapsed, d) : null);
  const chosen = at(days);
  const curve = useMemo(() => Array.from({ length: 91 }, (_, d) => d), []);
  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4">
      <ToolsHeader intro={t("tools.whatIf.intro")} />
      {!list.data ? (
        <Skeleton className="h-96" />
      ) : !prediction ? (
        <p className="text-fg-muted">{t("tools.whatIf.none")}</p>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-4">
            <Select
              label={t("tools.whatIf.prediction")}
              value={prediction.id}
              options={options.map((p) => ({ value: p.id, label: `${p.assetId}: ${p.failureMode.label} (${pct(p.probability)})` }))}
              onChange={(id) =>
                void navigate({ to: ".", search: (prev: Record<string, unknown>) => ({ ...prev, for: id }), replace: true })
              }
            />
            <Field label={t("tools.whatIf.defer")}>
              {(p) => (
                <span className="flex items-center gap-3">
                  <input
                    {...p}
                    type="range"
                    min={0}
                    max={90}
                    step={1}
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="w-56"
                  />
                  <output htmlFor={p.id} className="w-16 tabular-nums">
                    {t("tools.days", { count: days })}
                  </output>
                </span>
              )}
            </Field>
            <Link to="/predictive/$predictionId" params={{ predictionId: prediction.id }} className="text-sm text-accent underline">
              {t("tools.whatIf.open")}
            </Link>
          </div>
          {chosen && (
            <section aria-label={t("tools.whatIf.kpisLabel")} className="grid grid-cols-2 gap-3 xl:grid-cols-4">
              <KpiCard label={t("tools.whatIf.chance", { count: days })} value={pct(chosen.chance)} lineage={t("tools.whatIf.chanceHow")} />
              <KpiCard
                label={t("tools.whatIf.repairNow")}
                value={money(prediction.recommendedAction.interventionCost.amount)}
                lineage={prediction.recommendedAction.summary}
              />
              <KpiCard
                label={t("tools.whatIf.expected", { count: days })}
                value={money(chosen.expectedCost)}
                lineage={t("tools.whatIf.expectedHow", { failure: money(prediction.recommendedAction.failureCost.amount) })}
              />
              <KpiCard label={t("tools.whatIf.extra")} value={money(chosen.extra)} lineage={t("tools.whatIf.extraHow")} />
            </section>
          )}
          <section aria-labelledby="whatif-curve" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="whatif-curve" className="font-semibold">
              {t("tools.whatIf.curveTitle")}
            </h2>
            <p className="mb-2 text-sm text-fg-muted">
              {t("tools.whatIf.curveIntro", {
                p10: prediction.rul!.p10Days,
                p50: prediction.rul!.p50Days,
                p90: prediction.rul!.p90Days,
                elapsed: formatNumber(elapsed, 1),
              })}
            </p>
            <LineChart
              times={curve.map((d) => now + d * DAY)}
              series={[
                {
                  id: "chance",
                  label: t("tools.whatIf.chanceLine"),
                  values: curve.map((d) => 100 * (at(d)?.chance ?? 0)),
                  color: "var(--pdm-series-1)",
                },
              ]}
              label={t("tools.whatIf.curveLabel", { asset: prediction.assetId })}
              summary={t("tools.whatIf.curveSummary", {
                d30: pct(at(30)?.chance ?? 0),
                d60: pct(at(60)?.chance ?? 0),
                d90: pct(at(90)?.chance ?? 0),
              })}
              format={(v) => `${formatNumber(v, 1)} %`}
              formatTime={(ms) =>
                new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
              }
              formatTick={(ms) => new Date(ms).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
              markers={[{ t: now + days * DAY, label: t("tools.whatIf.marker", { count: days }) }]}
              includeZero
            />
          </section>
          <section aria-labelledby="whatif-table" className="rounded-lg border border-line bg-surface p-4">
            <h2 id="whatif-table" className="mb-3 font-semibold">
              {t("tools.whatIf.tableTitle")}
            </h2>
            <div className="relative -mx-4 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <caption className="sr-only">{t("tools.whatIf.tableTitle")}</caption>
                <thead>
                  <tr className="border-b border-line text-left text-xs text-fg-muted">
                    <th scope="col" className="px-4 py-1 font-medium">
                      {t("tools.whatIf.col.defer")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("tools.whatIf.col.chance")}
                    </th>
                    <th scope="col" className="py-1 pr-3 text-right font-medium">
                      {t("tools.whatIf.col.expected")}
                    </th>
                    <th scope="col" className="py-1 pr-4 text-right font-medium">
                      {t("tools.whatIf.col.extra")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {TABLE_DAYS.map((d) => {
                    const r = at(d)!;
                    return (
                      <tr key={d} className="border-b border-line last:border-0">
                        <th scope="row" className="px-4 py-1.5 text-left font-normal">
                          {d === 0 ? t("tools.whatIf.now") : t("tools.days", { count: d })}
                        </th>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{pct(r.chance)}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{money(r.expectedCost)}</td>
                        <td className="py-1.5 pr-4 text-right tabular-nums">{money(r.extra)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
