import { useConnectionState } from "@pdm/api-client";
import { RoleId } from "@pdm/contracts";
import { Button, Select, cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { Menu, Search, SlidersHorizontal, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { THEMES, TIME_ZONE_MODES, UNIT_SYSTEMS, usePreferences } from "../../shared/preferences";
import { ScopeSelector } from "../../features/hierarchy/ScopeSelector";
import { useOverlays } from "../../shared/overlays";
import { useSession } from "../SessionGate";
import { TIME_RANGES, useGlobalSearch, useSetGlobalSearch } from "../../shared/time-range";

export function TopBar({ onOpenMobileNav }: { onOpenMobileNav: () => void }) {
  const { t } = useTranslation();
  const prefs = usePreferences();
  const navCollapsed = prefs.navCollapsed;

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      {/* Phones: open the menu drawer. Desktop: collapse the menu to icons. */}
      <button type="button" className="rounded-md p-2 hover:bg-sunken md:hidden" aria-label={t("nav.open")} onClick={onOpenMobileNav}>
        <Menu aria-hidden className="size-5" />
      </button>
      <button
        type="button"
        className="hidden rounded-md p-2 hover:bg-sunken md:inline-flex"
        aria-label={navCollapsed ? t("nav.expand") : t("nav.collapse")}
        aria-pressed={navCollapsed}
        onClick={() => prefs.set({ navCollapsed: !navCollapsed })}
      >
        <Menu aria-hidden className="size-5" />
      </button>

      <Link to="/" className="flex shrink-0 items-center gap-2 font-semibold">
        <img src="/favicon.svg" alt="" className="size-7" />
        {/* On a phone the logo alone, to leave room; the name still names the link for screen readers. */}
        <span className="sr-only sm:not-sr-only">{t("app.name")}</span>
      </Link>

      <ScopeSelector />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <AssistButtons />
        <TimeRangeSelect />
        <span className="hidden sm:inline-flex">
          <WhoAmI />
        </span>
        <DisplayMenu />
        <ConnectionIndicator />
      </div>
    </header>
  );
}

/** Search everything (Ctrl/Cmd + K, from small screens up) and the copilot (.): icons, with words on wide screens. */
function AssistButtons() {
  const { t } = useTranslation();
  const show = useOverlays((s) => s.show);
  const button = "items-center gap-1.5 rounded-md border border-line px-2 py-1.5 text-sm hover:bg-sunken";
  return (
    <>
      {/* The palette is a keyboard tool (Ctrl/Cmd + K): on a phone there's no room in the bar, and no Ctrl key. */}
      <button
        type="button"
        className={cx(button, "hidden sm:inline-flex")}
        onClick={() => show("palette")}
        aria-label={t("palette.open")}
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search aria-hidden className="size-4" />
        <kbd className="hidden font-mono text-xs text-fg-muted lg:inline">{t("palette.keys")}</kbd>
      </button>
      <button
        type="button"
        className={cx(button, "inline-flex")}
        onClick={() => show("copilot")}
        aria-label={t("copilot.open")}
        aria-keyshortcuts="."
      >
        <Sparkles aria-hidden className="size-4" />
        <span className="hidden lg:inline">{t("copilot.short")}</span>
      </button>
    </>
  );
}

function TimeRangeSelect() {
  const { t } = useTranslation();
  const { range } = useGlobalSearch();
  const setSearch = useSetGlobalSearch();
  return (
    <Select
      data-shortcut="time-range"
      label={t("topBar.timeRange")}
      hideLabel
      value={range}
      options={TIME_RANGES.map((r) => ({ value: r, label: t(`timeRange.${r}`) }))}
      onChange={(next) => setSearch({ range: next })} // stays on this page; only ?range= changes
    />
  );
}

/** Theme, units and time zone — personal display preferences. */
function DisplayMenu() {
  const { t } = useTranslation();
  const prefs = usePreferences();
  return (
    <details className="relative">
      <summary
        className="flex cursor-pointer list-none items-center gap-1 rounded-md p-2 hover:bg-sunken [&::-webkit-details-marker]:hidden"
        aria-label={t("topBar.display")}
      >
        <SlidersHorizontal aria-hidden className="size-5" />
      </summary>
      <div className="absolute right-0 z-40 mt-2 flex w-64 flex-col gap-3 rounded-lg border border-line bg-raised p-4 shadow-2">
        <Select
          label={t("topBar.theme")}
          value={prefs.theme}
          options={THEMES.map((v) => ({ value: v, label: t(`theme.${v}`) }))}
          onChange={(theme) => prefs.set({ theme })}
        />
        <Select
          label={t("topBar.units")}
          value={prefs.units}
          options={UNIT_SYSTEMS.map((v) => ({ value: v, label: t(`units.${v}`) }))}
          onChange={(units) => prefs.set({ units })}
        />
        <Select
          label={t("topBar.timeZone")}
          value={prefs.timeZone}
          options={TIME_ZONE_MODES.map((v) => ({ value: v, label: t(`timeZone.${v}`) }))}
          onChange={(timeZone) => prefs.set({ timeZone })}
        />
        <span className="sm:hidden">
          <WhoAmI />
        </span>
      </div>
    </details>
  );
}

/** Demo mode: the role to view the app as. Server mode: who is signed in, and signing out (ADR-0014). */
function WhoAmI() {
  const { t } = useTranslation();
  const prefs = usePreferences();
  const session = useSession();
  if (session) {
    return (
      <span className="flex items-center gap-2 text-sm">
        <span className="max-w-40 truncate">
          <span className="text-fg-muted">{t("session.signedInAs")}</span> <span className="font-medium">{session.user.name}</span>
        </span>
        <Button size="sm" onClick={session.signOut}>
          {t("session.signOut")}
        </Button>
      </span>
    );
  }
  return (
    <Select
      label={t("topBar.role")}
      value={prefs.role}
      options={RoleId.options.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
      onChange={(role) => prefs.set({ role })}
    />
  );
}

function ConnectionIndicator() {
  const { t } = useTranslation();
  const state = useConnectionState();
  const dot = { connecting: "bg-health-degraded", live: "bg-health-healthy", offline: "bg-health-critical" }[state];
  return (
    <span role="status" className="flex items-center gap-1.5 px-1 text-xs text-fg-muted">
      <span aria-hidden className={cx("size-2 rounded-full", dot)} />
      <span className="hidden md:inline">{t(`connection.${state}`)}</span>
      <span className="sr-only md:hidden">{t(`connection.${state}`)}</span>
    </span>
  );
}
