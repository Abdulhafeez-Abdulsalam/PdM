/**
 * The frame around every page (information architecture §1):
 *   top bar · alarm bar · [side menu | page content]
 */
import { useConnectionState } from "@pdm/api-client";
import { Banner } from "@pdm/ui";
import { Outlet, useLocation } from "@tanstack/react-router";
import { WifiOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PredictionDrawer } from "../../features/predictions/PredictionDrawer";
import { moduleForPath } from "../../shared/modules";
import { NoAccess } from "../../shared/NoAccess";
import { usePreferences } from "../../shared/preferences";
import { accessFor } from "../../shared/roles/roles";
import { Toaster } from "../../shared/toast";
import { AlarmBar } from "./AlarmBar";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

export function AppShell() {
  const { t } = useTranslation();
  const connection = useConnectionState();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Every page checks the role matrix, not just the menu: a typed or shared address included.
  const { pathname } = useLocation();
  const role = usePreferences((p) => p.role);
  const moduleId = moduleForPath(pathname);
  const blocked = moduleId !== null && accessFor(role, moduleId) === "none";

  return (
    // On paper only the page itself prints: the bars, menu, drawer and toasts hide (print: classes).
    <div className="flex h-dvh flex-col bg-canvas text-fg print:block print:h-auto">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:absolute focus:top-2 focus:left-2"
      >
        {t("app.skipToContent")}
      </a>
      <div className="contents print:hidden">
        <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
        <AlarmBar />
        {connection === "offline" && (
          <Banner tone="warning">
            <WifiOff aria-hidden className="size-4" />
            {t("connection.offlineBanner")}
          </Banner>
        )}
      </div>
      <div className="flex min-h-0 flex-1 print:block">
        <div className="contents print:hidden">
          <SideNav mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
        </div>
        {/* `relative` keeps absolutely-positioned helpers (e.g. screen-reader-only text) inside this scroll area. */}
        <main id="main" tabIndex={-1} className="relative min-w-0 flex-1 overflow-auto p-4 md:p-6 print:overflow-visible print:p-0">
          {blocked ? <NoAccess moduleId={moduleId} /> : <Outlet />}
        </main>
      </div>
      <div className="contents print:hidden">
        <PredictionDrawer />
        <Toaster />
      </div>
    </div>
  );
}
