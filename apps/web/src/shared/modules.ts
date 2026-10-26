/**
 * The 16 modules (information architecture §2–3): URL, menu group, icon, and the phase
 * in which each is built. Names and descriptions live in the text catalog under modules.<id>.
 */
import {
  Box,
  Boxes,
  BrainCircuit,
  ClipboardList,
  Database,
  DollarSign,
  Factory,
  FileChartColumn,
  HeartPulse,
  LayoutDashboard,
  Leaf,
  Settings,
  ShieldCheck,
  Siren,
  Smartphone,
  Warehouse,
  type LucideIcon,
} from "lucide-react";

export const NAV_GROUPS = ["monitor", "predict", "act", "govern", "system"] as const;
export type NavGroup = (typeof NAV_GROUPS)[number];

export interface ModuleDef {
  id: string;
  path: `/${string}`;
  group: NavGroup;
  icon: LucideIcon;
  phase: 1 | 2 | 3 | 4;
}

export const MODULES = [
  { id: "command-center", path: "/command-center", group: "monitor", icon: LayoutDashboard, phase: 1 },
  { id: "assets", path: "/assets", group: "monitor", icon: Boxes, phase: 1 },
  { id: "alarms", path: "/alarms", group: "monitor", icon: Siren, phase: 1 },
  { id: "operations", path: "/operations", group: "monitor", icon: Factory, phase: 3 },
  { id: "twin", path: "/twin", group: "monitor", icon: Box, phase: 3 },
  { id: "predictive", path: "/predictive", group: "predict", icon: BrainCircuit, phase: 2 },
  { id: "reliability", path: "/reliability", group: "predict", icon: HeartPulse, phase: 3 },
  { id: "maintenance", path: "/maintenance", group: "act", icon: ClipboardList, phase: 2 },
  { id: "field", path: "/field", group: "act", icon: Smartphone, phase: 2 },
  { id: "inventory", path: "/inventory", group: "act", icon: Warehouse, phase: 4 },
  { id: "hse", path: "/hse", group: "govern", icon: ShieldCheck, phase: 4 },
  { id: "esg", path: "/esg", group: "govern", icon: Leaf, phase: 4 },
  { id: "financials", path: "/financials", group: "govern", icon: DollarSign, phase: 4 },
  { id: "reports", path: "/reports", group: "govern", icon: FileChartColumn, phase: 4 },
  { id: "data", path: "/data", group: "system", icon: Database, phase: 4 },
  { id: "admin", path: "/admin", group: "system", icon: Settings, phase: 4 },
] as const satisfies readonly ModuleDef[];

export type Module = (typeof MODULES)[number];
export type ModuleId = Module["id"];

/** The phase currently being built. Modules from later phases show as "planned" in demo mode. */
export const CURRENT_PHASE = 3;

/** Modules with a real screen (the rest show a placeholder). */
export const BUILT_MODULES: ReadonlySet<ModuleId> = new Set<ModuleId>([
  "command-center",
  "assets",
  "alarms",
  "operations",
  "twin",
  "predictive",
  "reliability",
  "maintenance",
  "field",
  "inventory",
  "hse",
  "esg",
  "financials",
  "reports",
]);

export function moduleById(id: ModuleId): Module {
  const found = MODULES.find((m) => m.id === id);
  if (!found) throw new Error(`Unknown module ${id}`);
  return found;
}
