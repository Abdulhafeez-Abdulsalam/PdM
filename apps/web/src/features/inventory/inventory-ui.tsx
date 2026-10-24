/** Small pieces both inventory pages use: a stock status in words, and the Order button. */
import { useApiMutation } from "@pdm/api-client";
import type { StockLine, StockStatus } from "@pdm/contracts";
import { Button } from "@pdm/ui";
import { useQueryClient } from "@tanstack/react-query";
import { AlertOctagon, AlertTriangle, CheckCircle2, PackagePlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { formatDate } from "../../shared/format";
import { usePreferences } from "../../shared/preferences";
import { canDo } from "../../shared/roles/roles";
import { useToasts } from "../../shared/toast";

const ICON = { short: AlertOctagon, reorder: AlertTriangle, ok: CheckCircle2, excess: PackagePlus } as const;
const TONE = { short: "text-health-critical", reorder: "text-health-warning", ok: "text-health-healthy", excess: "text-fg-muted" } as const;

export function StockStatusLabel({ status }: { status: StockStatus }) {
  const { t } = useTranslation();
  const Icon = ICON[status];
  return (
    <span className={`inline-flex items-center gap-1 font-medium ${TONE[status]}`}>
      <Icon aria-hidden className="size-3.5" />
      {t(`inventory.status.${status}`)}
    </span>
  );
}

/** "Order 4 by 3 Nov" plus a button, for lines that need it. */
export function Suggestion({ line }: { line: StockLine }) {
  const { t } = useTranslation();
  const role = usePreferences((p) => p.role);
  const client = useQueryClient();
  const toast = useToasts((s) => s.show);
  const order = useApiMutation("inventory.order", {
    onSuccess: (po) => {
      void client.invalidateQueries({ queryKey: ["inventory.overview"] });
      void client.invalidateQueries({ queryKey: ["inventory.part"] });
      toast("success", t("inventory.ordered", { id: po.id, qty: po.quantity, eta: formatDate(po.eta) }));
    },
    onError: (e) => toast("error", e.message),
  });
  if (line.suggestedQty === 0) return <span className="text-fg-muted">—</span>;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <span>
        {t("inventory.suggest", { qty: line.suggestedQty })}
        {line.orderBy && <span className="block text-xs text-fg-muted">{t("inventory.orderBy", { date: formatDate(line.orderBy) })}</span>}
      </span>
      {canDo(role, "inventory.order") && (
        <Button
          size="sm"
          variant={line.status === "short" ? "primary" : "secondary"}
          disabled={order.isPending}
          onClick={() => order.mutate({ partNumber: line.partNumber, siteId: line.siteId, quantity: line.suggestedQty })}
        >
          {t("inventory.order", { qty: line.suggestedQty })}{" "}
          <span className="sr-only">{t("inventory.orderOf", { part: line.partNumber, site: line.siteId })}</span>
        </Button>
      )}
    </span>
  );
}
