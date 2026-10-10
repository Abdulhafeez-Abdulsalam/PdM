import { z } from "zod";
import { BusinessLine, GeoPoint, HealthState, Id } from "./common";

/**
 * Levels of the asset hierarchy, top to bottom:
 * Enterprise → Region → Business Unit → Site → Area/Unit → Equipment → Component.
 * Sensors are not hierarchy nodes; they are Tags attached to an asset (see tags.ts).
 */
export const HierarchyLevel = z.enum([
  "enterprise",
  "region",
  "business_unit",
  "site",
  "area",
  "equipment",
  "component",
]);
export type HierarchyLevel = z.infer<typeof HierarchyLevel>;

/**
 * How many assets underneath are in each health state. Shown next to the worst state
 * ("Critical · 12") so a large scope isn't reduced to one alarming word.
 */
export const HealthCounts = z.record(HealthState, z.number().int().min(0));
export type HealthCounts = z.infer<typeof HealthCounts>;

/** One box in the hierarchy tree. */
export const HierarchyNode = z.object({
  id: Id,
  level: HierarchyLevel,
  name: z.string().min(1),
  /** null only for the enterprise root. */
  parentId: Id.nullable(),
  /** Worst health of anything underneath, so problems are visible from the top. */
  health: HealthState,
  healthCounts: HealthCounts,
  childCount: z.number().int().min(0),
  /** Set for equipment and component nodes — links to the Asset record. */
  assetId: Id.nullable(),
});
export type HierarchyNode = z.infer<typeof HierarchyNode>;

export const Site = z.object({
  id: Id,
  name: z.string().min(1),
  regionId: Id,
  businessLine: BusinessLine,
  /** IANA time zone, e.g. "Asia/Dubai". Used for "site local" time display. */
  timezone: z.string().min(1),
  location: GeoPoint,
  health: HealthState,
  healthCounts: HealthCounts,
});
export type Site = z.infer<typeof Site>;
