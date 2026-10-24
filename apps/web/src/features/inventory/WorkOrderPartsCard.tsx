/**
 * On a work order: the parts it will use and whether its site has them, so the planner sees a
 * missing part before the technician goes out. Once the work is closed out, the parts have been
 * taken out of stock. Nothing is shown for work that uses no known parts.
 */
import { useApiQuery } from "@pdm/api-client";
import type { WorkOrder } from "@pdm/contracts";
import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { StockStatusLabel } from "./inventory-ui";

export function WorkOrderPartsCard({ wo }: { wo: WorkOrder }) {
  const { t } = useTranslation();
  const data = useApiQuery("inventory.workOrderParts", { workOrderId: wo.id });
  const parts = data.data?.parts ?? [];
  if (parts.length === 0) return null;
  return (
    <section aria-labelledby="wo-parts" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="wo-parts" className="mb-1 font-semibold">
        {t("inventory.woTitle")}
      </h2>
      <p className="mb-2 text-sm text-fg-muted">{t(data.data?.issued ? "inventory.woIssued" : "inventory.woIntro")}</p>
      <ul className="flex flex-col gap-2 text-sm">
        {parts.map((p) => (
          <li key={p.partNumber}>
            <span className="font-medium">{t("inventory.woPart", { qty: p.quantity, description: p.description })}</span>{" "}
            <Link
              to="/inventory/parts/$partNumber"
              params={{ partNumber: p.partNumber }}
              className="font-mono text-xs text-accent underline"
            >
              {p.partNumber}
            </Link>
            {!data.data?.issued && (
              <span className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                <StockStatusLabel status={p.status} />
                <span className="text-fg-muted">{t("inventory.woOnHand", { count: p.onHand, site: data.data?.siteId })}</span>
              </span>
            )}
          </li>
        ))}
      </ul>
      {!data.data?.issued && parts.some((p) => p.onHand < p.quantity) && (
        <p className="mt-2 text-sm font-medium text-health-warning">{t("inventory.woNotEnough")}</p>
      )}
    </section>
  );
}
