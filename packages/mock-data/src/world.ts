/**
 * Builds the static "world": regions, sites, the hierarchy, every asset and tag, the people,
 * and the faults that are already developing when the simulation starts.
 * Same seed + same start time → exactly the same world.
 */
import {
  ENTERPRISE_SCOPE,
  RoleId,
  type AssetClass,
  type DataQualityFlag,
  type HierarchyLevel,
  type TagLimits,
  type User,
} from "@pdm/contracts";
import { ASSET_CLASSES } from "./catalog/asset-catalog";
import { FAULT_TYPES, faultTypeById, type FaultType } from "./catalog/fault-types";
import { FIRST_NAMES, LAST_NAMES, ROLE_TITLES } from "./catalog/people";
import { REGIONS, SITES, STORYLINE_ASSET_ID } from "./catalog/sites";
import { TAG_TEMPLATES, type TagTemplate } from "./catalog/tag-templates";
import { DAY, iso } from "./clock";
import type { AssetRecord, Fault, NodeRecord, SiteRecord, StaticStatus, TagRecord } from "./model";
import { Rng, hashString } from "./random";

const DEFAULT_LIMITS = [0.08, 0.15, 0.25] as const;
/** Share of assets that already have a developing fault at start. */
const FAULT_RATE = 0.06;
const FAULT_RATE_STRINGS = 0.025;

export class World {
  readonly sites = new Map<string, SiteRecord>();
  readonly assets = new Map<string, AssetRecord>();
  readonly tags = new Map<string, TagRecord>();
  readonly nodes = new Map<string, NodeRecord>();
  readonly users: User[] = [];
  readonly faults: Fault[] = [];
  /** Hierarchy node id → every asset underneath it. */
  readonly assetsInScope = new Map<string, AssetRecord[]>();
  private faultsByAsset = new Map<string, Fault[]>();
  private nextFaultNumber = 1;

  constructor(
    readonly seed: number,
    readonly createdAt: number,
  ) {}

  faultsOf(assetId: string): readonly Fault[] {
    return this.faultsByAsset.get(assetId) ?? [];
  }

  addFault(fault: Omit<Fault, "id">): Fault {
    const full: Fault = { ...fault, id: `F-${String(this.nextFaultNumber++).padStart(4, "0")}` };
    this.faults.push(full);
    const list = this.faultsByAsset.get(full.asset.data.id) ?? [];
    list.push(full);
    this.faultsByAsset.set(full.asset.data.id, list);
    return full;
  }

  scopeAssets(scopeId: string): AssetRecord[] {
    return this.assetsInScope.get(scopeId) ?? [];
  }

  usersWithRole(role: RoleId): User[] {
    return this.users.filter((u) => u.role === role);
  }
}

export function buildWorld(seed: number, now: number): World {
  const world = new World(seed, now);
  buildUsers(world);
  buildHierarchy(world, now);
  assignFaults(world, now);
  addPlantScenery(world, now);
  return world;
}

// ─── People ───────────────────────────────────────────────────────────────────

function buildUsers(world: World): void {
  const rng = Rng.for(world.seed, "users");
  const used = new Set<string>();
  const regionIds = REGIONS.map((r) => r.id);
  let n = 1;
  for (const role of RoleId.options) {
    for (let i = 0; i < 4; i++) {
      let name: string;
      do name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
      while (used.has(name));
      used.add(name);
      const regionId = regionIds[i % regionIds.length] as string;
      const siteIds = SITES.filter((s) => s.regionId === regionId).map((s) => s.code);
      world.users.push({
        id: `U-${String(n++).padStart(3, "0")}`,
        name,
        role,
        title: ROLE_TITLES[role],
        crewId: role === "field_technician" ? `CREW-${regionId.slice(2)}` : null,
        siteIds: role === "executive" || role === "system_admin" ? [] : siteIds,
      });
    }
  }
}

// ─── Hierarchy, assets, tags ──────────────────────────────────────────────────

function addNode(
  world: World,
  id: string,
  level: HierarchyLevel,
  name: string,
  parentId: string | null,
  assetId: string | null = null,
): void {
  world.nodes.set(id, { node: { id, level, name, parentId, childCount: 0, assetId }, childIds: [] });
  if (parentId) {
    const parent = world.nodes.get(parentId);
    if (!parent) throw new Error(`Missing parent node ${parentId}`);
    parent.childIds.push(id);
    parent.node.childCount++;
  }
}

function buildHierarchy(world: World, now: number): void {
  const rng = Rng.for(world.seed, "assets");
  addNode(world, ENTERPRISE_SCOPE, "enterprise", "Enterprise", null);

  for (const region of REGIONS) {
    addNode(world, region.id, "region", region.name, ENTERPRISE_SCOPE);
  }

  for (const def of SITES) {
    const buId = `BU-${def.regionId.slice(2)}-${def.businessUnit.replace(/\s+/g, "").toUpperCase()}`;
    if (!world.nodes.has(buId)) addNode(world, buId, "business_unit", def.businessUnit, def.regionId);
    addNode(world, def.code, "site", def.name, buId);

    const siteRecord: SiteRecord = {
      def,
      seed: hashString(`${world.seed}:${def.code}`),
      site: {
        id: def.code,
        name: def.name,
        regionId: def.regionId,
        businessLine: def.businessLine,
        timezone: def.timezone,
        location: { lat: def.lat, lon: def.lon },
        // Both replaced per moment by the snapshot:
        health: "healthy",
        healthCounts: { healthy: 0, watch: 0, degraded: 0, warning: 0, critical: 0, offline: 0, maintenance: 0 },
      },
    };
    world.sites.set(def.code, siteRecord);
    buildSiteAssets(world, siteRecord, rng, now);
  }

  // Index: for each node, every asset beneath it.
  for (const asset of world.assets.values()) {
    for (const scopeId of asset.scopeIds) {
      const list = world.assetsInScope.get(scopeId) ?? [];
      list.push(asset);
      world.assetsInScope.set(scopeId, list);
    }
  }
}

function buildSiteAssets(world: World, site: SiteRecord, rng: Rng, now: number): void {
  const def = site.def;
  const counters = new Map<AssetClass, number>();
  const ancestors = ancestorIds(world, def.code);

  for (const area of def.areas) {
    const areaId = `${def.code}-${area.code}`;
    addNode(world, areaId, "area", area.name, def.code);
    const areaOffset = { lat: rng.between(-0.02, 0.02), lon: rng.between(-0.02, 0.02) };
    const inverters: AssetRecord[] = [];
    let stringIndex = 0;

    for (const [assetClass, count, scale = 1] of area.assets) {
      const info = ASSET_CLASSES[assetClass];
      for (let i = 0; i < count; i++) {
        const number = (counters.get(assetClass) ?? 100) + 1;
        counters.set(assetClass, number);
        const id = `${def.code}-${info.code}-${number}`;

        // PV strings hang under their inverter (6 per inverter) as "component" nodes.
        const parent = assetClass === "pv_string" ? inverters[Math.floor(stringIndex++ / 6) % Math.max(inverters.length, 1)] : undefined;
        const parentNodeId = parent ? parent.data.id : areaId;
        addNode(world, id, parent ? "component" : "equipment", `${info.label} ${id}`, parentNodeId, id);

        const asset = makeAsset(world, site, rng, now, {
          id,
          assetClass,
          areaId,
          scale: scale * rng.between(0.92, 1.08),
          parentAssetId: parent?.data.id ?? null,
          scopeIds: new Set([...ancestors, areaId, ...(parent ? [parent.data.id] : []), id]),
          location: {
            lat: round(def.lat + areaOffset.lat + rng.between(-0.004, 0.004), 5),
            lon: round(def.lon + areaOffset.lon + rng.between(-0.004, 0.004), 5),
          },
        });
        world.assets.set(id, asset);
        if (assetClass === "inverter") inverters.push(asset);
      }
    }
  }
}

function ancestorIds(world: World, nodeId: string): string[] {
  const ids: string[] = [];
  let current = world.nodes.get(nodeId);
  while (current) {
    ids.unshift(current.node.id);
    current = current.node.parentId ? world.nodes.get(current.node.parentId) : undefined;
  }
  return ids;
}

interface NewAsset {
  id: string;
  assetClass: AssetClass;
  areaId: string;
  scale: number;
  parentAssetId: string | null;
  scopeIds: Set<string>;
  location: { lat: number; lon: number };
}

function makeAsset(world: World, site: SiteRecord, rng: Rng, now: number, a: NewAsset): AssetRecord {
  const info = ASSET_CLASSES[a.assetClass];
  const [maker, models] = rng.pick(info.makers);
  const ageYears = site.def.businessLine === "solar" ? rng.between(1, 9) : rng.between(3, 28);

  const asset: AssetRecord = {
    info,
    site,
    seed: hashString(`${world.seed}:${a.id}`),
    scale: a.scale,
    tags: [],
    staticStatus: pickStaticStatus(rng, a.assetClass, a.id),
    schedule:
      site.def.profile === "peaker" && ["gas_turbine", "recip_engine", "generator"].includes(a.assetClass)
        ? rng.chance(0.6)
          ? "day"
          : "evening"
        : null,
    scopeIds: a.scopeIds,
    baseWear: rng.between(0, 8),
    rulBaseDays: info.modelled ? Math.round(rng.between(250, 1500)) : null,
    data: {
      id: a.id,
      name: `${info.label} ${a.id}`,
      assetClass: a.assetClass,
      businessLine: site.def.businessLine,
      siteId: site.def.code,
      areaId: a.areaId,
      parentAssetId: a.parentAssetId,
      manufacturer: maker,
      model: rng.pick(models),
      serialNumber: `${info.code}${rng.int(100000, 999999)}`,
      commissionedAt: iso(now - ageYears * 365 * DAY),
      criticality: rng.int(info.criticality[0], info.criticality[1]),
      location: a.location,
    },
  };

  for (const template of TAG_TEMPLATES[a.assetClass]) {
    const base = template.scaled ? template.base * a.scale : template.base;
    const id = `${a.id}.${template.name}`;
    const tag: TagRecord = {
      asset,
      template,
      base,
      seed: hashString(`${world.seed}:${id}`),
      flatline: rng.chance(0.004),
      tag: {
        id,
        assetId: a.id,
        name: template.name,
        description: template.description,
        quantity: template.quantity,
        limits: limitsFor(template, base),
      },
    };
    asset.tags.push(tag);
    world.tags.set(id, tag);
  }
  return asset;
}

function pickStaticStatus(rng: Rng, assetClass: AssetClass, id: string): StaticStatus {
  if (id === STORYLINE_ASSET_ID) return "normal";
  const roll = rng.next();
  if (roll < 0.012) return "offline";
  if (roll < 0.022) return "maintenance";
  if (assetClass === "pump" && roll < 0.17) return "standby"; // installed spares
  return "normal";
}

export function limitsFor(template: TagTemplate, base: number): TagLimits {
  if (!template.bad) return {};
  const [alert, alarm, trip] = template.limits ?? DEFAULT_LIMITS;
  const at = (fraction: number) => round(template.bad === "high" ? base * (1 + fraction) : base * (1 - fraction), 4);
  return template.bad === "high"
    ? { highAlert: at(alert), highAlarm: at(alarm), highTrip: at(trip) }
    : { lowAlert: at(alert), lowAlarm: at(alarm), lowTrip: at(trip) };
}

// ─── Faults already in progress at start ─────────────────────────────────────

const DQ_FLAGS: readonly (readonly [DataQualityFlag["code"], string])[] = [
  ["sensor_drift", "Sensor shows slow drift against redundant measurement"],
  ["missing_data", "Gaps in the last 24 h of data"],
  ["flatline", "Signal unchanged for an unusually long time"],
  ["stale_data", "Last update older than expected scan rate"],
];

function assignFaults(world: World, now: number): void {
  const rng = Rng.for(world.seed, "faults");
  for (const asset of world.assets.values()) {
    if (asset.data.id === STORYLINE_ASSET_ID || asset.staticStatus !== "normal") continue;
    const candidates = FAULT_TYPES.filter((f) => f.appliesTo.includes(asset.data.assetClass));
    if (candidates.length === 0) continue;
    const rate = asset.data.assetClass === "pv_string" ? FAULT_RATE_STRINGS : FAULT_RATE;
    if (!rng.chance(rate)) continue;

    const type = rng.pick(candidates);
    const progressNow = rng.between(0.08, 0.93);
    const durationDays = rng.between(12, 120);
    const start = now - progressNow * durationDays * DAY;
    world.addFault({
      type,
      asset,
      start,
      failAt: start + durationDays * DAY,
      resolvedAt: null,
      rulBias: rng.between(-0.15, 0.15),
      dataQuality: rng.chance(0.2) ? makeDqFlag(rng, asset, type) : null,
    });
  }
}

/**
 * A few hand-placed conditions so the operations screens have something to show besides the
 * storyline: a gas turbine whose compressor is fouling now, one that was washed five days ago
 * (its trend shows the rise and the recovery), a transformer with a growing hot spot, and at
 * the first solar plant an inverter whose cooling is failing, a string with failed bypass
 * diodes, and a battery whose cells are drifting apart.
 */
const PLANT_SCENERY: readonly { assetId: string; faultTypeId: string; startDaysAgo: number; days: number; resolvedDaysAgo?: number }[] = [
  { assetId: "EBC-GT-101", faultTypeId: "compressor_fouling", startDaysAgo: 16, days: 30 },
  { assetId: "ANP-GT-102", faultTypeId: "compressor_fouling", startDaysAgo: 19, days: 30, resolvedDaysAgo: 5 },
  { assetId: "ANP-TX-104", faultTypeId: "transformer_gassing", startDaysAgo: 70, days: 110 },
  { assetId: "PCS-INV-117", faultTypeId: "inverter_cooling", startDaysAgo: 30, days: 55 },
  { assetId: "PCS-STR-150", faultTypeId: "string_underperformance", startDaysAgo: 40, days: 60 },
  { assetId: "PCS-BESS-102", faultTypeId: "cell_imbalance", startDaysAgo: 50, days: 100 },
];

function addPlantScenery(world: World, now: number): void {
  for (const s of PLANT_SCENERY) {
    const asset = world.assets.get(s.assetId);
    if (!asset || asset.staticStatus !== "normal" || world.faultsOf(s.assetId).length > 0) continue;
    const start = now - s.startDaysAgo * DAY;
    world.addFault({
      type: faultTypeById(s.faultTypeId),
      asset,
      start,
      failAt: start + s.days * DAY,
      resolvedAt: s.resolvedDaysAgo === undefined ? null : now - s.resolvedDaysAgo * DAY,
      rulBias: 0,
      dataQuality: null,
    });
  }
}

function makeDqFlag(rng: Rng, asset: AssetRecord, type: FaultType): DataQualityFlag {
  const [code, message] = rng.pick(DQ_FLAGS);
  const effect = rng.pick(type.effects);
  return { code, message, tagId: `${asset.data.id}.${effect.tag}` };
}

export function round(value: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
