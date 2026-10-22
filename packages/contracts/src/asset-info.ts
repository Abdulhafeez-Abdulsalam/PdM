/**
 * Three more Asset 360 tabs (spec §6.2): Documents, Related assets, Comments.
 */
import { z } from "zod";
import { AssetClass, OperatingStatus } from "./assets";
import { HealthState, Id, Timestamp } from "./common";

// ─── Documents ───────────────────────────────────────────────────────────────

/** Manuals, P&IDs (piping and instrumentation diagrams), datasheets, OEM bulletins and the like. */
export const DocumentKind = z.enum(["manual", "pid", "datasheet", "procedure", "oem_bulletin", "certificate"]);
export type DocumentKind = z.infer<typeof DocumentKind>;

/**
 * A document's record from the document management system. The file itself stays there;
 * in this demo there is no file, only the record.
 */
export const AssetDocument = z.object({
  id: Id,
  kind: DocumentKind,
  title: z.string().min(1),
  /** The document number, e.g. "CBC-GT-101-PID-002". */
  number: z.string().min(1),
  revision: z.string().min(1),
  issuedAt: Timestamp,
  /** Written by the equipment maker, or by the site. */
  source: z.enum(["oem", "site"]),
  /** Applies to every asset of this type (an OEM manual), or only to this one (its P&ID sheet). */
  scope: z.enum(["class", "asset"]),
  sizeKb: z.number().int().positive(),
});
export type AssetDocument = z.infer<typeof AssetDocument>;

// ─── Related assets ──────────────────────────────────────────────────────────

/** Just enough about another asset to list it and link to it. */
export const AssetRef = z.object({
  id: Id,
  name: z.string(),
  assetClass: AssetClass,
  healthState: HealthState,
  healthScore: z.number().min(0).max(100),
  operatingStatus: OperatingStatus,
});
export type AssetRef = z.infer<typeof AssetRef>;

const RelatedGroup = z.object({
  /** At most RELATED_LIMIT shown… */
  items: z.array(AssetRef),
  /** …out of this many. */
  total: z.number().int().min(0),
});

export const RELATED_LIMIT = 24;

export const RelatedAssets = z.object({
  /** The equipment this one is part of (a PV string's combiner box). */
  parent: AssetRef.nullable(),
  /** Its parts. */
  children: RelatedGroup,
  /** Other equipment in the same plant area. */
  sameArea: RelatedGroup,
  /** The same type of equipment at the same site: the natural ones to compare with. */
  sisters: RelatedGroup,
});
export type RelatedAssets = z.infer<typeof RelatedAssets>;

// ─── Comments ────────────────────────────────────────────────────────────────

export const COMMENT_MAX = 2000;

export const AssetComment = z.object({
  id: Id,
  assetId: Id,
  authorId: Id,
  body: z.string().min(1).max(COMMENT_MAX),
  /** People named with "@Full Name" in the body; the server works these out. */
  mentions: z.array(Id),
  createdAt: Timestamp,
});
export type AssetComment = z.infer<typeof AssetComment>;

export const AddCommentRequest = z.object({
  assetId: Id,
  body: z.string().trim().min(1).max(COMMENT_MAX),
});
export type AddCommentRequest = z.infer<typeof AddCommentRequest>;
