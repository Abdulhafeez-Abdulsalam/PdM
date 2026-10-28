/**
 * Keyboard shortcuts (information architecture §7) and the cheat sheet that lists them (?).
 * Single keys never fire while typing in a text box, a list or a menu; Ctrl/Cmd + K works
 * anywhere. "g" then a letter must follow within 1.5 seconds.
 */
import { Modal } from "@pdm/ui";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useOverlays } from "../../shared/overlays";
import { usePreferences } from "../../shared/preferences";

/** The shortcuts, in the order the cheat sheet lists them. */
const SHORTCUTS = [
  // A space means "then" (a sequence); a "+" means together.
  ["Ctrl/⌘+K", "palette"],
  ["?", "help"],
  ["g h", "home"],
  ["g a", "assets"],
  ["g l", "alarms"],
  ["g m", "maintenance"],
  [".", "copilot"],
  ["[", "nav"],
  ["/", "search"],
  ["t", "timeRange"],
] as const;

const GO: Record<string, string> = { h: "/", a: "/assets", l: "/alarms", m: "/maintenance" };

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function useShortcuts() {
  const navigate = useNavigate();
  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      const overlays = useOverlays.getState();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        overlays.toggle("palette");
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target) || overlays.open) return;
      if (gAt && Date.now() - gAt < 1500 && GO[e.key]) {
        gAt = 0;
        e.preventDefault();
        void navigate({ to: GO[e.key] as "/" });
        return;
      }
      gAt = 0;
      switch (e.key) {
        case "g":
          gAt = Date.now();
          return;
        case "?":
          overlays.show("shortcuts");
          break;
        case ".":
          overlays.toggle("copilot");
          break;
        case "[": {
          const prefs = usePreferences.getState();
          prefs.set({ navCollapsed: !prefs.navCollapsed });
          break;
        }
        case "/": {
          const box = document.querySelector<HTMLInputElement>('main input[type="search"], main input:not([type])');
          if (!box) return;
          box.focus();
          break;
        }
        case "t": {
          const select = document.querySelector<HTMLSelectElement>('[data-shortcut="time-range"]');
          if (!select) return;
          select.focus();
          break;
        }
        default:
          return;
      }
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);
}

export function ShortcutSheet() {
  const { t } = useTranslation();
  const open = useOverlays((s) => s.open === "shortcuts");
  const { show, close } = useOverlays();
  return (
    <Modal
      open={open}
      onOpenChange={(o) => (o ? show("shortcuts") : close())}
      title={t("shortcuts.title")}
      description={t("shortcuts.intro")}
      closeLabel={t("common.close")}
    >
      <table className="w-full text-sm">
        <caption className="sr-only">{t("shortcuts.title")}</caption>
        <thead>
          <tr className="border-b border-line text-left text-xs text-fg-muted">
            <th scope="col" className="py-1 pr-3 font-medium">
              {t("shortcuts.keys")}
            </th>
            <th scope="col" className="py-1 font-medium">
              {t("shortcuts.does")}
            </th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map(([keys, what]) => (
            <tr key={what} className="border-b border-line last:border-0">
              <th scope="row" className="py-1.5 pr-3 text-left font-normal">
                {keys.split(" ").map((k, i) => (
                  <span key={i}>
                    {i > 0 && <span className="text-fg-muted"> {t("shortcuts.then")} </span>}
                    <kbd className="rounded border border-line bg-sunken px-1.5 py-0.5 font-mono text-xs">{k}</kbd>
                  </span>
                ))}
              </th>
              <td className="py-1.5">{t(`shortcuts.action.${what}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
