import { z } from "zod";
import { Id } from "./common";
import { Quantity } from "./quantities";

/**
 * Threshold limits for a tag, in the canonical unit. Any may be absent.
 * Order from the bottom: lowTrip < lowAlarm < lowAlert < (normal) < highAlert < highAlarm < highTrip.
 * "Trip" = the machine is shut down automatically by its protection system.
 */
export const TagLimits = z.object({
  lowTrip: z.number().optional(),
  lowAlarm: z.number().optional(),
  lowAlert: z.number().optional(),
  highAlert: z.number().optional(),
  highAlarm: z.number().optional(),
  highTrip: z.number().optional(),
});
export type TagLimits = z.infer<typeof TagLimits>;

/** A tag = one measured signal, e.g. "GT-101.EXH_TEMP" (exhaust temperature of gas turbine GT-101). */
export const Tag = z.object({
  /** Unique enterprise-wide, conventionally "<assetId>.<SIGNAL>". */
  id: Id,
  assetId: Id,
  /** Short signal name, e.g. "EXH_TEMP". */
  name: z.string().min(1),
  description: z.string(),
  quantity: Quantity,
  limits: TagLimits,
});
export type Tag = z.infer<typeof Tag>;
