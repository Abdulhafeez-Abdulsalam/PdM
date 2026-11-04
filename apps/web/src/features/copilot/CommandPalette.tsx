/**
 * The command palette (Ctrl/Cmd + K, information architecture §7): type to jump to any page your
 * role can open, any asset, or to ask the copilot. Arrow keys move through the results, Enter
 * opens one, Escape closes. It follows the ARIA combobox pattern: the text box says which result
 * is highlighted (aria-activedescendant), so a screen reader announces it.
 */
import { useApiQuery } from "@pdm/api-client";
import { Modal } from "@pdm/ui";
import { useNavigate } from "@tanstack/react-router";
import { Boxes, CornerDownLeft, FileText, Keyboard, Sparkles } from "lucide-react";
import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { MODULES, moduleForPath } from "../../shared/modules";
import { useOverlays } from "../../shared/overlays";
import { usePreferences } from "../../shared/preferences";
import { accessFor } from "../../shared/roles/roles";

/** Pages beyond each module's own, with the label their tab already uses. */
const SUB_PAGES: readonly (readonly [path: string, labelKey: string])[] = [
  ["/assets/compare", "assetsNav.compare"],
  ["/alarms/analytics", "alarmsNav.analytics"],
  ["/operations/power", "operationsNav.power"],
  ["/operations/solar", "operationsNav.solar"],
  ["/operations/oil-gas", "operationsNav.oilGas"],
  ["/predictive/anomalies", "predictiveNav.anomalies"],
  ["/predictive/models", "predictiveNav.models"],
  ["/predictive/rules", "predictiveNav.rules"],
  ["/predictive/what-if", "predictiveNav.whatIf"],
  ["/reliability/weibull", "reliabilityNav.weibull"],
  ["/reliability/risk", "reliabilityNav.risk"],
  ["/reliability/fmea", "reliabilityNav.fmea"],
  ["/reliability/rca", "reliabilityNav.rca"],
  ["/hse/permits", "hse.nav.permits"],
  ["/hse/incidents", "hse.nav.incidents"],
  ["/hse/moc", "hse.nav.moc"],
  ["/reports/handover", "reports.nav.handover"],
  ["/reports/build", "reports.nav.build"],
  ["/data/tags", "data.nav.tags"],
  ["/admin/users", "admin.nav.users"],
  ["/admin/roles", "admin.nav.roles"],
  ["/admin/hierarchy", "admin.nav.hierarchy"],
  ["/admin/audit", "admin.nav.audit"],
];

interface Item {
  id: string;
  label: string;
  hint: string;
  icon: ReactNode;
  run: () => void;
}

export function CommandPalette() {
  const { t } = useTranslation();
  const open = useOverlays((s) => s.open === "palette");
  const { show, close } = useOverlays();
  // The dialog unmounts its contents when closed, so each opening starts with an empty search.
  return (
    <Modal open={open} onOpenChange={(o) => (o ? show("palette") : close())} title={t("palette.title")} closeLabel={t("common.close")}>
      <PaletteBody />
    </Modal>
  );
}

function PaletteBody() {
  const { t } = useTranslation();
  const { show, close, ask } = useOverlays();
  const role = usePreferences((p) => p.role);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  // The highlighted row belongs to the query it was chosen for; type something new and it's the top row again.
  const [highlight, setHighlight] = useState({ q, index: 0 });
  const assets = useApiQuery("assets.list", { search: query.trim(), limit: 5 }, { enabled: q.length >= 2 });

  const items = useMemo<Item[]>(() => {
    const go = (path: string) => () => {
      close();
      // Keep the app-wide time range and scope, as the menu does; a page's own filters stay behind.
      void navigate({
        to: path as "/",
        search: (prev: { range?: unknown; scope?: unknown }) => ({ range: prev.range, scope: prev.scope }) as never,
      });
    };
    const pages = [
      ...MODULES.map((m) => ({ path: m.path as string, label: t(`modules.${m.id}.name`) })),
      ...SUB_PAGES.map(([path, key]) => {
        const module = moduleForPath(path);
        return { path, label: `${module ? t(`modules.${module}.name`) : ""} › ${t(key)}` };
      }),
    ].filter((p) => {
      const module = moduleForPath(p.path);
      return (!module || accessFor(role, module) !== "none") && (!q || p.label.toLowerCase().includes(q));
    });
    const out: Item[] = pages.slice(0, q ? 8 : 6).map((p) => ({
      id: `page-${p.path}`,
      label: p.label,
      hint: t("palette.page"),
      icon: <FileText aria-hidden className="size-4" />,
      run: go(p.path),
    }));
    if (q.length >= 2 && accessFor(role, "assets") !== "none")
      for (const a of assets.data?.items ?? [])
        out.push({
          id: `asset-${a.id}`,
          label: `${a.id} · ${a.name}`,
          hint: t("palette.asset"),
          icon: <Boxes aria-hidden className="size-4" />,
          run: go(`/assets/${a.id}/overview`),
        });
    if (q)
      out.push({
        id: "ask",
        label: t("palette.ask", { question: query.trim() }),
        hint: t("palette.copilot"),
        icon: <Sparkles aria-hidden className="size-4" />,
        run: () => ask(query.trim()),
      });
    out.push({
      id: "shortcuts",
      label: t("palette.shortcuts"),
      hint: t("palette.help"),
      icon: <Keyboard aria-hidden className="size-4" />,
      run: () => show("shortcuts"),
    });
    return out;
  }, [q, query, role, assets.data, t, close, navigate, ask, show]);

  const current = Math.min(highlight.q === q ? highlight.index : 0, items.length - 1);
  const setActive = (index: number) => setHighlight({ q, index });

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      setActive((current + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      items[current]?.run();
    }
  };

  return (
    <>
      <input
        data-autofocus
        role="combobox"
        aria-expanded
        aria-controls="palette-results"
        aria-activedescendant={items[current] ? `palette-${items[current]!.id}` : undefined}
        aria-label={t("palette.label")}
        autoComplete="off"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={onKey}
        placeholder={t("palette.placeholder")}
        className="mb-2 h-10 w-full rounded-md border border-line bg-surface px-3 text-sm"
      />
      <p role="status" className="sr-only">
        {t("palette.count", { count: items.length })}
      </p>
      <ul id="palette-results" role="listbox" aria-label={t("palette.results")} className="flex max-h-80 flex-col overflow-y-auto">
        {items.map((item, i) => (
          // Keyboard users stay in the text box, which handles the arrows and Enter for every option
          // (aria-activedescendant); the click is for the mouse.
          // eslint-disable-next-line jsx-a11y/click-events-have-key-events
          <li
            key={item.id}
            id={`palette-${item.id}`}
            role="option"
            aria-selected={i === current}
            onMouseEnter={() => setActive(i)}
            onClick={item.run}
            className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm ${i === current ? "bg-sunken" : ""}`}
          >
            <span className="text-fg-muted">{item.icon}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            <span className="text-xs text-fg-muted">{item.hint}</span>
            {i === current && <CornerDownLeft aria-hidden className="size-3.5 text-fg-muted" />}
          </li>
        ))}
      </ul>
    </>
  );
}
