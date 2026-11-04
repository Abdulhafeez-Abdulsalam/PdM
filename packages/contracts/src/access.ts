/**
 * Who may do what (ADR-0008, ADR-0014). One copy, used by the screens to decide what to SHOW
 * and by the server to decide what to ALLOW: a button the screen hides is a request the server
 * refuses, and the two can't drift apart.
 *
 * The module matrix is the table from information architecture §4, one row per module, one
 * letter per role in the column order below: U = use (view + act) · V = view only · - = hidden.
 */
import type { EndpointInput, EndpointName } from "./endpoints";
import type { RoleId } from "./users";
import { WORK_ORDER_TRANSITIONS, canTransition, type WorkOrder, type WorkOrderStatus } from "./work-orders";

export const MODULE_IDS = [
  "command-center",
  "assets",
  "alarms",
  "operations",
  "twin",
  "predictive",
  "reliability",
  "maintenance",
  "field",
  "inventory",
  "hse",
  "esg",
  "financials",
  "reports",
  "data",
  "admin",
] as const;
export type ModuleId = (typeof MODULE_IDS)[number];

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

// ─── Actions ─────────────────────────────────────────────────────────────────

export const ACTIONS = {
  "alarm.acknowledge": ["control_room_operator"],
  "alarm.shelve": ["control_room_operator"],
  "alarm.createWorkOrder": ["control_room_operator", "plant_manager", "maintenance_planner", "reliability_engineer"],
  "prediction.feedback": ["reliability_engineer", "condition_analyst", "field_technician"],
  "prediction.triage": ["reliability_engineer", "condition_analyst"],
  "prediction.createWorkOrder": ["reliability_engineer", "condition_analyst", "maintenance_planner", "plant_manager"],
  "workOrder.approve": ["plant_manager"],
  /** Triage, plan, schedule, re-plan, and finally close; also raising planned work (PM, RCA actions). */
  "workOrder.schedule": ["maintenance_planner"],
  "workOrder.execute": ["field_technician"],
  /** The technician's close-out (ISO 14224 coding). */
  "workOrder.close": ["field_technician"],
  "workOrder.verify": ["maintenance_planner", "reliability_engineer"],
  "workOrder.cancel": ["maintenance_planner", "plant_manager"],
  /** Place a purchase order for spare parts. */
  "inventory.order": ["procurement", "maintenance_planner"],
  /** Issue a permit to work. */
  "permit.issue": ["hse_officer"],
  /** Report a near miss, equipment damage or a release: anyone who works on site. */
  "incident.report": [
    "hse_officer",
    "field_technician",
    "control_room_operator",
    "maintenance_planner",
    "plant_manager",
    "reliability_engineer",
  ],
  /** Propose a change; review and approve (or reject) it; mark it implemented. */
  "moc.propose": [
    "reliability_engineer",
    "condition_analyst",
    "maintenance_planner",
    "plant_manager",
    "hse_officer",
    "control_room_operator",
  ],
  "moc.review": ["hse_officer", "plant_manager"],
  /** Leave a note for the next shift. */
  "handover.note": [
    "control_room_operator",
    "plant_manager",
    "maintenance_planner",
    "reliability_engineer",
    "condition_analyst",
    "hse_officer",
  ],
  "moc.implement": ["maintenance_planner"],
  "threshold.edit": ["reliability_engineer", "condition_analyst", "system_admin"],
  "model.approve": ["reliability_engineer", "condition_analyst", "system_admin"],
  "admin.manage": ["system_admin"],
} as const satisfies Record<string, readonly RoleId[]>;

/**
 * Actions decided by the module matrix rather than a list of roles: anyone who can see assets
 * may watch one or comment on it; "use" of a module is needed to edit its layout or its RCAs.
 */
const MODULE_ACTIONS = {
  "asset.addToWatchlist": { module: "assets", access: "view" },
  "asset.comment": { module: "assets", access: "view" },
  "layout.edit": { module: "command-center", access: "use" },
  "rca.edit": { module: "reliability", access: "use" },
} as const satisfies Record<string, { module: ModuleId; access: "use" | "view" }>;

export type Action = keyof typeof ACTIONS | keyof typeof MODULE_ACTIONS;

/** May this role do this? (The screen shows the button; the server allows the request.) */
export function canDo(role: RoleId, action: Action): boolean {
  if (action in MODULE_ACTIONS) {
    const rule = MODULE_ACTIONS[action as keyof typeof MODULE_ACTIONS];
    const access = accessFor(role, rule.module);
    return rule.access === "use" ? access === "use" : access !== "none";
  }
  return (ACTIONS[action as keyof typeof ACTIONS] as readonly RoleId[]).includes(role);
}

// ─── Work-order moves ────────────────────────────────────────────────────────

/** The permission needed to move a work order INTO a status. */
const MOVE_ACTION: Record<WorkOrderStatus, Action> = {
  requested: "workOrder.schedule",
  triaged: "workOrder.schedule",
  planned: "workOrder.schedule",
  scheduled: "workOrder.schedule",
  approved: "workOrder.approve",
  in_progress: "workOrder.execute",
  completed: "workOrder.close",
  verified: "workOrder.verify",
  closed: "workOrder.schedule",
  cancelled: "workOrder.cancel",
};

/** Reopening completed work (completed → in_progress) is a verifier's call, not the technician's. */
export function moveAction(from: WorkOrderStatus, to: WorkOrderStatus): Action {
  return from === "completed" && to === "in_progress" ? "workOrder.verify" : MOVE_ACTION[to];
}

/** May this role move a work order from one status to another? ("completed" is the technician's close-out.) */
export function mayMove(role: RoleId, from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  if (to === "completed") return from === "in_progress" && canDo(role, "workOrder.close");
  return canTransition(from, to) && canDo(role, moveAction(from, to));
}

/** Every next status this role may move this work order to (close-out included as "completed"). */
export function allowedMoves(role: RoleId, wo: Pick<WorkOrder, "status">): WorkOrderStatus[] {
  const next: WorkOrderStatus[] = [...WORK_ORDER_TRANSITIONS[wo.status]];
  if (wo.status === "in_progress") next.unshift("completed");
  return next.filter((to) => mayMove(role, wo.status, to));
}

// ─── Requests (the server's check) ───────────────────────────────────────────

/** What the server can look up to decide a rule: a work order's current status. */
export interface AccessLookups {
  workOrderStatus(workOrderId: string): WorkOrderStatus | null;
}

/**
 * What a request needs beyond being signed in:
 *   null        nothing more. Reads are open to everyone signed in: pages share data across
 *               modules (the Command Center shows alarms, predictions and work orders), so the
 *               matrix decides what each role is SHOWN; it's changes that must be guarded.
 *   an Action   the role must be allowed that action.
 *   a function  the action depends on the (already checked) input.
 */
type Rule<N extends EndpointName> = null | Action | ((input: EndpointInput<N>, ask: AccessLookups) => Action | null);

const WORK_ORDER_SOURCE_ACTION = {
  alarm: "alarm.createWorkOrder",
  prediction: "prediction.createWorkOrder",
  manual: "workOrder.schedule",
  rca: "workOrder.schedule",
  pm: "workOrder.schedule",
} as const satisfies Record<EndpointInput<"workOrders.create">["source"]["kind"], Action>;

/** One rule per endpoint; the type makes leaving one out a compile error. */
const RULES: { [N in EndpointName]: Rule<N> } = {
  "me.get": null,
  "users.list": null,
  "hierarchy.node": null,
  "hierarchy.children": null,
  "hierarchy.path": null,
  "sites.list": null,
  "assets.list": null,
  "assets.get": null,
  "assets.compare": null,
  "assets.performance": null,
  "assets.vibration": null,
  "assets.failures": null,
  "assets.documents": null,
  "assets.related": null,
  "assets.comments": null,
  "assets.addComment": "asset.comment",
  "assets.tags": null,
  "twin.area": null,
  "pm.overview": null,
  "pm.plan": null,
  "pm.generate": "workOrder.schedule",
  "inventory.overview": null,
  "inventory.part": null,
  "inventory.order": "inventory.order",
  "inventory.workOrderParts": null,
  "hse.overview": null,
  "hse.permits": null,
  "hse.issuePermit": "permit.issue",
  "hse.incidents": null,
  "hse.reportIncident": "incident.report",
  "hse.mocs": null,
  "hse.createMoc": "moc.propose",
  "hse.mocTransition": ({ to }) => (to === "implemented" ? "moc.implement" : "moc.review"),
  "esg.overview": null,
  "financials.overview": null,
  "handover.get": null,
  "handover.addNote": "handover.note",
  "data.sources": null,
  "data.quality": null,
  "data.tags": null,
  // Who changed what is for administrators only.
  "admin.audit": "admin.manage",
  "admin.setLimits": "threshold.edit",
  "admin.setUserRole": "admin.manage",
  "models.list": null,
  "models.approve": "model.approve",
  "models.reject": "model.approve",
  "rules.overview": null,
  "rules.test": null,
  "rules.create": "threshold.edit",
  "rules.setEnabled": "threshold.edit",
  "operations.power": null,
  "operations.oilGas": null,
  "operations.turbineTrend": null,
  "operations.solar": null,
  "reliability.summary": null,
  "reliability.weibull": null,
  "reliability.risk": null,
  "reliability.fmea": null,
  "rca.list": null,
  "rca.get": null,
  "rca.create": "rca.edit",
  "rca.update": "rca.edit",
  "rca.addAction": "rca.edit",
  // POSTs only because the request can be long; reading values changes nothing.
  "timeseries.history": null,
  "timeseries.latest": null,
  "risks.top": null,
  "predictions.list": null,
  "predictions.get": null,
  "predictions.feedback": "prediction.feedback",
  "predictions.triage": "prediction.triage",
  "predictions.feedbackSummary": null,
  "anomalies.fleet": null,
  "anomalies.history": null,
  "alarms.list": null,
  "alarms.analytics": null,
  "alarms.summary": null,
  "alarms.acknowledge": "alarm.acknowledge",
  "alarms.shelve": "alarm.shelve",
  "alarms.unshelve": "alarm.shelve",
  "events.list": null,
  "notifications.list": null,
  "notifications.markRead": null,
  "notifications.snooze": null,
  "kpis.get": null,
  "copilot.ask": null,
  "briefing.daily": null,
  "workOrders.list": null,
  "workOrders.get": null,
  "workOrders.create": ({ source }) => WORK_ORDER_SOURCE_ACTION[source.kind],
  "workOrders.transition": ({ workOrderId, to }, ask) => {
    const from = ask.workOrderStatus(workOrderId);
    // No such work order: nothing to guard, and the answer will be an honest "not found".
    return from === null ? null : moveAction(from, to);
  },
  "workOrders.closeOut": "workOrder.close",
  "workOrders.reschedule": "workOrder.schedule",
};

/** The action a request needs (null: being signed in is enough). `input` must already be checked. */
export function requiredAction<N extends EndpointName>(name: N, input: EndpointInput<N>, ask: AccessLookups): Action | null {
  const rule = RULES[name] as Rule<N>;
  return typeof rule === "function" ? rule(input, ask) : rule;
}

/** May this role make this request? */
export function mayRequest<N extends EndpointName>(role: RoleId, name: N, input: EndpointInput<N>, ask: AccessLookups): boolean {
  const action = requiredAction(name, input, ask);
  return action === null || canDo(role, action);
}
