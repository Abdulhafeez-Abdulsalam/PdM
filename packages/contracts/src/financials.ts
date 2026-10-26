/**
 * Financials (spec §6.12): "what is maintenance costing, and what is prediction saving?"
 *
 *  - Value realised: for each finished predictive job, the failure it prevented (what that
 *    failure would have cost) minus what the job cost. A false alarm prevented nothing.
 *  - Money at risk: open predictions × their probability × what each failure would cost.
 *  - Downtime: hours lost to failures × what an hour of downtime costs that business.
 *  - Spend: labour and parts by month and kind of work, against the budget.
 * Every figure lists how it was worked out, so a finance team can check it.
 */
import { z } from "zod";
import { Id, ScopeId, Timestamp } from "./common";

/** What an hour of a technician's time costs, USD. */
export const LABOUR_RATE = 95;

export const FinancialsRequest = z.object({ scopeId: ScopeId.optional() });
export type FinancialsRequest = z.infer<typeof FinancialsRequest>;

export const ValueItem = z.object({
  workOrderId: Id,
  workOrderNumber: z.string(),
  assetId: Id,
  completedAt: Timestamp,
  /** What the failure would have cost (repair and lost production), or 0 for a false alarm. */
  avoided: z.number(),
  labourHours: z.number(),
  partsCost: z.number(),
  /** labour × LABOUR_RATE + parts. */
  cost: z.number(),
  net: z.number(),
  falseAlarm: z.boolean(),
});
export type ValueItem = z.infer<typeof ValueItem>;

export const SpendCategory = z.enum(["corrective", "preventive", "predictive"]);
export type SpendCategory = z.infer<typeof SpendCategory>;

export const SpendMonth = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  corrective: z.number(),
  preventive: z.number(),
  predictive: z.number(),
  budget: z.number(),
});
export type SpendMonth = z.infer<typeof SpendMonth>;

export const FinancialsOverview = z.object({
  currency: z.string(),
  /** The last 12 months. */
  value: z.object({
    avoided: z.number(),
    cost: z.number(),
    net: z.number(),
    jobs: z.number().int(),
    falseAlarms: z.number().int(),
    /** Biggest net value first (at most 15). */
    items: z.array(ValueItem),
  }),
  atRisk: z.object({ amount: z.number(), predictions: z.number().int() }),
  downtime: z.object({
    hours: z.number(),
    cost: z.number(),
    /** Most costly first. */
    sites: z.array(z.object({ siteId: Id, siteName: z.string(), hours: z.number(), cost: z.number(), costPerHour: z.number() })),
  }),
  spend: z.object({
    /** Oldest first. */
    months: z.array(SpendMonth),
    total: z.number(),
    budget: z.number(),
    /** Preventive + predictive, as a share of all spend: planned work is cheaper than repairs. */
    plannedPct: z.number(),
    byCategory: z.array(z.object({ category: SpendCategory, jobs: z.number().int(), total: z.number(), average: z.number() })),
  }),
});
export type FinancialsOverview = z.infer<typeof FinancialsOverview>;
