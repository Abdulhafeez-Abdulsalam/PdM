/**
 * Unit conversion (design system §6). All data arrives in the canonical SI unit for its
 * quantity (CANONICAL_UNIT in @pdm/contracts); this is the ONLY place it's converted.
 *
 * Each rule: which display unit to use per system, and how to get there from SI.
 * Unit symbols are looked up in the text catalog under unitSymbol.<unit>.
 */
import type { Quantity } from "@pdm/contracts";
import type { UnitSystem } from "./preferences";

export type DisplayUnit =
  | "degC"
  | "degF"
  | "deltaC"
  | "deltaF"
  | "bar"
  | "psi"
  | "m3/h"
  | "gpm"
  | "bbl/d"
  | "Sm3/d"
  | "scf/d"
  | "MMscfd"
  | "mm"
  | "in"
  | "kg"
  | "lb"
  | "kW"
  | "MWh"
  | "mm/s"
  | "in/s"
  | "kJ/kWh"
  | "Btu/kWh"
  | "A"
  | "V"
  | "Hz"
  | "rpm"
  | "W/m2"
  | "ppm"
  | "%"
  | "count";

interface Conversion {
  unit: DisplayUnit;
  convert: (si: number) => number;
}

const same = (unit: DisplayUnit): Conversion => ({ unit, convert: (v) => v });
const linear = (unit: DisplayUnit, factor: number): Conversion => ({ unit, convert: (v) => v * factor });

/** Exact or standard factors. Gas volume uses 1 Sm³ = 35.3147 scf (same reference conditions assumed — see design system §6). */
const F = {
  barToPsi: 14.5038,
  m3hToGpm: 4.40287, // US gallons per minute
  m3hToBblPerDay: 150.955, // 6.28981 bbl per m³ × 24 h
  sm3ToScf: 35.3147,
  mmToIn: 1 / 25.4,
  kgToLb: 2.20462,
  kjToBtu: 0.947817,
};

const fahrenheit: Conversion = { unit: "degF", convert: (c) => (c * 9) / 5 + 32 };

const RULES: Record<Quantity, Record<UnitSystem, Conversion>> = {
  temperature: { si: same("degC"), imperial: fahrenheit, oilfield: fahrenheit },
  // Differences scale but never shift: ×1.8, no +32.
  temperature_difference: { si: same("deltaC"), imperial: linear("deltaF", 1.8), oilfield: linear("deltaF", 1.8) },
  pressure: { si: same("bar"), imperial: linear("psi", F.barToPsi), oilfield: linear("psi", F.barToPsi) },
  liquid_flow: { si: same("m3/h"), imperial: linear("gpm", F.m3hToGpm), oilfield: linear("bbl/d", F.m3hToBblPerDay) },
  gas_flow: { si: same("Sm3/d"), imperial: linear("scf/d", F.sm3ToScf), oilfield: linear("MMscfd", F.sm3ToScf / 1e6) },
  length: { si: same("mm"), imperial: linear("in", F.mmToIn), oilfield: linear("in", F.mmToIn) },
  mass: { si: same("kg"), imperial: linear("lb", F.kgToLb), oilfield: linear("lb", F.kgToLb) },
  // Electrical power stays in kW in every system (hp would be odd for a 165 MW generator).
  power: { si: same("kW"), imperial: same("kW"), oilfield: same("kW") },
  energy: { si: same("MWh"), imperial: same("MWh"), oilfield: same("MWh") },
  vibration_velocity: { si: same("mm/s"), imperial: linear("in/s", F.mmToIn), oilfield: linear("in/s", F.mmToIn) },
  heat_rate: { si: same("kJ/kWh"), imperial: linear("Btu/kWh", F.kjToBtu), oilfield: linear("Btu/kWh", F.kjToBtu) },
  current: { si: same("A"), imperial: same("A"), oilfield: same("A") },
  voltage: { si: same("V"), imperial: same("V"), oilfield: same("V") },
  frequency: { si: same("Hz"), imperial: same("Hz"), oilfield: same("Hz") },
  rotational_speed: { si: same("rpm"), imperial: same("rpm"), oilfield: same("rpm") },
  irradiance: { si: same("W/m2"), imperial: same("W/m2"), oilfield: same("W/m2") },
  concentration: { si: same("ppm"), imperial: same("ppm"), oilfield: same("ppm") },
  percent: { si: same("%"), imperial: same("%"), oilfield: same("%") },
  count: { si: same("count"), imperial: same("count"), oilfield: same("count") },
};

export function conversionFor(quantity: Quantity, system: UnitSystem): Conversion {
  return RULES[quantity][system];
}

/** Convert one SI value. */
export function toDisplay(value: number, quantity: Quantity, system: UnitSystem): { value: number; unit: DisplayUnit } {
  const c = conversionFor(quantity, system);
  return { value: c.convert(value), unit: c.unit };
}

/** Sensible number of decimals for a value's size, e.g. 0.0123 → 4, 587.3 → 1, 165000 → 0. */
export function decimalsFor(value: number): number {
  const abs = Math.abs(value);
  if (abs === 0) return 0;
  if (abs >= 1000) return 0;
  if (abs >= 100) return 1;
  if (abs >= 1) return 2;
  return Math.min(4, Math.ceil(-Math.log10(abs)) + 2);
}

const formatters = new Map<number, Intl.NumberFormat>();

/** Format a display value with sensible precision. */
export function formatMeasurement(value: number): string {
  const d = decimalsFor(value);
  let f = formatters.get(d);
  if (!f) formatters.set(d, (f = new Intl.NumberFormat("en-US", { maximumFractionDigits: d, minimumFractionDigits: d >= 2 ? 0 : d })));
  return f.format(value);
}
