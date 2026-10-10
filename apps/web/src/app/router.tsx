/**
 * URLs → pages (information architecture §2). Routes are written out in code so you can
 * read the whole map in one file.
 */
import { createBrowserHistory, createRootRoute, createRoute, createRouter, redirect, type RouterHistory } from "@tanstack/react-router";
import { CommandCenterPage } from "../features/command-center/CommandCenterPage";
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
const BUILT: Partial<Record<ModuleId, () => React.JSX.Element>> = {
  "command-center": CommandCenterPage,
};

const moduleRoutes = MODULES.map((m) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: m.path,
    component: BUILT[m.id as ModuleId] ?? (() => <ModulePage moduleId={m.id as ModuleId} />),
  }),
);

const assetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assets/$assetId",
  component: () => <ModulePage moduleId="assets" />,
});

const routeTree = rootRoute.addChildren([indexRoute, ...moduleRoutes, assetRoute]);

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
