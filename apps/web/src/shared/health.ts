import type { HealthCounts, HealthState } from "@pdm/contracts";
import type { TFunction } from "i18next";

/**
 * Label for a group's health: the worst state plus how many assets are in it —
 * "Critical · 12" — so a big scope isn't reduced to one alarming word (IA decision (a)).
 * A single asset, or an all-healthy group, just gets the state.
 */
export function groupHealthLabel(t: TFunction, state: HealthState, counts?: HealthCounts): string {
  const name = t(`health.${state}`);
  if (!counts || state === "healthy") return name;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const inState = counts[state];
  if (total <= 1 || inState === 0) return name;
  return t("health.groupCount", { state: name, count: inState });
}
