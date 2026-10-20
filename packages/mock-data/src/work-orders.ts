/**
 * Work orders: ~6 months of history, plus predictive work orders already raised for some
 * of the faults, plus anything created through the API.
 */
import type {
  CreateWorkOrderRequest,
  User,
  WorkOrder,
  WorkOrderListParams,
  WorkOrderPriority,
  WorkOrderStatus,
  WorkOrderType,
} from "@pdm/contracts";
import { DAY, HOUR, iso } from "./clock";
import { DETECTION_PROGRESS, rawProgress, timeAtProgress } from "./faults";
import type { AssetRecord } from "./model";
import { ApiFailure } from "./errors";
import { Rng } from "./random";
import { predictionId, type PredictionOverlay } from "./snapshot";
import type { World } from "./world";

const HISTORY_COUNT = 360;
const HISTORY_DAYS = 180;

export const OPEN_STATUSES: readonly WorkOrderStatus[] = ["requested", "triaged", "planned", "scheduled", "approved", "in_progress"];

const TYPE_WEIGHTS: readonly (readonly [WorkOrderType, number])[] = [
  ["preventive", 40],
  ["corrective", 25],
  ["inspection", 15],
  ["predictive", 8],
  ["calibration", 6],
  ["condition_based", 3],
  ["regulatory", 2],
  ["shutdown", 1],
];

const PRIORITY_WEIGHTS: readonly (readonly [WorkOrderPriority, number])[] = [
  ["emergency", 2],
  ["urgent", 8],
  ["high", 20],
  ["normal", 55],
  ["low", 15],
];

function statusForAge(rng: Rng, ageDays: number): WorkOrderStatus {
  if (ageDays > 30)
    return rng.weighted([
      ["closed", 88],
      ["cancelled", 4],
      ["verified", 4],
      ["completed", 4],
    ]);
  if (ageDays > 7) {
    return rng.weighted([
      ["closed", 30],
      ["completed", 15],
      ["in_progress", 15],
      ["scheduled", 20],
      ["planned", 10],
      ["approved", 10],
    ]);
  }
  return rng.weighted([
    ["requested", 30],
    ["triaged", 20],
    ["planned", 20],
    ["scheduled", 15],
    ["in_progress", 15],
  ]);
}

function titleFor(rng: Rng, type: WorkOrderType, asset: AssetRecord): string {
  const name = asset.data.id;
  switch (type) {
    case "preventive":
      return `${rng.pick(["Monthly", "Quarterly", "Annual"])} PM — ${name}`;
    case "corrective":
      return `${rng.pick(["Repair leak on", "Replace failed seal on", "Investigate trip of", "Replace faulty transmitter on"])} ${name}`;
    case "inspection":
      return `${rng.pick(["Visual inspection", "Thermographic survey", "UT thickness survey"])} — ${name}`;
    case "calibration":
      return `Calibrate instruments — ${name}`;
    case "predictive":
      return `Condition-based intervention — ${name}`;
    case "condition_based":
      return `Condition-based service — ${name}`;
    case "regulatory":
      return `Statutory inspection — ${name}`;
    case "shutdown":
      return `Turnaround scope item — ${name}`;
  }
}

export class WorkOrderStore {
  private orders: WorkOrder[] = [];
  private nextNumber = 10001;

  constructor(
    private readonly world: World,
    now: number,
    overlays: Map<string, PredictionOverlay>,
  ) {
    this.seedHistory(now);
    this.seedPredictive(now, overlays);
    this.orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    for (const wo of this.orders) {
      const number = this.nextNumber++;
      const oldId = wo.id;
      wo.id = `wo-${number}`;
      wo.number = `WO-${number}`;
      for (const overlay of overlays.values()) if (overlay.workOrderId === oldId) overlay.workOrderId = wo.id;
    }
  }

  private technicians(asset: AssetRecord): User[] {
    const all = this.world.usersWithRole("field_technician");
    const local = all.filter((u) => u.siteIds.includes(asset.data.siteId));
    return local.length > 0 ? local : all;
  }

  private seedHistory(now: number): void {
    const rng = Rng.for(this.world.seed, "work-orders");
    // Critical equipment gets more work orders: weight = criticality².
    const assets = [...this.world.assets.values()];
    const cumulative: number[] = [];
    let total = 0;
    for (const a of assets) cumulative.push((total += a.data.criticality ** 2));
    const planners = this.world.usersWithRole("maintenance_planner");

    for (let i = 0; i < HISTORY_COUNT; i++) {
      const roll = rng.next() * total;
      const asset = assets[cumulative.findIndex((c) => c > roll)] ?? assets[0];
      if (!asset) continue;
      const createdAt = now - rng.between(0, HISTORY_DAYS) * DAY;
      const type = rng.weighted(TYPE_WEIGHTS);
      const status = statusForAge(rng, (now - createdAt) / DAY);
      const assigned = !["requested", "triaged"].includes(status);
      this.orders.push({
        id: `tmp-${i}`,
        number: "WO-0",
        title: titleFor(rng, type, asset),
        description: `${type.replace("_", " ")} work on ${asset.data.name}.`,
        assetId: asset.data.id,
        type,
        priority: rng.weighted(PRIORITY_WEIGHTS),
        status,
        createdAt: iso(createdAt),
        createdBy: rng.pick(planners).id,
        assigneeId: assigned ? rng.pick(this.technicians(asset)).id : null,
        dueAt: iso(createdAt + rng.between(3, 30) * DAY),
        source: { kind: type === "predictive" ? "prediction" : "manual", refId: null },
        evidence: null,
      });
    }
  }

  /** About half of the well-advanced faults already have a predictive work order in the plan. */
  private seedPredictive(now: number, overlays: Map<string, PredictionOverlay>): void {
    const rng = Rng.for(this.world.seed, "predictive-work-orders");
    const planners = this.world.usersWithRole("maintenance_planner");
    for (const fault of this.world.faults) {
      if (rawProgress(fault, now) < 0.6 || !rng.chance(0.5)) continue;
      const createdAt = Math.min(now - HOUR, timeAtProgress(fault, DETECTION_PROGRESS) + rng.between(1, 3) * DAY);
      const id = `tmp-pred-${fault.id}`;
      const asset = fault.asset;
      this.orders.push({
        id,
        number: "WO-0",
        title: `${fault.type.action} — ${asset.data.id}`,
        description: `Raised from prediction ${predictionId(fault)} (${fault.type.failureMode.label}).`,
        assetId: asset.data.id,
        type: "predictive",
        priority: asset.data.criticality >= 4 ? "high" : "normal",
        status: rng.pick(["planned", "scheduled", "approved"] as const),
        createdAt: iso(createdAt),
        createdBy: rng.pick(planners).id,
        assigneeId: rng.pick(this.technicians(asset)).id,
        dueAt: iso(Math.min(fault.failAt, now + rng.between(2, 14) * DAY)),
        source: { kind: "prediction", refId: predictionId(fault) },
        evidence: null,
      });
      overlays.set(predictionId(fault), { status: "actioned", workOrderId: id });
    }
  }

  create(request: CreateWorkOrderRequest, createdBy: string, now: number): WorkOrder {
    if (!this.world.assets.has(request.assetId)) throw new ApiFailure("not_found", `Asset ${request.assetId} not found`);
    const number = this.nextNumber++;
    const wo: WorkOrder = {
      ...request,
      id: `wo-${number}`,
      number: `WO-${number}`,
      status: "requested",
      createdAt: iso(now),
      createdBy,
    };
    this.orders.push(wo);
    return wo;
  }

  get(id: string): WorkOrder {
    const wo = this.orders.find((o) => o.id === id);
    if (!wo) throw new ApiFailure("not_found", `Work order ${id} not found`);
    return wo;
  }

  setStatus(id: string, status: WorkOrderStatus): WorkOrder {
    const wo = this.get(id);
    wo.status = status;
    return wo;
  }

  /** Newest first. */
  query(params: Omit<WorkOrderListParams, "offset" | "limit">, inScope: (assetId: string) => boolean): WorkOrder[] {
    return this.orders
      .filter((o) => !params.assetId || o.assetId === params.assetId)
      .filter((o) => !params.status || params.status.includes(o.status))
      .filter((o) => inScope(o.assetId))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  all(): readonly WorkOrder[] {
    return this.orders;
  }
}
