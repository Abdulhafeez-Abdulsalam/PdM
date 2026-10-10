/**
 * Left menu, grouped by purpose (IA §3). Shows only modules the current role uses (ADR-0008).
 * Modules from later phases appear greyed with their phase, so stakeholders see the roadmap.
 */
import { cx } from "@pdm/ui";
import { Link } from "@tanstack/react-router";
import { X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CURRENT_PHASE, MODULES, NAV_GROUPS } from "../../shared/modules";
import { usePreferences } from "../../shared/preferences";
import { canSee } from "../../shared/roles/roles";
import { SimulationPanel } from "./SimulationPanel";

export function SideNav({ mobileOpen, onCloseMobile }: { mobileOpen: boolean; onCloseMobile: () => void }) {
  const { t } = useTranslation();
  const role = usePreferences((p) => p.role);
  const collapsed = usePreferences((p) => p.navCollapsed);

  return (
    <>
      {/* Dimmed backdrop behind the drawer on phones */}
      {mobileOpen && <div aria-hidden className="fixed inset-0 z-30 bg-scrim md:hidden" onClick={onCloseMobile} />}
      <nav
        aria-label={t("nav.label")}
        className={cx(
          "flex shrink-0 flex-col border-r border-line bg-surface",
          // Phones: a drawer that slides over the page. Desktop: always there.
          "fixed inset-y-0 left-0 z-40 w-64 md:static md:z-auto",
          mobileOpen ? "flex" : "hidden md:flex",
          collapsed ? "md:w-16" : "md:w-60",
        )}
      >
        <div className="flex justify-end p-2 md:hidden">
          <button type="button" className="rounded-md p-2 hover:bg-sunken" aria-label={t("nav.close")} onClick={onCloseMobile}>
            <X aria-hidden className="size-5" />
          </button>
        </div>
        <div className="relative flex-1 overflow-y-auto py-3">
          {NAV_GROUPS.map((group) => {
            const visible = MODULES.filter((m) => m.group === group && canSee(role, m.id));
            if (visible.length === 0) return null;
            return (
              <section key={group} className="mb-4" aria-labelledby={`nav-${group}`}>
                <h2 id={`nav-${group}`} className={cx("px-4 pb-1 text-xs font-semibold uppercase tracking-wide text-fg-muted", collapsed && "md:sr-only")}>
                  {t(`nav.groups.${group}`)}
                </h2>
                <ul>
                  {visible.map((m) => {
                    const Icon = m.icon;
                    const name = t(`modules.${m.id}.name`);
                    const planned = m.phase > CURRENT_PHASE;
                    return (
                      <li key={m.id}>
                        <Link
                          to={m.path}
                          search={(prev) => prev}
                          onClick={onCloseMobile}
                          title={collapsed ? name : undefined}
                          className={cx(
                            "mx-2 flex items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-sunken",
                            planned ? "text-fg-muted" : "text-fg",
                          )}
                          activeProps={{ className: "bg-sunken font-semibold text-accent!", "aria-current": "page" }}
                        >
                          <Icon aria-hidden className="size-5 shrink-0" />
                          <span className={cx("flex-1 truncate", collapsed && "md:sr-only")}>{name}</span>
                          {planned && (
                            <span className={cx("rounded border border-line px-1 text-[10px] text-fg-muted", collapsed && "md:hidden")}>
                              {t("nav.plannedPhase", { phase: m.phase })}
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <div className={cx(collapsed && "md:hidden")}>
          <SimulationPanel />
        </div>
      </nav>
    </>
  );
}
