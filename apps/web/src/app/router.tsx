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
const AlarmsPage = lazyRouteComponent(() => import("../features/alarms/AlarmsPage"), "AlarmsPage");
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
};

const moduleRoutes = MODULES.map((m) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: m.path,
    component: BUILT[m.id as ModuleId] ?? (() => <ModulePage moduleId={m.id as ModuleId} />),
  }),
);

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

const routeTree = rootRoute.addChildren([indexRoute, ...moduleRoutes, assetRoute, assetTabRoute]);

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
