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

/** `iconOnly` for tight spaces (calendar chips): the word is still there for screen readers. */
export function PriorityLabel({ priority, className, iconOnly }: { priority: WorkOrderPriority; className?: string; iconOnly?: boolean }) {
  const { t } = useTranslation();
  const { icon: Icon, className: tone } = STYLE[priority];
  const word = t(`workOrders.priorities.${priority}`);
  return (
    <span className={cx("inline-flex shrink-0 items-center gap-0.5 text-xs", tone, className)} title={iconOnly ? word : undefined}>
      <Icon aria-hidden className="size-3.5" />
      <span className={iconOnly ? "sr-only" : undefined}>{word}</span>
    </span>
  );
}
