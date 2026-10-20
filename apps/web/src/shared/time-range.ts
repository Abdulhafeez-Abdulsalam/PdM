/**
 * App-wide URL state (IA §7): ?range=7d&scope=CBC — valid on every page, so a copied link
 * shows the same time window and the same part of the hierarchy.
 * Invalid values fall back to the default instead of breaking the page.
 */
import { ENTERPRISE_SCOPE } from "@pdm/contracts";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback } from "react";
import { z } from "zod";

export const TIME_RANGES = ["live", "1h", "24h", "7d", "30d"] as const;
export type TimeRange = (typeof TIME_RANGES)[number];
export const DEFAULT_TIME_RANGE: TimeRange = "24h";

// looseObject: keep parameters this schema doesn't know (pages add their own, e.g. alarm filters).
export const globalSearchSchema = z.looseObject({
  range: z.enum(TIME_RANGES).optional().catch(undefined),
  /** Hierarchy node the page is scoped to. Omitted = the whole enterprise. */
  scope: z.string().min(1).max(64).optional().catch(undefined),
  /** Prediction shown in the side panel, on any page — so the panel can be linked to. */
  prediction: z.string().min(1).max(64).optional().catch(undefined),
});
export type GlobalSearch = z.infer<typeof globalSearchSchema>;

const HOUR = 3_600_000;
const DURATION_MS: Record<TimeRange, number> = { live: HOUR, "1h": HOUR, "24h": 24 * HOUR, "7d": 7 * 24 * HOUR, "30d": 30 * 24 * HOUR };

/** The [from, to] window for a range, ending at `now`. "Live" shows the last hour and keeps moving. */
export function rangeWindow(range: TimeRange, now: number): { from: number; to: number } {
  return { from: now - DURATION_MS[range], to: now };
}

/** Current global URL state with defaults filled in. */
export function useGlobalSearch(): { range: TimeRange; scopeId: string } {
  const search = useSearch({ strict: false }) as GlobalSearch;
  return { range: search.range ?? DEFAULT_TIME_RANGE, scopeId: search.scope ?? ENTERPRISE_SCOPE };
}

/** Change global URL state while staying on the current page. */
export function useSetGlobalSearch() {
  const navigate = useNavigate();
  return useCallback(
    (patch: Partial<GlobalSearch>) =>
      void navigate({
        to: ".",
        search: (prev: Record<string, unknown>) => {
          const next = { ...prev, ...patch };
          if (next.scope === ENTERPRISE_SCOPE) delete next.scope; // keep URLs short
          return next;
        },
      }),
    [navigate],
  );
}
