/**
 * Inventory and spare parts (spec §6.7 "spare parts criticality and stocking"): do we have the
 * parts we'll need, where we'll need them, in time?
 *
 * Each stock line is one part at one site. Its reorder point covers the demand expected while a
 * new order is on its way (the lead time) plus safety stock for the surprises, more for vital
 * parts. The forecast adds the parts that PM plans will use and the parts that open failure
 * predictions will need. A line is "short" when that demand comes before stock could arrive.
 */
import { z } from "zod";
import { AssetClass } from "./assets";
import { Id, Probability, ScopeId, Timestamp } from "./common";
import { FailureModeCode } from "./iso14224";

/** How far ahead the demand forecast looks. */
export const DEMAND_HORIZON_DAYS = 90;

/** VED: vital (a failure stops production or safety), essential, desirable. Sets the safety stock. */
export const PartCriticality = z.enum(["vital", "essential", "desirable"]);
export type PartCriticality = z.infer<typeof PartCriticality>;

export const Part = z.object({
  partNumber: z.string(),
  description: z.string(),
  assetClass: AssetClass,
  mode: FailureModeCode,
  unitCost: z.number(),
  currency: z.string(),
  leadTimeDays: z.number().int(),
  criticality: PartCriticality,
});
export type Part = z.infer<typeof Part>;

export const StockStatus = z.enum(["short", "reorder", "ok", "excess"]);
export type StockStatus = z.infer<typeof StockStatus>;

export const StockLine = z.object({
  partNumber: z.string(),
  description: z.string(),
  siteId: Id,
  criticality: PartCriticality,
  onHand: z.number().int(),
  onOrder: z.number().int(),
  /** When the earliest open order arrives. */
  nextArrival: Timestamp.nullable(),
  reorderPoint: z.number().int(),
  max: z.number().int(),
  /** Parts needed in the next DEMAND_HORIZON_DAYS, and when the first is needed. */
  demand: z.number().int(),
  firstNeed: Timestamp.nullable(),
  status: StockStatus,
  /** What to order now, and by when it must be ordered to arrive in time (in the past = late already). */
  suggestedQty: z.number().int(),
  orderBy: Timestamp.nullable(),
  value: z.number(),
});
export type StockLine = z.infer<typeof StockLine>;

export const InventoryRequest = z.object({
  scopeId: ScopeId.optional(),
  status: z.array(StockStatus).optional(),
  /** Part number or description. */
  search: z.string().max(100).optional(),
});
export type InventoryRequest = z.infer<typeof InventoryRequest>;

export const InventoryOverview = z.object({
  counts: z.object({
    lines: z.number().int(),
    short: z.number().int(),
    reorder: z.number().int(),
    excess: z.number().int(),
    openOrders: z.number().int(),
  }),
  stockValue: z.number(),
  currency: z.string(),
  /** Short first, then reorder, then by first need. */
  lines: z.array(StockLine),
});
export type InventoryOverview = z.infer<typeof InventoryOverview>;

/** One part needed by one asset: from a PM plan coming due, or a failure prediction. */
export const DemandItem = z.object({
  assetId: Id,
  siteId: Id,
  needBy: Timestamp,
  quantity: z.number().int(),
  source: z.enum(["pm", "prediction"]),
  /** The PM plan or prediction id. */
  refId: Id,
  /** Predictions only: how likely the failure is. */
  probability: Probability.nullable(),
});
export type DemandItem = z.infer<typeof DemandItem>;

export const PurchaseOrder = z.object({
  id: Id,
  partNumber: z.string(),
  siteId: Id,
  quantity: z.number().int().positive(),
  orderedAt: Timestamp,
  eta: Timestamp,
  /** null for orders placed before the demo started. */
  orderedBy: Id.nullable(),
  status: z.enum(["open", "received"]),
});
export type PurchaseOrder = z.infer<typeof PurchaseOrder>;

export const PartRequest = z.object({ partNumber: z.string(), scopeId: ScopeId.optional() });
export type PartRequest = z.infer<typeof PartRequest>;

export const PartDetail = z.object({
  part: Part,
  /** The PM plan that uses it, if any. */
  pmPlanId: Id.nullable(),
  lines: z.array(StockLine),
  /** Soonest first. */
  demand: z.array(DemandItem),
  /** Newest first. */
  orders: z.array(PurchaseOrder),
});
export type PartDetail = z.infer<typeof PartDetail>;

export const PlaceOrderRequest = z.object({
  partNumber: z.string(),
  siteId: Id,
  quantity: z.number().int().min(1).max(1000),
});
export type PlaceOrderRequest = z.infer<typeof PlaceOrderRequest>;

/** The parts a work order will use, and whether its site has them. */
export const WorkOrderPartsRequest = z.object({ workOrderId: Id });
export type WorkOrderPartsRequest = z.infer<typeof WorkOrderPartsRequest>;

export const WorkOrderParts = z.object({
  /** The work order's site, where the parts are taken from. */
  siteId: Id,
  parts: z.array(
    z.object({
      partNumber: z.string(),
      description: z.string(),
      quantity: z.number().int(),
      onHand: z.number().int(),
      status: StockStatus,
    }),
  ),
  /** Already taken out of stock: the work order was closed out. */
  issued: z.boolean(),
});
export type WorkOrderParts = z.infer<typeof WorkOrderParts>;
