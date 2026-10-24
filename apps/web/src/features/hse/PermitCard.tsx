/**
 * On a work order: its permit to work, and whether work may start. Shown for hazardous work
 * once it's scheduled; inspections and calibrations need no permit and show nothing.
 */
import { useApiQuery } from "@pdm/api-client";
import type { WorkOrder } from "@pdm/contracts";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../shared/format";
import { IssuePermitButton, PermitStatusLabel } from "./PermitsPage";

export function PermitCard({ wo }: { wo: WorkOrder }) {
  const { t } = useTranslation();
  const data = useApiQuery("hse.permits", { workOrderId: wo.id });
  const permit = data.data?.items[0];
  if (!permit) return null;
  return (
    <section aria-labelledby="wo-permit" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="wo-permit" className="mb-2 font-semibold">
        {t("hse.permitCardTitle")}
      </h2>
      <p className="text-sm">
        <span className="font-mono">{permit.id}</span> · {t(`hse.permitType.${permit.type}`)}
      </p>
      <p className="mt-1 flex flex-wrap items-center gap-2 text-sm">
        <PermitStatusLabel status={permit.status} />
        {permit.issuedAt && <span className="text-fg-muted">{formatDate(permit.issuedAt)}</span>}
      </p>
      {permit.status === "requested" && <p className="mt-2 text-sm text-health-warning">{t("hse.cannotStart")}</p>}
      <div className="mt-2">
        <IssuePermitButton permit={permit} />
      </div>
    </section>
  );
}
