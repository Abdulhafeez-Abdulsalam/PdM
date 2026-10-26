/**
 * Data and integrations (spec §6.14, "is the platform itself healthy?"): where the data comes
 * from and whether it can be trusted. Every prediction is only as good as the readings under it.
 *
 *  - Sources: the systems feeding the platform (plant historian, maintenance system, lab, ERP,
 *    weather), how they connect and whether they're healthy.
 *  - Quality over the last DATA_QUALITY_HOURS, judged per SCAN_MINUTES window: a window with no
 *    reading is a gap; tags that send nothing, send bad-quality values or never change are named.
 *  - Tags: every measured signal with its limits, latest value and any quality issue.
 */
import { z } from "zod";
import { DataQuality, Id, PageParams, ScopeId, Timestamp, page } from "./common";
import { Tag } from "./tags";

export const DATA_QUALITY_HOURS = 24;
/** The historian is expected to have at least one reading per tag in every window this long. */
export const SCAN_MINUTES = 5;
/**
 * A tag is flagged for gaps or bad quality when at least this % of its windows are affected
 * (about 3 of 288): the odd dropped or doubtful reading happens on every real plant.
 */
export const ISSUE_THRESHOLD_PCT = 1;

export const DataSourceKind = z.enum(["historian", "cmms", "lab", "erp", "weather"]);
export type DataSourceKind = z.infer<typeof DataSourceKind>;
export const DataSourceStatus = z.enum(["connected", "degraded", "disconnected"]);
export type DataSourceStatus = z.infer<typeof DataSourceStatus>;

export const DataSource = z.object({
  id: Id,
  kind: DataSourceKind,
  name: z.string(),
  /** How it connects, e.g. "OPC UA", "REST API", "nightly file". */
  protocol: z.string(),
  status: DataSourceStatus,
  lastSync: Timestamp,
  /** Records received in the last DATA_QUALITY_HOURS. */
  records: z.number().int(),
  /** What a record is, e.g. "readings", "work orders". */
  recordKind: z.string(),
  /** Why it isn't healthy, or null. */
  problem: z.string().nullable(),
});
export type DataSource = z.infer<typeof DataSource>;

export const TagIssue = z.enum(["no_data", "flatline", "bad_quality", "gaps"]);
export type TagIssue = z.infer<typeof TagIssue>;

export const DataQualityRequest = z.object({ scopeId: ScopeId.optional() });
export type DataQualityRequest = z.infer<typeof DataQualityRequest>;

export const TagQualityRow = z.object({
  tagId: Id,
  assetId: Id,
  siteId: Id,
  /** The most serious issue: no data, then flatline, then bad quality, then gaps. */
  issue: TagIssue,
  /** % of windows with no reading. */
  missingPct: z.number(),
  /** % of windows whose reading was flagged bad. */
  badPct: z.number(),
});
export type TagQualityRow = z.infer<typeof TagQualityRow>;

export const DataQualityOverview = z.object({
  from: Timestamp,
  to: Timestamp,
  totals: z.object({
    tags: z.number().int(),
    /** Tags with no issue at all. */
    good: z.number().int(),
    /** % of expected readings that arrived. */
    completenessPct: z.number(),
    byIssue: z.object({ no_data: z.number().int(), flatline: z.number().int(), bad_quality: z.number().int(), gaps: z.number().int() }),
  }),
  /** Least complete first. */
  sites: z.array(
    z.object({
      siteId: Id,
      siteName: z.string(),
      tags: z.number().int(),
      completenessPct: z.number(),
      issues: z.number().int(),
    }),
  ),
  /** The worst tags: most serious issue first, then most missing (at most 50). */
  worst: z.array(TagQualityRow),
});
export type DataQualityOverview = z.infer<typeof DataQualityOverview>;

export const TagListParams = PageParams.extend({
  scopeId: ScopeId.optional(),
  /** Tag id, name or description. */
  search: z.string().trim().max(100).optional(),
  issue: TagIssue.optional(),
});
export type TagListParams = z.infer<typeof TagListParams>;

export const TagRow = Tag.extend({
  assetName: z.string(),
  siteId: Id,
  /** null when the tag has sent nothing in the last DATA_QUALITY_HOURS. */
  latest: z.object({ t: Timestamp, value: z.number(), quality: DataQuality }).nullable(),
  issue: TagIssue.nullable(),
});
export type TagRow = z.infer<typeof TagRow>;

export const TagPage = page(TagRow);
