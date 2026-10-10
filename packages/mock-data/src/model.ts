/**
 * Internal records of the simulation. These carry extra fields the API never exposes
 * (seeds, templates, links between objects). Handlers turn them into contract shapes.
 */
import type { Asset, DataQualityFlag, HierarchyNode, Site, Tag } from "@pdm/contracts";
import type { AssetClassInfo } from "./catalog/asset-catalog";
import type { FaultType } from "./catalog/fault-types";
import type { SiteDef } from "./catalog/sites";
import type { TagTemplate } from "./catalog/tag-templates";

/** Fixed conditions that don't come from faults. */
export type StaticStatus = "normal" | "standby" | "maintenance" | "offline";

export interface SiteRecord {
  site: Site;
  def: SiteDef;
  seed: number;
}

/** The parts of an Asset that never change. Health, RUL and status are computed per moment. */
export type AssetStatic = Omit<Asset, "health" | "rul" | "operatingStatus">;

export interface AssetRecord {
  data: AssetStatic;
  info: AssetClassInfo;
  site: SiteRecord;
  tags: TagRecord[];
  seed: number;
  /** Size factor for power/flow tags (e.g. a small offshore GT = 0.15). */
  scale: number;
  staticStatus: StaticStatus;
  /** Peaker plants only: which daily run window this unit covers. */
  schedule: "day" | "evening" | null;
  /** Every hierarchy node this asset sits under, plus its own node. */
  scopeIds: ReadonlySet<string>;
  /** Health points lost to age and normal wear (0–8). */
  baseWear: number;
  /** Typical remaining life when healthy, for modelled classes. */
  rulBaseDays: number | null;
}

export interface TagRecord {
  tag: Tag;
  template: TagTemplate;
  asset: AssetRecord;
  /** Base value after applying the asset's scale. */
  base: number;
  seed: number;
  /** A stuck sensor: reports a constant value with "uncertain" quality. */
  flatline: boolean;
}

/** One injected degradation on one asset. */
export interface Fault {
  id: string;
  type: FaultType;
  asset: AssetRecord;
  start: number;
  /** When the asset would fail if nothing is done. */
  failAt: number;
  /** Set when repaired; after this the fault has no effect. */
  resolvedAt: number | null;
  /** How wrong the model's RUL estimate is (−0.15 = 15% pessimistic). */
  rulBias: number;
  dataQuality: DataQualityFlag | null;
}

export interface NodeRecord {
  node: Omit<HierarchyNode, "health" | "healthCounts">;
  childIds: string[];
}
