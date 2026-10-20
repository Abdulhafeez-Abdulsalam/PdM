/**
 * Simple role-based views (ADR-0008). Decides what each role SEES — for usability.
 * ⚠️ This is NOT security: anything sent to the browser can be read. The backend must
 * check every request.
 *
 * The matrix below is the table from information architecture §4, one row per module,
 * one letter per role in this column order:
 */
import { RoleId } from "@pdm/contracts";
import { BUILT_MODULES, MODULES, type ModuleId } from "../modules";

const COLUMNS: readonly RoleId[] = [
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
];

/** U = use (view + act) · V = view only · - = hidden */
const MATRIX: Record<ModuleId, string> = {
  //                 Exe PlM Rel CMA Ops Pln Tec HSE Pro ESG Adm
  "command-center": "UUUUUUVUVVV",
  assets: /*      */ "VUUUUUVVVVU",
  predictive: /*  */ "VVUUVV----U",
  alarms: /*      */ "VVVVUVVV--V",
  maintenance: /* */ "VUVVVUVVV-V",
  reliability: /* */ "VVUV-V-V--V",
  operations: /*  */ "VUVVUV-V-VV",
  twin: /*        */ "VVUUUVVV--V",
  inventory: /*   */ "VVV--UV-U-V",
  hse: /*         */ "VVV-VVVU-VV",
  esg: /*         */ "VV-----V-UV",
  financials: /*  */ "UUV--V--VVV",
  reports: /*     */ "UUUUUU-UUUU",
  field: /*       */ "-V---VUV--V",
  data: /*        */ "--VU------U",
  admin: /*       */ "----------U",
};

export type Access = "use" | "view" | "none";

export function accessFor(role: RoleId, module: ModuleId): Access {
  const letter = MATRIX[module][COLUMNS.indexOf(role)];
  return letter === "U" ? "use" : letter === "V" ? "view" : "none";
}

/** Should this module appear in the menu / be openable for this role? */
export function canSee(role: RoleId, module: ModuleId): boolean {
  return accessFor(role, module) !== "none";
}

// ─── Actions (buttons) ────────────────────────────────────────────────────────

export const ACTIONS = {
  "alarm.acknowledge": ["control_room_operator"],
  "alarm.shelve": ["control_room_operator"],
  "alarm.createWorkOrder": ["control_room_operator", "plant_manager", "maintenance_planner", "reliability_engineer"],
  "prediction.feedback": ["reliability_engineer", "condition_analyst", "field_technician"],
  "prediction.triage": ["reliability_engineer", "condition_analyst"],
  "prediction.createWorkOrder": ["reliability_engineer", "condition_analyst", "maintenance_planner", "plant_manager"],
  "workOrder.approve": ["plant_manager"],
  "workOrder.schedule": ["maintenance_planner"],
  "workOrder.execute": ["field_technician"],
  "workOrder.close": ["field_technician"],
  "threshold.edit": ["reliability_engineer", "condition_analyst", "system_admin"],
  "model.approve": ["reliability_engineer", "condition_analyst", "system_admin"],
  "admin.manage": ["system_admin"],
} as const satisfies Record<string, readonly RoleId[]>;

export type Action = keyof typeof ACTIONS | "asset.addToWatchlist" | "layout.edit";

/** Should this button be shown to this role? */
export function canDo(role: RoleId, action: Action): boolean {
  if (action === "asset.addToWatchlist") return canSee(role, "assets");
  if (action === "layout.edit") return accessFor(role, "command-center") === "use";
  return (ACTIONS[action] as readonly RoleId[]).includes(role);
}

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
