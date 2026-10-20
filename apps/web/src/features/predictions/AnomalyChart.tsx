/**
 * Anomaly score over the last 30 days with its threshold. Seeing the score creep up — and
 * when it crossed — is often the quickest way to judge whether a prediction is real.
 */
import { useApiQuery } from "@pdm/api-client";
import { TimeSeriesChart, canvasAvailable } from "@pdm/charts";
import { Skeleton } from "@pdm/ui";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { makeTimeFormatter } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { roundedWindow, toIso, useSimNow } from "../../shared/sim-time";

const formatScore = (v: number) => v.toFixed(2);

export function AnomalyChart({ assetId }: { assetId: string }) {
  const { t } = useTranslation();
  const { now } = useSimNow();
  const theme = usePreferences((p) => p.theme);
  const tz = usePreferences((p) => p.timeZone);
  const span = roundedWindow("30d", now);
  const history = useApiQuery("anomalies.history", { assetId, from: toIso(span.from), to: toIso(span.to), maxPoints: 360 });
  const formatTime = useMemo(() => makeTimeFormatter(tz === "site" ? "utc" : tz), [tz]);
  const labels = useMemo(
    () => ({
      value: t("anomaly.score"),
      range: t("telemetry.minMax"),
      quality: t("telemetry.qualityLabel"),
      qualityNames: { good: t("telemetry.quality.good"), uncertain: t("telemetry.quality.uncertain"), bad: t("telemetry.quality.bad") },
    }),
    [t],
  );

  if (history.isPending) return <Skeleton className="h-44" />;
  if (!history.data) return <p className="text-sm text-health-warning">{t("widget.failed")}</p>;

  const { points, threshold, intervalSeconds } = history.data;
  const series = points.map((p) => ({ t: Date.parse(p.t), avg: p.score, min: p.score, max: p.score, quality: "good" as const }));
  const firstAbove = points.find((p) => p.score >= threshold);
  const latest = points.at(-1)?.score ?? 0;
  const summary = t("anomaly.summary", {
    latest: formatScore(latest),
    threshold: formatScore(threshold),
    crossed: firstAbove ? formatTime(Date.parse(firstAbove.t)) : t("anomaly.never"),
  });

  return (
    <figure className="m-0">
      <figcaption className="mb-2 text-sm text-fg-muted">{summary}</figcaption>
      {canvasAvailable() ? (
        <TimeSeriesChart
          points={series}
          intervalMs={intervalSeconds * 1000}
          limits={[{ value: threshold, level: "alarm", label: t("anomaly.threshold") }]}
          height={180}
          themeKey={theme}
          ariaLabel={summary}
          formatValue={formatScore}
          formatTime={formatTime}
          labels={labels}
        />
      ) : null}
    </figure>
  );
}
