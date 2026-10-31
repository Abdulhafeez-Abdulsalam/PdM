/**
 * Building blocks shared by every other contract file.
 *
 * Pattern used throughout this package:
 *   export const Thing = z.object({...});      // the schema: checks data at runtime
 *   export type Thing = z.infer<typeof Thing>;  // the type: checks code at compile time
 * Same name for both is deliberate — TypeScript keeps values and types separate.
 */
import { z } from "zod";

/** Non-empty identifier string. */
export const Id = z.string().min(1);
export type Id = z.infer<typeof Id>;

/** Moment in time, ISO 8601 in UTC, e.g. "2026-10-10T08:30:00Z". All timestamps are UTC (see design system §7). */
export const Timestamp = z.iso.datetime();
export type Timestamp = z.infer<typeof Timestamp>;

/** A probability between 0 (never) and 1 (certain). */
export const Probability = z.number().min(0).max(1);

/** The 7-level health scale (design system §3). Order = increasing concern, then the two "no judgement" states. */
export const HealthState = z.enum(["healthy", "watch", "degraded", "warning", "critical", "offline", "maintenance"]);
export type HealthState = z.infer<typeof HealthState>;

/** How trustworthy a measured value is (standard historian / OPC UA concept). */
export const DataQuality = z.enum(["good", "uncertain", "bad"]);
export type DataQuality = z.infer<typeof DataQuality>;

/** The company's three business lines. */
export const BusinessLine = z.enum(["oil_gas", "gas_to_power", "solar"]);
export type BusinessLine = z.infer<typeof BusinessLine>;

export const GeoPoint = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});
export type GeoPoint = z.infer<typeof GeoPoint>;

/** An amount of money. Currency is an ISO 4217 code, e.g. "USD". */
export const Money = z.object({
  amount: z.number(),
  currency: z.string().length(3),
});
export type Money = z.infer<typeof Money>;

/** Paging for long lists: "give me `limit` items starting at position `offset`". */
export const PageParams = z.object({
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(500).default(50),
});
export type PageParams = z.infer<typeof PageParams>;

/** Wraps any item schema into a page of results: `page(Asset)` → `{ items: Asset[], total, offset, limit }`. */
export const page = <T extends z.ZodType>(item: T) =>
  z.object({
    items: z.array(item),
    /** Total matching items on the server, not just this page. */
    total: z.number().int().min(0),
    offset: z.number().int().min(0),
    limit: z.number().int().min(1),
  });

/** A plain list (no paging) — for small, bounded results. */
export const list = <T extends z.ZodType>(item: T) => z.object({ items: z.array(item) });

/** Every failed request returns this shape. */
export const ApiError = z.object({
  code: z.enum(["bad_request", "unauthenticated", "forbidden", "not_found", "conflict", "too_many_tags", "unavailable", "internal"]),
  message: z.string(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof ApiError>;

/**
 * A node id in the asset hierarchy used to scope a request ("everything under Site A").
 * The root of the whole company is always "enterprise".
 */
export const ScopeId = Id;
export const ENTERPRISE_SCOPE = "enterprise";
