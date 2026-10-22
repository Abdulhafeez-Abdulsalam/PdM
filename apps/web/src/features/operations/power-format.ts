/** Number formats shared by the gas-to-power screens. */
import type { Quantity } from "@pdm/contracts";
import { formatNumber } from "../../shared/format";
import type { UnitSystem } from "../../shared/preferences";
import { toDisplay } from "../../shared/units";

/** kW → "308 MW" (power tags are kW; plants are talked about in MW). */
export function formatMw(kw: number): string {
  const mw = kw / 1000;
  return `${formatNumber(mw, Math.abs(mw) < 10 ? 1 : 0)} MW`;
}

type T = (key: string, options?: Record<string, unknown>) => string;

/** A value in the user's units with its symbol: "9,750 kJ/kWh", "9,241 Btu/kWh", "22 °C". */
export function formatIn(value: number, quantity: Quantity, units: UnitSystem, t: T, decimals: 0 | 1 = 0): string {
  const d = toDisplay(value, quantity, units);
  return `${formatNumber(d.value, decimals)} ${t(`unitSymbol.${d.unit}`)}`;
}

/** Heat rate → thermal efficiency, %: 3,600 kJ is one kWh, so 3,600 / heat rate is the share of fuel energy turned into power. */
export function efficiencyPct(kjPerKwh: number): number {
  return (3600 / kjPerKwh) * 100;
}

/** "+1.6 %" / "−0.4 %"; signed, with a real minus sign. */
export function signed(v: number, decimals = 1): string {
  const s = Math.abs(v).toFixed(decimals);
  return v > 0 ? `+${s}` : v < 0 ? `−${s}` : s;
}
