/**
 * Everything about one prediction on one screen (acceptance criterion B):
 * what & how likely → what to do and what it costs → when (RUL) → why (explanation)
 * → how much to trust it (data quality, model) → the evidence (charts).
 * "Users must always see why" (spec §6.4).
 */
import { useApiQuery } from "@pdm/api-client";
import type { RulEstimate } from "@pdm/contracts";
import { Skeleton } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { CircleAlert, CircleCheck, ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { formatCurrency, formatDate, formatNumber, formatProbability } from "../../shared/format";
import { TagCharts } from "../telemetry/TagCharts";

export function PredictionDetail({ predictionId, showEvidence = true }: { predictionId: string; showEvidence?: boolean }) {
  const { t } = useTranslation();
  const prediction = useApiQuery("predictions.get", { predictionId });
  const p = prediction.data;
  const asset = useApiQuery("assets.get", { assetId: p?.assetId ?? "" }, { enabled: Boolean(p) });
  const tags = useApiQuery("assets.tags", { assetId: p?.assetId ?? "" }, { enabled: Boolean(p) });
  const site = useApiQuery("sites.list", {}, { enabled: Boolean(p) });

  if (prediction.isPending)
    return (
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16" />
        ))}
      </div>
    );
  if (!p)
    return (
      <p role="alert" className="text-sm text-health-warning">
        {t("prediction.notFound")}
      </p>
    );

  const evidenceTags = (tags.data?.items ?? []).filter((tg) => p.evidenceTagIds.includes(tg.id));
  const siteTz = site.data?.items.find((s) => s.id === asset.data?.siteId)?.timezone;
  const { interventionCost, failureCost } = p.recommendedAction;

  return (
    <div className="flex flex-col gap-6">
      {/* What, how likely, how sure */}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat
          label={t("prediction.probability")}
          value={formatProbability(p.probability)}
          hint={t("prediction.withinDays", { count: p.horizonDays })}
        />
        <Stat
          label={t("prediction.confidence")}
          value={formatProbability(p.confidence)}
          hint={t(`prediction.confidenceLevel.${confidenceLevel(p.confidence)}`)}
        />
        <Stat label={t("prediction.detected")} value={formatDate(p.detectedAt)} hint={t(`prediction.status.${p.status}`)} />
        <Stat
          label={t("prediction.asset")}
          value={p.assetId}
          mono
          hint={
            <Link
              to="/assets/$assetId"
              params={{ assetId: p.assetId }}
              search={(prev) => ({ ...prev, prediction: undefined })}
              className="inline-flex items-center gap-1 text-accent hover:underline"
            >
              <ExternalLink aria-hidden className="size-3" />
              {t("prediction.openAsset")}
            </Link>
          }
        />
      </dl>

      {/* What to do, and the business case */}
      <Section title={t("prediction.recommendedAction")}>
        <p className="font-medium">{p.recommendedAction.summary}</p>
        <p className="text-sm text-fg-muted">{t("prediction.actBy", { date: formatDate(p.recommendedAction.actBy) })}</p>
        <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-md border border-line p-3">
            <p className="text-fg-muted">{t("prediction.costNow")}</p>
            <p className="text-lg font-semibold">{formatCurrency(interventionCost.amount, interventionCost.currency)}</p>
          </div>
          <div className="rounded-md border border-line p-3">
            <p className="text-fg-muted">{t("prediction.costIfFails")}</p>
            <p className="text-lg font-semibold">{formatCurrency(failureCost.amount, failureCost.currency)}</p>
          </div>
        </div>
        {p.workOrderId && <p className="mt-2 text-sm">{t("prediction.workOrderLinked")}</p>}
      </Section>

      {/* When */}
      {p.rul && (
        <Section title={t("prediction.rul")}>
          <RulRange rul={p.rul} />
        </Section>
      )}

      {/* Why */}
      <Section title={t("prediction.why")} hint={t("prediction.whyHint")}>
        <ul className="flex flex-col gap-2">
          {p.contributions.map((c) => (
            <li key={c.tagId} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 text-sm">
              <span>{c.label}</span>
              <span className="text-fg-muted tabular-nums">{formatProbability(Math.abs(c.weight))}</span>
              <span aria-hidden className="col-span-2 h-1.5 overflow-hidden rounded-full bg-sunken">
                <span className="block h-full rounded-full bg-series-1" style={{ width: `${Math.abs(c.weight) * 100}%` }} />
              </span>
            </li>
          ))}
        </ul>
      </Section>

      {/* How much to trust it */}
      <Section title={t("prediction.trust")}>
        {p.dataQuality.length === 0 ? (
          <p className="flex items-center gap-2 text-sm">
            <CircleCheck aria-hidden className="size-4 text-health-healthy" />
            {t("prediction.noDataIssues")}
          </p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {p.dataQuality.map((f, i) => (
              <li key={i} className="flex items-start gap-2">
                <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-health-warning" />
                <span>
                  <b>{t(`prediction.dq.${f.code}`)}</b> — {f.message}
                  {f.tagId && <span className="ml-1 font-mono text-xs text-fg-muted">{f.tagId}</span>}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-xs text-fg-muted">{t("prediction.model", { model: p.modelId, version: p.modelVersion })}</p>
      </Section>

      {/* The evidence */}
      {showEvidence && (
        <Section title={t("prediction.evidence")} hint={t("prediction.evidenceHint")}>
          {tags.isPending ? (
            <Skeleton className="h-40" />
          ) : (
            <TagCharts tags={evidenceTags} range="30d" siteTimeZone={siteTz} height={160} />
          )}
        </Section>
      )}
    </div>
  );
}

function confidenceLevel(c: number): "high" | "medium" | "low" {
  return c >= 0.8 ? "high" : c >= 0.6 ? "medium" : "low";
}

/**
 * Remaining useful life as a range: the bar spans p10–p90 (80% of outcomes) with a mark at
 * the median. A range, not a single number, because predictions are uncertain.
 */
export function RulRange({ rul }: { rul: RulEstimate }) {
  const { t } = useTranslation();
  const scale = Math.max(rul.p90Days * 1.1, 1);
  const pct = (d: number) => `${(d / scale) * 100}%`;
  return (
    <div>
      <p className="text-sm">
        {t("prediction.rulSentence", { p50: formatNumber(rul.p50Days), p10: formatNumber(rul.p10Days), p90: formatNumber(rul.p90Days) })}
      </p>
      <div aria-hidden className="relative mt-3 h-3 rounded-full bg-sunken">
        <span
          className="absolute inset-y-0 rounded-full bg-series-1 opacity-30"
          style={{ left: pct(rul.p10Days), width: `calc(${pct(rul.p90Days)} - ${pct(rul.p10Days)})` }}
        />
        <span className="absolute -inset-y-1 w-1 rounded-full bg-series-1" style={{ left: pct(rul.p50Days) }} />
      </div>
      <div aria-hidden className="mt-1 flex justify-between text-xs text-fg-muted">
        <span>{t("prediction.today")}</span>
        <span>{t("prediction.days", { count: Math.round(scale) })}</span>
      </div>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold tracking-wide text-fg-muted uppercase">{title}</h3>
      {hint && <p className="mb-2 text-xs text-fg-muted">{hint}</p>}
      <div className="mt-2">{children}</div>
    </section>
  );
}

function Stat({ label, value, hint, mono }: { label: string; value: string; hint?: ReactNode; mono?: boolean }) {
  return (
    <div className="rounded-md border border-line p-3">
      <dt className="text-xs text-fg-muted">{label}</dt>
      <dd className={mono ? "font-mono text-sm font-semibold" : "text-lg font-semibold"}>{value}</dd>
      {hint && <dd className="text-xs text-fg-muted">{hint}</dd>}
    </div>
  );
}
