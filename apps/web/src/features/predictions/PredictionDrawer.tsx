/**
 * The prediction side panel. Opens on any page when the URL has ?prediction=…, so one click
 * from a top-risk row or an asset page shows the full story — and the panel can be linked to.
 */
import { useApiQuery } from "@pdm/api-client";
import { Sheet, Skeleton } from "@pdm/ui";
import { useSearch } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { useTranslation } from "react-i18next";
import { useSetGlobalSearch, type GlobalSearch } from "../../shared/time-range";

// The panel's contents (and the chart library they use) load on first open.
const PredictionDetail = lazy(() => import("./PredictionDetail").then((m) => ({ default: m.PredictionDetail })));

export function PredictionDrawer() {
  const { t } = useTranslation();
  const { prediction: predictionId } = useSearch({ strict: false }) as GlobalSearch;
  const setSearch = useSetGlobalSearch();
  const prediction = useApiQuery("predictions.get", { predictionId: predictionId ?? "" }, { enabled: Boolean(predictionId) });

  return (
    <Sheet
      open={Boolean(predictionId)}
      onOpenChange={(open) => !open && setSearch({ prediction: undefined })}
      closeLabel={t("prediction.close")}
      title={prediction.data ? prediction.data.failureMode.label : t("prediction.title")}
      description={prediction.data ? t("prediction.subtitle", { asset: prediction.data.assetId, id: prediction.data.id }) : undefined}
    >
      {predictionId && (
        <Suspense fallback={<Skeleton className="h-64" />}>
          <PredictionDetail predictionId={predictionId} />
        </Suspense>
      )}
    </Sheet>
  );
}
