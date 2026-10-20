import type { WorkOrderPriority } from "@pdm/contracts";
import { cx } from "@pdm/ui";
import { ChevronsUp, ChevronUp, Equal, Minus, Siren } from "lucide-react";
import { useTranslation } from "react-i18next";

/** Work-order urgency: icon + word, so it never relies on colour alone. */
const STYLE: Record<WorkOrderPriority, { icon: typeof Siren; className: string }> = {
  emergency: { icon: Siren, className: "text-health-critical font-semibold" },
  urgent: { icon: ChevronsUp, className: "text-health-warning font-semibold" },
  high: { icon: ChevronUp, className: "text-health-degraded" },
  normal: { icon: Equal, className: "text-fg-muted" },
  low: { icon: Minus, className: "text-fg-muted" },
};

export function PriorityLabel({ priority, className }: { priority: WorkOrderPriority; className?: string }) {
  const { t } = useTranslation();
  const { icon: Icon, className: tone } = STYLE[priority];
  return (
    <span className={cx("inline-flex items-center gap-0.5 text-xs", tone, className)}>
      <Icon aria-hidden className="size-3.5" />
      {t(`workOrders.priorities.${priority}`)}
    </span>
  );
}
