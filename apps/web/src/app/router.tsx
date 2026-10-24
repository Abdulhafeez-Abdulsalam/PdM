/**
 * URLs → pages (information architecture §2). Routes are written out in code so you can
 * read the whole map in one file.
 */
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  lazyRouteComponent,
  redirect,
  type RouteComponent,
  type RouterHistory,
} from "@tanstack/react-router";
import { CommandCenterPage } from "../features/command-center/CommandCenterPage";

// Pages other than the home page load their code only when first visited (code-splitting).
const AssetPage = lazyRouteComponent(() => import("../features/assets/AssetPage"), "AssetPage");
const AssetRegistryPage = lazyRouteComponent(() => import("../features/assets/AssetRegistryPage"), "AssetRegistryPage");
const ComparePage = lazyRouteComponent(() => import("../features/assets/ComparePage"), "ComparePage");
const AlarmsPage = lazyRouteComponent(() => import("../features/alarms/AlarmsPage"), "AlarmsPage");
const AlarmAnalyticsPage = lazyRouteComponent(() => import("../features/alarms/AlarmAnalyticsPage"), "AlarmAnalyticsPage");
const PredictionConsolePage = lazyRouteComponent(() => import("../features/predictions/PredictionConsolePage"), "PredictionConsolePage");
const PredictionPage = lazyRouteComponent(() => import("../features/predictions/PredictionPage"), "PredictionPage");
const AnomaliesPage = lazyRouteComponent(() => import("../features/predictions/AnomaliesPage"), "AnomaliesPage");
const MaintenancePage = lazyRouteComponent(() => import("../features/maintenance/MaintenancePage"), "MaintenancePage");
const WorkOrderPage = lazyRouteComponent(() => import("../features/maintenance/WorkOrderPage"), "WorkOrderPage");
const ScheduleBoardPage = lazyRouteComponent(() => import("../features/maintenance/ScheduleBoardPage"), "ScheduleBoardPage");
const PmPage = lazyRouteComponent(() => import("../features/maintenance/PmPage"), "PmPage");
const PmPlanPage = lazyRouteComponent(() => import("../features/maintenance/PmPlanPage"), "PmPlanPage");
const FieldPage = lazyRouteComponent(() => import("../features/field/FieldPage"), "FieldPage");
const TaskPage = lazyRouteComponent(() => import("../features/field/TaskPage"), "TaskPage");
const ReliabilityPage = lazyRouteComponent(() => import("../features/reliability/ReliabilityPage"), "ReliabilityPage");
const WeibullPage = lazyRouteComponent(() => import("../features/reliability/WeibullPage"), "WeibullPage");
const RiskPage = lazyRouteComponent(() => import("../features/reliability/RiskPage"), "RiskPage");
const FmeaPage = lazyRouteComponent(() => import("../features/reliability/FmeaPage"), "FmeaPage");
const TwinPage = lazyRouteComponent(() => import("../features/twin/TwinPage"), "TwinPage");
const InventoryPage = lazyRouteComponent(() => import("../features/inventory/InventoryPage"), "InventoryPage");
const PartPage = lazyRouteComponent(() => import("../features/inventory/PartPage"), "PartPage");
const HsePage = lazyRouteComponent(() => import("../features/hse/HsePage"), "HsePage");
const PermitsPage = lazyRouteComponent(() => import("../features/hse/PermitsPage"), "PermitsPage");
const IncidentsPage = lazyRouteComponent(() => import("../features/hse/IncidentsPage"), "IncidentsPage");
const MocPage = lazyRouteComponent(() => import("../features/hse/MocPage"), "MocPage");
const EsgPage = lazyRouteComponent(() => import("../features/esg/EsgPage"), "EsgPage");
const RcaListPage = lazyRouteComponent(() => import("../features/reliability/RcaListPage"), "RcaListPage");
const RcaPage = lazyRouteComponent(() => import("../features/reliability/RcaPage"), "RcaPage");
const PowerPage = lazyRouteComponent(() => import("../features/operations/PowerPage"), "PowerPage");
const SolarPage = lazyRouteComponent(() => import("../features/operations/SolarPage"), "SolarPage");
const OilGasPage = lazyRouteComponent(() => import("../features/operations/OilGasPage"), "OilGasPage");
const LiveLoadPage = lazyRouteComponent(() => import("../features/diagnostics/LiveLoadPage"), "LiveLoadPage");
import { ErrorPage } from "../features/module-page/ErrorPage";
import { ModulePage } from "../features/module-page/ModulePage";
import { NotFoundPage } from "../features/module-page/NotFoundPage";
import { MODULES, moduleById, type ModuleId } from "../shared/modules";
import { usePreferences } from "../shared/preferences";
import { homeFor } from "../shared/roles/roles";
import { globalSearchSchema } from "../shared/time-range";
import { AppShell } from "./shell/AppShell";

const rootRoute = createRootRoute({
  component: AppShell,
  notFoundComponent: NotFoundPage,
  errorComponent: ErrorPage,
  // ?range=… and ?scope=… are valid on every page.
  validateSearch: (search) => globalSearchSchema.parse(search),
});

/** "/" sends each role to its home page. */
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  beforeLoad: ({ search }) => {
    const home = moduleById(homeFor(usePreferences.getState().role));
    throw redirect({ to: home.path, search });
  },
});

/** Pages that are built. Every other module shows its placeholder. */
const BUILT: Partial<Record<ModuleId, RouteComponent>> = {
  "command-center": CommandCenterPage,
  assets: AssetRegistryPage,
  alarms: AlarmsPage,
  predictive: PredictionConsolePage,
  reliability: ReliabilityPage,
  twin: TwinPage,
  inventory: InventoryPage,
  hse: HsePage,
  esg: EsgPage,
  maintenance: MaintenancePage,
  field: FieldPage,
};

const moduleRoutes = MODULES.filter((m) => m.id !== "operations").map((m) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: m.path,
    component: BUILT[m.id as ModuleId] ?? (() => <ModulePage moduleId={m.id as ModuleId} />),
  }),
);

/** Operations has one page per industry; /operations opens the first in its menu (gas-to-power). */
const operationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/operations",
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/operations/power", search });
  },
});

/** Oil & gas operations (?part=upstream|midstream|downstream). */
const oilGasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/operations/oil-gas",
  component: OilGasPage,
});

/** Weibull analysis (?class=…&mode=…). A fixed path under the Reliability module. */
const weibullRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reliability/weibull",
  component: WeibullPage,
});

/** The risk matrix (?l=…&c=… picks a cell). */
const riskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reliability/risk",
  component: RiskPage,
});

/** FMEA for one type of equipment (?class=…). */
const fmeaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reliability/fmea",
  component: FmeaPage,
});

/** Root-cause analyses (?asset=… fills in the new-investigation form). */
const rcaListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reliability/rca",
  component: RcaListPage,
});

/** One root-cause analysis. */
const rcaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reliability/rca/$rcaId",
  component: RcaPage,
});

/** Solar operations. */
const solarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/operations/solar",
  component: SolarPage,
});

/** Gas-to-power operations. */
const powerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/operations/power",
  component: PowerPage,
});

/** Fleet comparison. A fixed path, so it wins over /assets/$assetId. */
const compareRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assets/compare",
  component: ComparePage,
});

/** /assets/GT-101 → /assets/GT-101/overview */
const assetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assets/$assetId",
  beforeLoad: ({ params, search }) => {
    throw redirect({ to: "/assets/$assetId/$tab", params: { ...params, tab: "overview" }, search });
  },
});

/** Asset 360, one URL per tab. */
const assetTabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assets/$assetId/$tab",
  component: AssetPage,
});

/** Alarm system performance (ISA-18.2). */
const alarmAnalyticsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/alarms/analytics",
  component: AlarmAnalyticsPage,
});

/** The fleet anomaly view. A fixed path, so it wins over /predictive/$predictionId. */
const anomaliesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/predictive/anomalies",
  component: AnomaliesPage,
});

/** One prediction, full page. */
const predictionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/predictive/$predictionId",
  component: PredictionPage,
});

/** One work order. */
const workOrderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/maintenance/$workOrderId",
  component: WorkOrderPage,
});

/** The schedule board. A fixed path, so it wins over /maintenance/$workOrderId. */
const scheduleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/maintenance/schedule",
  component: ScheduleBoardPage,
});

/** PM programs (?class=…). Fixed paths, so they win over /maintenance/$workOrderId. */
const pmRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/maintenance/pm",
  component: PmPage,
});

/** One PM plan. */
const pmPlanRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/maintenance/pm/$planId",
  component: PmPlanPage,
});

/** HSE: permits to work (?show=…), incidents, management of change. */
const permitsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/hse/permits", component: PermitsPage });
const incidentsRoute = createRoute({ getParentRoute: () => rootRoute, path: "/hse/incidents", component: IncidentsPage });
const mocRoute = createRoute({ getParentRoute: () => rootRoute, path: "/hse/moc", component: MocPage });

/** One spare part. */
const partRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inventory/parts/$partNumber",
  component: PartPage,
});

/** One field task (a work order as the technician works through it). */
const taskRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/field/tasks/$taskId",
  component: TaskPage,
});

/** Diagnostics: 300 live tags on one screen, for the criterion E performance test. Not in the menu. */
const liveLoadRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/diagnostics/live-load",
  component: LiveLoadPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  ...moduleRoutes,
  operationsRoute,
  powerRoute,
  solarRoute,
  oilGasRoute,
  weibullRoute,
  riskRoute,
  fmeaRoute,
  rcaListRoute,
  rcaRoute,
  compareRoute,
  assetRoute,
  assetTabRoute,
  predictionRoute,
  anomaliesRoute,
  alarmAnalyticsRoute,
  workOrderRoute,
  scheduleRoute,
  pmRoute,
  pmPlanRoute,
  partRoute,
  permitsRoute,
  incidentsRoute,
  mocRoute,
  taskRoute,
  liveLoadRoute,
]);

/** Tests pass an in-memory history; the app uses the browser's address bar. */
export function createAppRouter(history: RouterHistory = createBrowserHistory()) {
  return createRouter({ routeTree, history, defaultPreload: "intent" });
}

// Lets TypeScript check every <Link to="…"> against the real routes.
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof createAppRouter>;
  }
}
