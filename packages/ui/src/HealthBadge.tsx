import { CircleCheck, CircleSlash, Eye, OctagonX, TrendingDown, TriangleAlert, Wrench, type LucideIcon } from "lucide-react";
import { cx } from "./cx";

export type Health = "healthy" | "watch" | "degraded" | "warning" | "critical" | "offline" | "maintenance";

/** Every health state has its own icon so colour is never the only signal (design system §3). */
const ICONS: Record<Health, LucideIcon> = {
  healthy: CircleCheck,
  watch: Eye,
  degraded: TrendingDown,
  warning: TriangleAlert,
  critical: OctagonX,
  offline: CircleSlash,
  maintenance: Wrench,
};

const TEXT: Record<Health, string> = {
  healthy: "text-health-healthy",
  watch: "text-health-watch",
  degraded: "text-health-degraded",
  warning: "text-health-warning",
  critical: "text-health-critical",
  offline: "text-health-offline",
  maintenance: "text-health-maintenance",
};

export interface HealthBadgeProps {
  state: Health;
  /** Translated label, e.g. t("health.critical"). Always given — in compact mode it becomes the tooltip and screen-reader text. */
  label: string;
  compact?: boolean;
  className?: string;
}

/** The only way to show health in the app. */
export function HealthBadge({ state, label, compact, className }: HealthBadgeProps) {
  const Icon = ICONS[state];
  return (
    <span className={cx("inline-flex items-center gap-1 text-xs font-medium", TEXT[state], className)} title={compact ? label : undefined}>
      <Icon aria-hidden className="size-4 shrink-0" strokeWidth={2.25} />
      <span className={compact ? "sr-only" : undefined}>{label}</span>
    </span>
  );
}
