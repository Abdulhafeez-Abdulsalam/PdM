import type { ReactNode } from "react";
import { cx } from "./cx";

/** Placeholder shaped like the content, shown while loading (design system §9). */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden className={cx("block animate-pulse rounded-md bg-sunken motion-reduce:animate-none", className)} />;
}

/** Full-width notice: connection lost, demo mode, etc. */
export function Banner({ tone = "info", children }: { tone?: "info" | "warning" | "critical"; children: ReactNode }) {
  const tones = {
    info: "border-line bg-sunken text-fg",
    warning: "border-health-warning text-fg bg-[color-mix(in_srgb,var(--pdm-health-warning)_12%,transparent)]",
    critical: "border-health-critical text-fg bg-[color-mix(in_srgb,var(--pdm-health-critical)_12%,transparent)]",
  } as const;
  return (
    <div role={tone === "info" ? "status" : "alert"} className={cx("flex items-center gap-2 border-b px-4 py-2 text-sm", tones[tone])}>
      {children}
    </div>
  );
}

/** Nothing to show — explain why and what to do. */
export function EmptyState({ title, children, icon }: { title: string; children?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line p-10 text-center">
      {icon && <div className="text-fg-muted">{icon}</div>}
      <p className="font-medium text-fg">{title}</p>
      {children && <div className="max-w-md text-sm text-fg-muted">{children}</div>}
    </div>
  );
}
