import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import type { ReactNode } from "react";
import { cx } from "./cx";
import { Sparkline } from "./Sparkline";

export interface KpiCardProps {
  label: string;
  /** Already formatted, e.g. "98.4". */
  value: string;
  unit?: string;
  /** Already formatted, e.g. "+1.2% vs 30 days ago". */
  change?: string;
  /** "good" / "bad" colours the change; "neutral" leaves it grey. Up isn't always good (think MTTR). */
  changeTone?: "good" | "bad" | "neutral";
  changeDirection?: "up" | "down" | "flat";
  trend?: readonly number[];
  /** e.g. "Target 97 %" */
  target?: string;
  /** Extra info shown on hover/focus — where the number comes from. */
  lineage?: string;
  footer?: ReactNode;
}

const TONE = { good: "text-health-healthy", bad: "text-health-warning", neutral: "text-fg-muted" } as const;
const ARROW = { up: ArrowUpRight, down: ArrowDownRight, flat: ArrowRight } as const;

export function KpiCard({ label, value, unit, change, changeTone = "neutral", changeDirection = "flat", trend, target, lineage, footer }: KpiCardProps) {
  const Arrow = ARROW[changeDirection];
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-lg border border-line bg-surface p-3" title={lineage}>
      <p className="truncate text-xs font-medium text-fg-muted">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold leading-none tabular-nums">
          {value}
          {unit && <span className="ml-1 text-sm font-normal text-fg-muted">{unit}</span>}
        </p>
        {trend && <Sparkline values={trend} className="shrink-0 text-fg-muted" width={72} height={24} />}
      </div>
      {change && (
        <p className={cx("flex items-center gap-0.5 text-xs", TONE[changeTone])}>
          <Arrow aria-hidden className="size-3.5" />
          {change}
        </p>
      )}
      {target && <p className="text-xs text-fg-muted">{target}</p>}
      {footer}
    </div>
  );
}
