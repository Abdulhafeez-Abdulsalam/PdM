import { z } from "zod";
import { Id } from "./common";

/**
 * The 11 roles (information architecture §4).
 * Roles only control what the UI *shows* — see ADR-0008. The backend must enforce real access.
 */
export const RoleId = z.enum([
  "executive",
  "plant_manager",
  "reliability_engineer",
  "condition_analyst",
  "control_room_operator",
  "maintenance_planner",
  "field_technician",
  "hse_officer",
  "procurement",
  "esg_lead",
  "system_admin",
]);
export type RoleId = z.infer<typeof RoleId>;

export const User = z.object({
  id: Id,
  name: z.string().min(1),
  role: RoleId,
  /** Job title shown in pickers, e.g. "Senior Rotating Equipment Engineer". */
  title: z.string(),
  /** Maintenance crew, if any (used to suggest assignees). */
  crewId: Id.nullable(),
  /** Sites this person mainly works at. Used for sensible defaults, not for access control. */
  siteIds: z.array(Id),
});
export type User = z.infer<typeof User>;
