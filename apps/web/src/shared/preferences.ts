/**
 * Personal preferences (IA §7): theme, units, time zone, role, collapsed menu.
 * Kept in the browser's local storage so they survive a reload. Personal on purpose —
 * a shared link opens in the recipient's own units and theme.
 */
import type { RoleId } from "@pdm/contracts";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const THEMES = ["light", "dark", "control-room"] as const;
export type Theme = (typeof THEMES)[number];

export const UNIT_SYSTEMS = ["si", "imperial", "oilfield"] as const;
export type UnitSystem = (typeof UNIT_SYSTEMS)[number];

export const TIME_ZONE_MODES = ["site", "utc", "user"] as const;
export type TimeZoneMode = (typeof TIME_ZONE_MODES)[number];

interface Preferences {
  theme: Theme;
  units: UnitSystem;
  timeZone: TimeZoneMode;
  /** Demo role switcher (ADR-0008). */
  role: RoleId;
  navCollapsed: boolean;
  set: (patch: Partial<Omit<Preferences, "set">>) => void;
}

function initialTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}

export const usePreferences = create<Preferences>()(
  persist(
    (set) => ({
      theme: initialTheme(),
      units: "si",
      timeZone: "site",
      role: "executive",
      navCollapsed: false,
      set: (patch) => set(patch),
    }),
    {
      name: "pdm-preferences",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: ({ set: _set, ...rest }) => rest,
    },
  ),
);
