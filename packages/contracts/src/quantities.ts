import { z } from "zod";

/**
 * What kind of thing a sensor measures. Every value travels in the
 * canonical SI unit for its quantity; the UI converts for display (design system §6).
 */
export const Quantity = z.enum([
  "temperature",
  /**
   * A temperature DIFFERENCE (e.g. exhaust spread). Converts ×1.8 to °F with no +32 offset —
   * a 22 °C spread is a 39.6 °F spread, not 71.6 °F.
   */
  "temperature_difference",
  "pressure",
  "liquid_flow",
  "gas_flow",
  "length",
  "mass",
  "power",
  "energy",
  "vibration_velocity",
  "heat_rate",
  "current",
  "voltage",
  "frequency",
  "rotational_speed",
  "irradiance",
  "concentration",
  "percent",
  "count",
]);
export type Quantity = z.infer<typeof Quantity>;

/** The unit every value of a quantity is sent in. The frontend never receives anything else. */
export const CANONICAL_UNIT = {
  temperature: "degC",
  temperature_difference: "K", // a difference of 1 K equals a difference of 1 °C
  pressure: "bar",
  liquid_flow: "m3/h",
  gas_flow: "Sm3/d",
  length: "mm",
  mass: "kg",
  power: "kW",
  energy: "MWh",
  vibration_velocity: "mm/s",
  heat_rate: "kJ/kWh",
  current: "A",
  voltage: "V",
  frequency: "Hz",
  rotational_speed: "rpm",
  irradiance: "W/m2",
  concentration: "ppm",
  percent: "%",
  count: "count",
} as const satisfies Record<Quantity, string>;
