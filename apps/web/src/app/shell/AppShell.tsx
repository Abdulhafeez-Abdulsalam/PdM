/**
 * The frame around every page (information architecture §1):
 *   top bar · alarm bar · [side menu | page content]
 */
import { useConnectionState } from "@pdm/api-client";
import { Banner } from "@pdm/ui";
import { Outlet } from "@tanstack/react-router";
import { WifiOff } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { PredictionDrawer } from "../../features/predictions/PredictionDrawer";
import { Toaster } from "../../shared/toast";
import { AlarmBar } from "./AlarmBar";
import { SideNav } from "./SideNav";
import { TopBar } from "./TopBar";

export function AppShell() {
  const { t } = useTranslation();
  const connection = useConnectionState();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  return (
    <div className="flex h-dvh flex-col bg-canvas text-fg">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-3 py-2 text-accent-fg focus:not-sr-only focus:absolute focus:left-2 focus:top-2"
      >
        {t("app.skipToContent")}
      </a>
      <TopBar onOpenMobileNav={() => setMobileNavOpen(true)} />
      <AlarmBar />
      {connection === "offline" && (
        <Banner tone="warning">
          <WifiOff aria-hidden className="size-4" />
          {t("connection.offlineBanner")}
        </Banner>
      )}
      <div className="flex min-h-0 flex-1">
        <SideNav mobileOpen={mobileNavOpen} onCloseMobile={() => setMobileNavOpen(false)} />
        {/* `relative` keeps absolutely-positioned helpers (e.g. screen-reader-only text) inside this scroll area. */}
        <main id="main" tabIndex={-1} className="relative min-w-0 flex-1 overflow-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
      <PredictionDrawer />
      <Toaster />
    </div>
  );
}
