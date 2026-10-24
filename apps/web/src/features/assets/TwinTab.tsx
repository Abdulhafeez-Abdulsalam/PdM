/**
 * Asset 360 → Twin: the asset in its place. The digital twin of its area right now, with this
 * asset outlined, and a link to replay the area's last three days in the full twin.
 */
import { useApiQuery } from "@pdm/api-client";
import type { Asset } from "@pdm/contracts";
import { Skeleton } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { TwinView } from "../twin/TwinView";

export function TwinTab({ asset }: { asset: Asset }) {
  const { t } = useTranslation();
  const twin = useApiQuery("twin.area", { areaId: asset.areaId, hoursAgo: 0 }, { refetchInterval: 30_000 });
  if (twin.isPending) return <Skeleton className="h-96" />;
  if (!twin.data) return <p className="text-health-warning">{t("widget.failed")}</p>;
  const area = twin.data;
  return (
    <section aria-labelledby="twin-tab" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="twin-tab" className="font-semibold">
        {t("twin.areaTitle", { area: area.areaName, site: area.siteName })}
      </h2>
      <p className="mb-3 text-sm text-fg-muted">
        {t("twin.tabIntro", { id: asset.id })}{" "}
        <Link to="/twin" search={{ site: asset.siteId, area: asset.areaId, focus: asset.id }} className="text-accent underline">
          {t("twin.replayLink")}
        </Link>
      </p>
      <TwinView area={area} highlight={asset.id} />
    </section>
  );
}
