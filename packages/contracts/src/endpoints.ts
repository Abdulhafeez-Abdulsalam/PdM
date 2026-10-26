/**
 * The API endpoint list: the single source of truth for every request the frontend can make.
 *
 * Each endpoint says: HTTP method, URL path, the shape of what we send (input), and the
 * shape of what we get back (output). Both the mock backend and the real-HTTP transport
 * read this table, so they cannot drift apart.
 *
 * Path parameters are written `:name` and must also appear in `input`.
 * For GET, the remaining input fields become the query string; for POST, the JSON body.
 */
import { z } from "zod";
import {
  AcknowledgeAlarmsRequest,
  Alarm,
  AlarmAnalytics,
  AlarmAnalyticsRequest,
  AlarmListParams,
  AlarmSummary,
  ShelveAlarmRequest,
  UnshelveAlarmRequest,
} from "./alarms";
import { AddCommentRequest, AssetComment, AssetDocument, RelatedAssets } from "./asset-info";
import { Asset, AssetListParams } from "./assets";
import { FleetCompareRequest, FleetCompareResponse } from "./comparison";
import { AssetPerformance, PowerOperations, PowerOperationsRequest, TurbineTrend, TurbineTrendRequest } from "./operations";
import { SolarOperations, SolarOperationsRequest } from "./solar";
import { AddActionRequest, CreateRcaRequest, Fmea, FmeaRequest, Rca, RcaSummary, UpdateRcaRequest } from "./rca";
import { OilGasOperations, OilGasRequest } from "./oil-gas";
import { Vibration, VibrationRequest } from "./vibration";
import { TwinArea, TwinRequest } from "./twin";
import { GeneratePmRequest, GeneratePmResult, PmOverview, PmOverviewRequest, PmPlanDetail, PmPlanRequest } from "./pm";
import {
  InventoryOverview,
  InventoryRequest,
  PartDetail,
  PartRequest,
  PlaceOrderRequest,
  PurchaseOrder,
  WorkOrderParts,
  WorkOrderPartsRequest,
} from "./inventory";
import {
  CreateMocRequest,
  HseOverview,
  HseOverviewRequest,
  Incident,
  IncidentListRequest,
  IssuePermitRequest,
  Moc,
  MocListRequest,
  MocTransitionRequest,
  Permit,
  PermitListRequest,
  ReportIncidentRequest,
} from "./hse";
import { EsgOverview, EsgRequest } from "./esg";
import { FinancialsOverview, FinancialsRequest } from "./financials";
import {
  AssetFailures,
  ReliabilityRequest,
  ReliabilitySummary,
  RiskMatrix,
  RiskRequest,
  WeibullAnalysis,
  WeibullRequest,
} from "./reliability";
import { Briefing } from "./briefing";
import { Id, PageParams, ScopeId, list, page } from "./common";
import { EventListParams, TimelineEvent } from "./events";
import { HierarchyNode, Site } from "./hierarchy";
import { KpiParams, KpiResponse } from "./kpis";
import { AnomalyFleetRequest, AnomalyFleetResponse, AnomalyHistory, AnomalyHistoryRequest } from "./anomalies";
import {
  Prediction,
  PredictionFeedbackRequest,
  PredictionFeedbackSummary,
  PredictionListParams,
  PredictionTriageRequest,
  RiskItem,
  TopRisksParams,
} from "./predictions";
import { Tag } from "./tags";
import { HistoryRequest, HistoryResponse, LiveValue } from "./timeseries";
import { MAX_SUBSCRIBED_TAGS } from "./realtime";
import { RoleId, User } from "./users";
import {
  CloseOutWorkOrderRequest,
  RescheduleWorkOrderRequest,
  CreateWorkOrderRequest,
  TransitionWorkOrderRequest,
  WorkOrder,
  WorkOrderListParams,
} from "./work-orders";

export type HttpMethod = "GET" | "POST";

export interface EndpointDef<I extends z.ZodType = z.ZodType, O extends z.ZodType = z.ZodType> {
  method: HttpMethod;
  path: `/${string}`;
  description: string;
  input: I;
  output: O;
}

/** Identity helper: keeps each endpoint's exact input/output types instead of widening them. */
const endpoint = <I extends z.ZodType, O extends z.ZodType>(def: EndpointDef<I, O>) => def;

const none = z.object({});

export const endpoints = {
  // ── People ──
  "me.get": endpoint({
    method: "GET",
    path: "/me",
    description: "The signed-in user (in demo mode: whoever the role switcher selected)",
    input: none,
    output: User,
  }),
  "users.list": endpoint({
    method: "GET",
    path: "/users",
    description: "Search people, e.g. for the work-order assignee picker",
    input: PageParams.extend({ role: RoleId.optional(), search: z.string().max(100).optional() }),
    output: page(User),
  }),

  // ── Hierarchy ──
  "hierarchy.node": endpoint({
    method: "GET",
    path: "/hierarchy/nodes/:nodeId",
    description: "One hierarchy node",
    input: z.object({ nodeId: Id }),
    output: HierarchyNode,
  }),
  "hierarchy.children": endpoint({
    method: "GET",
    path: "/hierarchy/nodes/:nodeId/children",
    description: "Direct children of a node (the tree loads one level at a time)",
    input: z.object({ nodeId: Id }),
    output: list(HierarchyNode),
  }),
  "hierarchy.path": endpoint({
    method: "GET",
    path: "/hierarchy/nodes/:nodeId/path",
    description: "Ancestors from the enterprise root down to this node — feeds the breadcrumb",
    input: z.object({ nodeId: Id }),
    output: list(HierarchyNode),
  }),
  "sites.list": endpoint({
    method: "GET",
    path: "/sites",
    description: "All sites, for the map and site pickers",
    input: none,
    output: list(Site),
  }),

  // ── Assets & tags ──
  "assets.list": endpoint({
    method: "GET",
    path: "/assets",
    description: "Asset registry with filters, sorting and paging",
    input: AssetListParams,
    output: page(Asset),
  }),
  "assets.get": endpoint({
    method: "GET",
    path: "/assets/:assetId",
    description: "One asset — the Asset 360 header",
    input: z.object({ assetId: Id }),
    output: Asset,
  }),
  "assets.compare": endpoint({
    method: "GET",
    path: "/assets/compare",
    description: "Assets of one class ranked on one measure, with outliers flagged",
    input: FleetCompareRequest,
    output: FleetCompareResponse,
  }),
  "assets.performance": endpoint({
    method: "GET",
    path: "/assets/:assetId/performance",
    description: "The asset's own performance measures (gas turbine efficiency and inspection hours, transformer oil analysis)",
    input: z.object({ assetId: Id }),
    output: AssetPerformance,
  }),
  "assets.vibration": endpoint({
    method: "GET",
    path: "/assets/:assetId/vibration",
    description: "A rotating machine's vibration spectra over the last weeks, with fault-frequency findings, and its shaft orbit",
    input: VibrationRequest,
    output: Vibration,
  }),
  "twin.area": endpoint({
    method: "GET",
    path: "/twin/areas/:areaId",
    description:
      "One area at one moment in the last 72 hours: each asset's health, values and limits, and the area's hour-by-hour activity",
    input: TwinRequest,
    output: TwinArea,
  }),
  "pm.overview": endpoint({
    method: "GET",
    path: "/maintenance/pm",
    description: "Preventive maintenance plans built from FMEA, with PM compliance, overdue and due-soon counts",
    input: PmOverviewRequest,
    output: PmOverview,
  }),
  "pm.plan": endpoint({
    method: "GET",
    path: "/maintenance/pm/:planId",
    description: "One PM plan: why it exists, every asset it covers and when each is next due",
    input: PmPlanRequest,
    output: PmPlanDetail,
  }),
  "pm.generate": endpoint({
    method: "POST",
    path: "/maintenance/pm/:planId/generate",
    description: "Raise preventive work orders for everything due in the next 30 days (or overdue) without one",
    input: GeneratePmRequest,
    output: GeneratePmResult,
  }),
  "inventory.overview": endpoint({
    method: "GET",
    path: "/inventory",
    description:
      "Stock lines (part × site) with reorder points, the 90-day demand forecast from PM plans and predictions, and what to order",
    input: InventoryRequest,
    output: InventoryOverview,
  }),
  "inventory.part": endpoint({
    method: "GET",
    path: "/inventory/parts/:partNumber",
    description: "One spare part: stock at each site, who will need it and when, and its orders",
    input: PartRequest,
    output: PartDetail,
  }),
  "inventory.order": endpoint({
    method: "POST",
    path: "/inventory/orders",
    description: "Place a purchase order for a part at a site; it arrives after the part's lead time",
    input: PlaceOrderRequest,
    output: PurchaseOrder,
  }),
  "inventory.workOrderParts": endpoint({
    method: "GET",
    path: "/work-orders/:workOrderId/parts",
    description: "The parts a work order will use and whether its site has them",
    input: WorkOrderPartsRequest,
    output: WorkOrderParts,
  }),
  "hse.overview": endpoint({
    method: "GET",
    path: "/hse",
    description: "Safety-critical elements and which are impaired, permits waiting, incidents by tier, open changes",
    input: HseOverviewRequest,
    output: HseOverview,
  }),
  "hse.permits": endpoint({
    method: "GET",
    path: "/hse/permits",
    description: "Permits to work, raised when hazardous work is scheduled; work can't start until one is issued",
    input: PermitListRequest,
    output: list(Permit),
  }),
  "hse.issuePermit": endpoint({
    method: "POST",
    path: "/hse/permits/:permitId/issue",
    description: "Issue a requested permit to work",
    input: IssuePermitRequest,
    output: Permit,
  }),
  "hse.incidents": endpoint({
    method: "GET",
    path: "/hse/incidents",
    description: "Process safety events (tier 1 and 2), near misses, equipment damage and releases, last 12 months, newest first",
    input: IncidentListRequest,
    output: list(Incident),
  }),
  "hse.reportIncident": endpoint({
    method: "POST",
    path: "/hse/incidents",
    description: "Report a near miss, equipment damage or a release",
    input: ReportIncidentRequest,
    output: Incident,
  }),
  "hse.mocs": endpoint({
    method: "GET",
    path: "/hse/moc",
    description: "Management-of-change records, open ones first",
    input: MocListRequest,
    output: list(Moc),
  }),
  "hse.createMoc": endpoint({
    method: "POST",
    path: "/hse/moc",
    description: "Propose a change to plant, settings or procedure",
    input: CreateMocRequest,
    output: Moc,
  }),
  "hse.mocTransition": endpoint({
    method: "POST",
    path: "/hse/moc/:mocId/transition",
    description: "Move a change through review: under review, approved, implemented, or rejected with a reason",
    input: MocTransitionRequest,
    output: Moc,
  }),
  "esg.overview": endpoint({
    method: "GET",
    path: "/esg",
    description:
      "Emissions over the last 90 days from fuel, flaring and methane, intensity per site, targets, avoided and avoidable emissions",
    input: EsgRequest,
    output: EsgOverview,
  }),
  "financials.overview": endpoint({
    method: "GET",
    path: "/financials",
    description:
      "Value realised by predictions, money at risk, cost of downtime per site, and maintenance spend against budget, last 12 months",
    input: FinancialsRequest,
    output: FinancialsOverview,
  }),
  "operations.power": endpoint({
    method: "GET",
    path: "/operations/power",
    description: "Gas-to-power plants: output vs dispatch, availability, heat rate; one plant's turbines and transformers",
    input: PowerOperationsRequest,
    output: PowerOperations,
  }),
  "operations.oilGas": endpoint({
    method: "GET",
    path: "/operations/oil-gas",
    description: "Oil & gas: wells and their pumps with the decline curve, pipeline integrity and compressors, exchangers and inspections",
    input: OilGasRequest,
    output: OilGasOperations,
  }),
  "reliability.summary": endpoint({
    method: "GET",
    path: "/reliability",
    description: "MTBF, MTTR and availability by class, the failure-mode Pareto, bad actors and failures per month",
    input: ReliabilityRequest,
    output: ReliabilitySummary,
  }),
  "reliability.weibull": endpoint({
    method: "GET",
    path: "/reliability/weibull",
    description: "Weibull fit (β, η with 90 % bounds) for one class and failure mode, with the probability plot and reliability curve",
    input: WeibullRequest,
    output: WeibullAnalysis,
  }),
  "reliability.risk": endpoint({
    method: "GET",
    path: "/reliability/risk",
    description: "5×5 risk matrix (likelihood of failing within a year × criticality) with the assets in a chosen cell",
    input: RiskRequest,
    output: RiskMatrix,
  }),
  "reliability.fmea": endpoint({
    method: "GET",
    path: "/reliability/fmea",
    description: "FMEA for one type of equipment: severity, occurrence, detection, RPN and maintenance strategy per failure mode",
    input: FmeaRequest,
    output: Fmea,
  }),
  "rca.list": endpoint({
    method: "GET",
    path: "/rca",
    description: "Root-cause analyses, most recently updated first",
    input: z.object({ assetId: Id.optional() }),
    output: list(RcaSummary),
  }),
  "rca.get": endpoint({
    method: "GET",
    path: "/rca/:rcaId",
    description: "One root-cause analysis with its timeline",
    input: z.object({ rcaId: Id }),
    output: Rca,
  }),
  "rca.create": endpoint({
    method: "POST",
    path: "/rca",
    description: "Start a root-cause analysis for an asset (optionally from one of its failures)",
    input: CreateRcaRequest,
    output: Rca,
  }),
  "rca.update": endpoint({
    method: "POST",
    path: "/rca/:rcaId",
    description: "Save the 5 whys, fishbone, root cause or status",
    input: UpdateRcaRequest,
    output: Rca,
  }),
  "rca.addAction": endpoint({
    method: "POST",
    path: "/rca/:rcaId/actions",
    description: "Add a corrective action, optionally raising a work order for it",
    input: AddActionRequest,
    output: Rca,
  }),
  "assets.failures": endpoint({
    method: "GET",
    path: "/assets/:assetId/failures",
    description: "An asset's failure history (ISO 14224 coded) with its KPIs and its class's",
    input: z.object({ assetId: Id }),
    output: AssetFailures,
  }),
  "operations.turbineTrend": endpoint({
    method: "GET",
    path: "/operations/power/turbines/:assetId/trend",
    description: "A gas turbine's heat rate and compressor efficiency against their ambient-corrected baseline, with washes and trips",
    input: TurbineTrendRequest,
    output: TurbineTrend,
  }),
  "operations.solar": endpoint({
    method: "GET",
    path: "/operations/solar",
    description: "Solar plants: power vs expected, performance ratio, loss waterfall, inverters, strings, batteries, cleaning advice",
    input: SolarOperationsRequest,
    output: SolarOperations,
  }),
  "assets.documents": endpoint({
    method: "GET",
    path: "/assets/:assetId/documents",
    description: "Manuals, P&IDs, datasheets, procedures, OEM bulletins and certificates for an asset",
    input: z.object({ assetId: Id }),
    output: list(AssetDocument),
  }),
  "assets.related": endpoint({
    method: "GET",
    path: "/assets/:assetId/related",
    description: "Parent, parts, same-area equipment and sister assets (same type, same site)",
    input: z.object({ assetId: Id }),
    output: RelatedAssets,
  }),
  "assets.comments": endpoint({
    method: "GET",
    path: "/assets/:assetId/comments",
    description: "The discussion about an asset, newest first",
    input: z.object({ assetId: Id }),
    output: list(AssetComment),
  }),
  "assets.addComment": endpoint({
    method: "POST",
    path: "/assets/:assetId/comments",
    description: "Add a comment; people named with @Full Name are mentioned",
    input: AddCommentRequest,
    output: AssetComment,
  }),
  "assets.tags": endpoint({
    method: "GET",
    path: "/assets/:assetId/tags",
    description: "All sensor tags on an asset, with their limits",
    input: z.object({ assetId: Id }),
    output: list(Tag),
  }),

  // ── Time series ──
  "timeseries.history": endpoint({
    method: "POST",
    path: "/timeseries/history",
    description: "Aggregated history (avg/min/max per interval, ≤ 2,000 points per tag). POST because tag lists can be long.",
    input: HistoryRequest,
    output: HistoryResponse,
  }),
  "timeseries.latest": endpoint({
    method: "POST",
    path: "/timeseries/latest",
    description: "Most recent value per tag — used on page load and after a reconnect, before live updates arrive",
    input: z.object({ tagIds: z.array(Id).min(1).max(MAX_SUBSCRIBED_TAGS) }),
    output: z.object({ values: z.array(LiveValue) }),
  }),

  // ── Predictions & risk ──
  "risks.top": endpoint({
    method: "GET",
    path: "/risks/top",
    description: "Assets ranked by probability × consequence (acceptance criterion A)",
    input: TopRisksParams,
    output: list(RiskItem),
  }),
  "predictions.list": endpoint({
    method: "GET",
    path: "/predictions",
    description: "Predictions with filters",
    input: PredictionListParams,
    output: page(Prediction),
  }),
  "predictions.get": endpoint({
    method: "GET",
    path: "/predictions/:predictionId",
    description: "One prediction with evidence, explanation, confidence and action (acceptance criterion B)",
    input: z.object({ predictionId: Id }),
    output: Prediction,
  }),
  "predictions.feedback": endpoint({
    method: "POST",
    path: "/predictions/:predictionId/feedback",
    description: "Record what a person found when checking the prediction (true/false positive, something else)",
    input: PredictionFeedbackRequest,
    output: Prediction,
  }),
  "predictions.triage": endpoint({
    method: "POST",
    path: "/predictions/:predictionId/triage",
    description: "Acknowledge, dismiss (with reason) or reopen a prediction",
    input: PredictionTriageRequest,
    output: Prediction,
  }),
  // Not under /predictions/… so it can't be mistaken for a prediction id by a real router.
  "predictions.feedbackSummary": endpoint({
    method: "GET",
    path: "/prediction-feedback/summary",
    description: "How often predictions were confirmed or rejected — the model-quality signal",
    input: z.object({ scopeId: ScopeId.optional() }),
    output: PredictionFeedbackSummary,
  }),
  "anomalies.fleet": endpoint({
    method: "GET",
    path: "/anomalies",
    description: "Every asset's anomaly score now, with its 24-hour trend and the sensors driving it",
    input: AnomalyFleetRequest,
    output: AnomalyFleetResponse,
  }),
  "anomalies.history": endpoint({
    method: "GET",
    path: "/assets/:assetId/anomaly-score",
    description: "Anomaly score over time for one asset, with the threshold that triggers predictions",
    input: AnomalyHistoryRequest,
    output: AnomalyHistory,
  }),

  // ── Alarms & events ──
  "alarms.list": endpoint({
    method: "GET",
    path: "/alarms",
    description: "Alarm list with filters, sorting and paging",
    input: AlarmListParams,
    output: page(Alarm),
  }),
  "alarms.analytics": endpoint({
    method: "GET",
    path: "/alarms/analytics",
    description: "Alarm system performance against ISA-18.2: rates, floods, bad actors, chattering, standing alarms",
    input: AlarmAnalyticsRequest,
    output: AlarmAnalytics,
  }),
  "alarms.summary": endpoint({
    method: "GET",
    path: "/alarms/summary",
    description: "Counts for the alarm bar (then kept fresh by alarm_summary live messages)",
    input: z.object({ scopeId: ScopeId.optional() }),
    output: AlarmSummary,
  }),
  "alarms.acknowledge": endpoint({
    method: "POST",
    path: "/alarms/acknowledge",
    description: "Acknowledge one or more alarms",
    input: AcknowledgeAlarmsRequest,
    output: list(Alarm),
  }),
  "alarms.shelve": endpoint({
    method: "POST",
    path: "/alarms/:alarmId/shelve",
    description: "Temporarily hide an alarm, with a required reason and expiry",
    input: ShelveAlarmRequest,
    output: Alarm,
  }),
  "alarms.unshelve": endpoint({
    method: "POST",
    path: "/alarms/:alarmId/unshelve",
    description: "Return a shelved alarm to the active list",
    input: UnshelveAlarmRequest,
    output: Alarm,
  }),
  "events.list": endpoint({
    method: "GET",
    path: "/events",
    description: "Timeline of alarms, operator actions, maintenance, process events and predictions",
    input: EventListParams,
    output: list(TimelineEvent),
  }),

  // ── KPIs & briefing ──
  "kpis.get": endpoint({
    method: "GET",
    path: "/kpis",
    description: "Command Center KPI strip for a scope",
    input: KpiParams,
    output: KpiResponse,
  }),
  "briefing.daily": endpoint({
    method: "GET",
    path: "/briefing/daily",
    description: "AI daily briefing with citations (scripted provider for now — ADR-0010)",
    input: z.object({ scopeId: ScopeId.optional() }),
    output: Briefing,
  }),

  // ── Work orders ──
  "workOrders.list": endpoint({
    method: "GET",
    path: "/work-orders",
    description: "Work orders with filters and paging",
    input: WorkOrderListParams,
    output: page(WorkOrder),
  }),
  "workOrders.create": endpoint({
    method: "POST",
    path: "/work-orders",
    description: "Create a work order, e.g. from an alarm (acceptance criterion C)",
    input: CreateWorkOrderRequest,
    output: WorkOrder,
  }),
  "workOrders.get": endpoint({
    method: "GET",
    path: "/work-orders/:workOrderId",
    description: "One work order with its history and close-out",
    input: z.object({ workOrderId: Id }),
    output: WorkOrder,
  }),
  "workOrders.transition": endpoint({
    method: "POST",
    path: "/work-orders/:workOrderId/transition",
    description: "Move a work order through its lifecycle (allowed moves: WORK_ORDER_TRANSITIONS)",
    input: TransitionWorkOrderRequest,
    output: WorkOrder,
  }),
  "workOrders.closeOut": endpoint({
    method: "POST",
    path: "/work-orders/:workOrderId/close-out",
    description: "Complete the work with ISO 14224 failure coding, findings and hours",
    input: CloseOutWorkOrderRequest,
    output: WorkOrder,
  }),
  "workOrders.reschedule": endpoint({
    method: "POST",
    path: "/work-orders/:workOrderId/reschedule",
    description: "Move scheduled work to another start time or technician (approved work needs approving again)",
    input: RescheduleWorkOrderRequest,
    output: WorkOrder,
  }),
} as const;

export type Endpoints = typeof endpoints;
export type EndpointName = keyof Endpoints;

/** What a caller passes in (fields with defaults are optional here). */
export type EndpointInput<N extends EndpointName> = z.input<Endpoints[N]["input"]>;
/** What a caller gets back. */
export type EndpointOutput<N extends EndpointName> = z.output<Endpoints[N]["output"]>;

/** Path parameter names in a path, e.g. "/assets/:assetId/tags" → ["assetId"]. */
export function pathParams(path: string): string[] {
  return [...path.matchAll(/:([A-Za-z][A-Za-z0-9]*)/g)].map((m) => m[1]!);
}
