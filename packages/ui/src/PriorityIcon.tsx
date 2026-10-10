import { BadgeAlert, Info, OctagonX, TriangleAlert, type LucideIcon } from "lucide-react";
import { cx } from "./cx";

export type Priority = "p1" | "p2" | "p3" | "p4";

/** A different shape per alarm priority (ISA-18.2) — readable without colour. */
const ICONS: Record<Priority, LucideIcon> = { p1: OctagonX, p2: TriangleAlert, p3: BadgeAlert, p4: Info };
const TEXT: Record<Priority, string> = { p1: "text-alarm-p1", p2: "text-alarm-p2", p3: "text-alarm-p3", p4: "text-alarm-p4" };

export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const Icon = ICONS[priority];
  return <Icon aria-hidden className={cx("size-4 shrink-0", TEXT[priority], className)} strokeWidth={2.25} />;
}
