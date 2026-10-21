import { useConnectionState } from "@pdm/api-client";
import { RoleId } from "@pdm/contracts";
import { Select, cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { Menu, SlidersHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import { THEMES, TIME_ZONE_MODES, UNIT_SYSTEMS, usePreferences } from "../../shared/preferences";
import { ScopeSelector } from "../../features/hierarchy/ScopeSelector";
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
        <span>{t("app.name")}</span>
      </Link>

      <ScopeSelector />

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <TimeRangeSelect />
        <span className="hidden sm:inline-flex">
          <Select
            label={t("topBar.role")}
            value={prefs.role}
            options={RoleId.options.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
            onChange={(role) => prefs.set({ role })}
          />
        </span>
        <DisplayMenu />
        <ConnectionIndicator />
      </div>
    </header>
  );
}

function TimeRangeSelect() {
  const { t } = useTranslation();
  const { range } = useGlobalSearch();
  const setSearch = useSetGlobalSearch();
  return (
    <Select
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
          <Select
            label={t("topBar.role")}
            value={prefs.role}
            options={RoleId.options.map((r) => ({ value: r, label: t(`roles.${r}`) }))}
            onChange={(role) => prefs.set({ role })}
          />
        </span>
      </div>
    </details>
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
