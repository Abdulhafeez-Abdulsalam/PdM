/**
 * URLs → pages (information architecture §2). Routes are written out in code so you can
 * read the whole map in one file.
 */
import { createRootRoute, createRoute, createRouter, redirect } from "@tanstack/react-router";
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
  // ?range=… is valid on every page.
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

const moduleRoutes = MODULES.map((m) =>
  createRoute({
    getParentRoute: () => rootRoute,
    path: m.path,
    component: () => <ModulePage moduleId={m.id as ModuleId} />,
  }),
);

const assetRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/assets/$assetId",
  component: () => <ModulePage moduleId="assets" />,
});

const routeTree = rootRoute.addChildren([indexRoute, ...moduleRoutes, assetRoute]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

// Lets TypeScript check every <Link to="…"> against the real routes.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
