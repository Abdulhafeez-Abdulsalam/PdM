/**
 * Asset 360's Documents, Related and Comments tabs: document records generated from the asset
 * class, related assets from the hierarchy, and an in-memory comment store.
 */
import {
  RELATED_LIMIT,
  type AddCommentRequest,
  type AssetClass,
  type AssetComment,
  type AssetDocument,
  type AssetRef,
  type RelatedAssets,
  type User,
} from "@pdm/contracts";
import { DAY, HOUR, iso } from "./clock";
import { ApiFailure } from "./errors";
import type { AssetRecord } from "./model";
import { Rng } from "./random";
import type { Snapshot } from "./snapshot";
import type { World } from "./world";

// ─── Documents ───────────────────────────────────────────────────────────────

/** Equipment that holds pressure has statutory inspection certificates (API 510 / 570 / 653). */
const INSPECTED: Partial<Record<AssetClass, string>> = {
  pressure_vessel: "API 510",
  separator: "API 510",
  heat_exchanger: "API 510",
  fired_heater: "API 510",
  pipeline_segment: "API 570",
  storage_tank: "API 653",
  psv: "API 576",
};
/** Rotating and electrical equipment gets service bulletins from its maker. */
const BULLETIN_TOPICS: Partial<Record<AssetClass, readonly string[]>> = {
  gas_turbine: ["Combustor liner inspection interval", "Compressor blade tip clearance check"],
  steam_turbine: ["Governor valve stem wear"],
  compressor: ["Dry gas seal upgrade kit", "Thrust bearing temperature limits revised"],
  pump: ["Mechanical seal flush plan update"],
  esp: ["Motor lead extension insulation"],
  generator: ["Stator end-winding inspection"],
  inverter: ["Firmware update: grid-fault ride-through", "IGBT module derating curve"],
  transformer: ["Bushing power-factor testing"],
  recip_engine: ["Spark plug service life extended"],
};
const REVISIONS = ["A", "B", "C", "D", "E"];

export function documentsFor(asset: AssetRecord, now: number): AssetDocument[] {
  const rng = Rng.for(asset.seed, `documents:${asset.data.id}`);
  const { manufacturer, model, assetClass, id, siteId } = asset.data;
  const label = asset.info.label;
  const date = (minDays: number, maxDays: number) => iso(Math.floor((now - rng.between(minDays, maxDays) * DAY) / DAY) * DAY);
  const doc = (n: number, d: Omit<AssetDocument, "id" | "sizeKb">): AssetDocument => ({
    ...d,
    id: `DOC-${id}-${n}`,
    sizeKb: rng.int(180, 24_000),
  });

  const sheet = rng.int(1, 40);
  const docs: AssetDocument[] = [
    doc(1, {
      kind: "manual",
      title: `${manufacturer} ${model} operation and maintenance manual`,
      number: `${manufacturer.slice(0, 3).toUpperCase()}-${model.replace(/\W/g, "")}-OM`,
      revision: rng.pick(REVISIONS),
      issuedAt: date(400, 3000),
      source: "oem",
      scope: "class",
    }),
    doc(2, {
      kind: "datasheet",
      title: `${model} datasheet`,
      number: `${manufacturer.slice(0, 3).toUpperCase()}-${model.replace(/\W/g, "")}-DS`,
      revision: rng.pick(REVISIONS),
      issuedAt: date(400, 3000),
      source: "oem",
      scope: "class",
    }),
    doc(3, {
      kind: "pid",
      title: `P&ID sheet ${sheet}: ${label} ${id}`,
      number: `${siteId}-${id}-PID-${String(sheet).padStart(3, "0")}`,
      revision: String(rng.int(0, 6)),
      issuedAt: date(60, 1500),
      source: "site",
      scope: "asset",
    }),
    doc(4, {
      kind: "procedure",
      title: `Preventive maintenance procedure: ${label.toLowerCase()}`,
      number: `${siteId}-PM-${asset.info.code}-001`,
      revision: rng.pick(REVISIONS),
      issuedAt: date(90, 900),
      source: "site",
      scope: "class",
    }),
  ];

  const code = INSPECTED[assetClass];
  if (code) {
    docs.push(
      doc(5, {
        kind: "certificate",
        title: `${code} inspection certificate: ${id}`,
        number: `${siteId}-${id}-INSP-${new Date(now).getUTCFullYear() - rng.int(0, 2)}`,
        revision: "0",
        issuedAt: date(30, 700),
        source: "site",
        scope: "asset",
      }),
    );
  }
  for (const [i, topic] of (BULLETIN_TOPICS[assetClass] ?? []).entries()) {
    if (!rng.chance(0.7)) continue;
    docs.push(
      doc(6 + i, {
        kind: "oem_bulletin",
        title: `Service bulletin: ${topic}`,
        number: `SB-${rng.int(1000, 9999)}`,
        revision: "0",
        issuedAt: date(20, 600),
        source: "oem",
        scope: "class",
      }),
    );
  }
  return docs.sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
}

// ─── Related assets ──────────────────────────────────────────────────────────

export function relatedFor(world: World, snapshot: Snapshot, asset: AssetRecord): RelatedAssets {
  const ref = (a: AssetRecord): AssetRef => {
    const c = snapshot.conditions.get(a.data.id);
    return {
      id: a.data.id,
      name: a.data.name,
      assetClass: a.data.assetClass,
      healthState: c?.health.state ?? "offline",
      healthScore: c?.health.score ?? 0,
      operatingStatus: c?.status ?? "stopped",
    };
  };
  // Worst health first: the ones most worth a look.
  const group = (list: AssetRecord[]) => ({
    items: list
      .map(ref)
      .sort((a, b) => a.healthScore - b.healthScore || a.id.localeCompare(b.id))
      .slice(0, RELATED_LIMIT),
    total: list.length,
  });

  const all = [...world.assets.values()];
  const parent = asset.data.parentAssetId ? world.assets.get(asset.data.parentAssetId) : undefined;
  const children = all.filter((a) => a.data.parentAssetId === asset.data.id);
  const family = new Set([asset.data.id, parent?.data.id, ...children.map((c) => c.data.id)]);
  return {
    parent: parent ? ref(parent) : null,
    children: group(children),
    sameArea: group(all.filter((a) => a.data.areaId === asset.data.areaId && !family.has(a.data.id))),
    sisters: group(
      all.filter((a) => a.data.assetClass === asset.data.assetClass && a.data.siteId === asset.data.siteId && a.data.id !== asset.data.id),
    ),
  };
}

// ─── Comments ────────────────────────────────────────────────────────────────

/** "@Full Name" for every user whose full name appears after an @. */
export function findMentions(body: string, users: readonly Pick<User, "id" | "name">[]): string[] {
  return users.filter((u) => body.includes(`@${u.name}`)).map((u) => u.id);
}

export class CommentStore {
  private readonly byAsset = new Map<string, AssetComment[]>();
  private next = 1;

  constructor(
    private readonly world: World,
    now: number,
    /** Assets worth talking about: the seeded discussion goes on these. */
    interesting: readonly string[],
  ) {
    const rng = Rng.for(world.seed, "comments");
    const role = (r: User["role"]) => rng.pick(world.usersWithRole(r));
    for (const assetId of interesting) {
      const asset = world.assets.get(assetId);
      if (!asset) continue;
      const engineer = role("reliability_engineer");
      const operator = role("control_room_operator");
      const planner = role("maintenance_planner");
      const t0 = now - rng.between(6, 72) * HOUR;
      this.seed(
        assetId,
        operator.id,
        t0,
        `Readings on ${assetId} have been creeping up since last shift. @${engineer.name} can you take a look?`,
      );
      this.seed(
        assetId,
        engineer.id,
        t0 + rng.between(1, 4) * HOUR,
        `Looked at the trend: it matches the model's prediction. Not urgent yet, but let's plan it. @${planner.name} is there a window this week?`,
      );
      if (rng.chance(0.6)) {
        this.seed(assetId, planner.id, t0 + rng.between(5, 8) * HOUR, `Pencilled in for the next low-demand window. Parts are in stock.`);
      }
    }
  }

  private seed(assetId: string, authorId: string, t: number, body: string): void {
    this.store(assetId, authorId, body, t);
  }

  private store(assetId: string, authorId: string, body: string, t: number): AssetComment {
    const comment: AssetComment = {
      id: `CMT-${String(this.next++).padStart(5, "0")}`,
      assetId,
      authorId,
      body,
      mentions: findMentions(body, this.world.users),
      createdAt: iso(t),
    };
    this.byAsset.set(assetId, [...(this.byAsset.get(assetId) ?? []), comment]);
    return comment;
  }

  list(assetId: string): AssetComment[] {
    return [...(this.byAsset.get(assetId) ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id.localeCompare(a.id));
  }

  add(request: AddCommentRequest, by: string, now: number): AssetComment {
    if (!this.world.assets.has(request.assetId)) throw new ApiFailure("not_found", `Asset ${request.assetId} not found`);
    return this.store(request.assetId, by, request.body, now);
  }
}
