/**
 * Role-based views (ADR-0008). The rules (the module matrix, the actions, who may move a work
 * order) live in @pdm/contracts, so the screens and the server use one copy (ADR-0014): what this
 * decides to SHOW is exactly what the server will ALLOW. In demo mode nothing checks, and the
 * role picker lets you try each role; in server mode the server refuses anything else (403).
 */
import { RoleId } from "@pdm/contracts";
import { BUILT_MODULES, MODULES, type ModuleId } from "../modules";

export { ACTIONS, accessFor, canDo, canSee, type Access, type Action } from "@pdm/contracts";

// ─── Home pages (information architecture §5) ────────────────────────────────

const FINAL_HOME: Record<RoleId, ModuleId> = {
  executive: "command-center",
  plant_manager: "command-center",
  reliability_engineer: "reliability",
  condition_analyst: "predictive",
  control_room_operator: "command-center",
  maintenance_planner: "maintenance",
  field_technician: "field",
  hse_officer: "hse",
  procurement: "inventory",
  esg_lead: "esg",
  system_admin: "admin",
};

/** Where a role lands after login. Until its own module is built, everyone lands on the Command Center. */
export function homeFor(role: RoleId): ModuleId {
  const home = FINAL_HOME[role];
  return BUILT_MODULES.has(home) ? home : "command-center";
}

export const ALL_ROLES = RoleId.options;
export const ALL_MODULE_IDS = MODULES.map((m) => m.id);
