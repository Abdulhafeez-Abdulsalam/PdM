/** Asset 360 · Health & prediction: score, remaining life, and the full story of each prediction. */
import { useApiQuery } from "@pdm/api-client";
import type { Asset } from "@pdm/contracts";
import { EmptyState, HealthBadge, Skeleton, cx } from "@pdm/ui";
import { CircleCheck } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { formatNumber, formatProbability } from "../../shared/format";
import { PredictionDetail, RulRange } from "../predictions/PredictionDetail";

export function HealthTab({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const predictions = useApiQuery("predictions.list", { assetId: asset.id });
  const items = predictions.data?.items ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const selectedId = chosen ?? items.find((p) => p.status !== "closed")?.id ?? items[0]?.id ?? null;

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <section className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-4 lg:col-span-4" aria-labelledby="health-summary">
        <h2 id="health-summary" className="font-semibold">{t("assets.healthSummary")}</h2>
        <div className="flex items-center gap-3">
          <span className="text-4xl font-semibold">{formatNumber(asset.health.score)}</span>
          <HealthBadge state={asset.health.state} label={t(`health.${asset.health.state}`)} />
        </div>
        <p className="text-xs text-fg-muted">{t("assets.healthExplain")}</p>
        {asset.rul ? (
          <div>
            <h3 className="mb-1 text-sm font-semibold">{t("prediction.rul")}</h3>
            <RulRange rul={asset.rul} />
          </div>
        ) : (
          <p className="text-sm text-fg-muted">{t("assets.noModel")}</p>
        )}
        {items.length > 1 && (
          <div>
            <h3 className="mb-1 text-sm font-semibold">{t("assets.predictions")}</h3>
            <ul className="flex flex-col gap-1">
              {items.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setChosen(p.id)}
                    aria-pressed={p.id === selectedId}
                    className={cx("w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-sunken", p.id === selectedId && "bg-sunken font-semibold")}
                  >
                    {p.failureMode.label} · {formatProbability(p.probability)}
                    <span className="block text-xs font-normal text-fg-muted">{t(`prediction.status.${p.status}`)}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-line bg-surface p-4 lg:col-span-8" aria-label={t("assets.predictionDetail")}>
        {predictions.isPending ? (
          <Skeleton className="h-64" />
        ) : selectedId ? (
          <PredictionDetail predictionId={selectedId} />
        ) : (
          <EmptyState icon={<CircleCheck className="size-8 text-health-healthy" />} title={t("assets.noPredictions")}>
            {t("assets.noPredictionsHint")}
          </EmptyState>
        )}
      </section>
    </div>
  );
}
