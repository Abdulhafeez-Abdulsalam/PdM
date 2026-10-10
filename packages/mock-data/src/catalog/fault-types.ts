/**
 * Degradation patterns we can inject into equipment. Each changes specific sensors
 * gradually until failure, so charts, health scores, alarms and predictions all tell
 * the same story.
 *
 * `atFailure` = how far the tag has moved from its base at the moment of failure, as a
 * fraction of base. If omitted, the tag goes 5% past its trip limit.
 */
import type { AssetClass, FailureMode } from "@pdm/contracts";

export interface FaultEffect {
  tag: string;
  /** +1 pushes the value up, −1 down. */
  direction: 1 | -1;
  atFailure?: number;
}

export interface FaultType {
  id: string;
  failureMode: FailureMode;
  appliesTo: readonly AssetClass[];
  effects: readonly FaultEffect[];
  action: string;
  /** Planned intervention cost as a fraction of the class failure cost. */
  interventionFraction: number;
}

const rotating: AssetClass[] = ["gas_turbine", "steam_turbine", "generator", "compressor", "pump", "esp", "recip_engine"];

export const FAULT_TYPES: readonly FaultType[] = [
  {
    id: "compressor_fouling",
    failureMode: { code: "LOO", label: "Compressor fouling" },
    appliesTo: ["gas_turbine"],
    effects: [
      { tag: "COMP_EFF", direction: -1 },
      { tag: "CDP", direction: -1 },
      { tag: "EXH_TEMP", direction: 1 },
      { tag: "HEAT_RATE", direction: 1 },
      { tag: "POWER", direction: -1, atFailure: 0.08 },
    ],
    action: "Schedule an offline compressor water wash",
    interventionFraction: 0.01,
  },
  {
    id: "bearing_wear",
    failureMode: { code: "VIB", label: "Bearing wear" },
    appliesTo: rotating,
    effects: [
      { tag: "BRG1_VIB", direction: 1 },
      { tag: "BRG1_TEMP", direction: 1 },
    ],
    action: "Inspect bearing and plan replacement at next opportunity",
    interventionFraction: 0.08,
  },
  {
    id: "surge_approach",
    failureMode: { code: "PDE", label: "Surge margin erosion" },
    appliesTo: ["compressor"],
    effects: [
      { tag: "SURGE_MARGIN", direction: -1 },
      { tag: "POLY_EFF", direction: -1 },
      { tag: "BRG2_VIB", direction: 1, atFailure: 0.9 },
    ],
    action: "Review anti-surge controller tuning and inspect recycle valve",
    interventionFraction: 0.02,
  },
  {
    id: "hx_fouling",
    failureMode: { code: "PLU", label: "Tube-side fouling" },
    appliesTo: ["heat_exchanger"],
    effects: [
      { tag: "THERMAL_EFF", direction: -1 },
      { tag: "TS_DP", direction: 1 },
    ],
    action: "Plan chemical clean or hydro-jet of tube bundle",
    interventionFraction: 0.15,
  },
  {
    id: "inverter_cooling",
    failureMode: { code: "OHE", label: "Cooling degradation / thermal derating" },
    appliesTo: ["inverter"],
    effects: [
      { tag: "IGBT_T", direction: 1 },
      { tag: "CAB_T", direction: 1 },
      { tag: "POWER_LIMIT", direction: -1 },
      { tag: "EFFICIENCY", direction: -1 },
      { tag: "AC_POWER", direction: -1, atFailure: 0.25 },
    ],
    action: "Replace cooling fans and clean air filters",
    interventionFraction: 0.05,
  },
  {
    id: "string_underperformance",
    failureMode: { code: "LOO", label: "String underperformance (bypass diode / hot spot)" },
    appliesTo: ["pv_string"],
    effects: [
      { tag: "PERF_INDEX", direction: -1 },
      { tag: "CURRENT", direction: -1, atFailure: 0.2 },
      { tag: "POWER", direction: -1, atFailure: 0.2 },
    ],
    action: "IV-curve test the string and thermographic scan of modules",
    interventionFraction: 0.3,
  },
  {
    id: "transformer_gassing",
    failureMode: { code: "OHE", label: "Internal overheating / arcing (DGA)" },
    appliesTo: ["transformer"],
    effects: [
      { tag: "H2", direction: 1 },
      { tag: "C2H2", direction: 1 },
      { tag: "OIL_TEMP", direction: 1, atFailure: 0.2 },
    ],
    action: "Take confirmatory oil sample and plan internal inspection",
    interventionFraction: 0.04,
  },
  {
    id: "wall_loss",
    failureMode: { code: "ELP", label: "Internal corrosion / wall loss" },
    appliesTo: ["pipeline_segment", "pressure_vessel", "storage_tank"],
    effects: [
      { tag: "WALL_THK", direction: -1 },
      { tag: "CORR_RATE", direction: 1 },
    ],
    action: "Targeted UT inspection and fitness-for-service assessment",
    interventionFraction: 0.05,
  },
  {
    id: "esp_motor_overheating",
    failureMode: { code: "OHE", label: "Motor overheating / insulation breakdown" },
    appliesTo: ["esp"],
    effects: [
      { tag: "MOTOR_TEMP", direction: 1 },
      { tag: "MOTOR_AMPS", direction: 1 },
      { tag: "INTAKE_P", direction: -1, atFailure: 0.12 },
    ],
    action: "Reduce drive frequency and plan workover to pull ESP",
    interventionFraction: 0.4,
  },
  {
    id: "valve_stiction",
    failureMode: { code: "ERO", label: "Valve stiction" },
    appliesTo: ["control_valve"],
    effects: [{ tag: "POS_DEV", direction: 1 }],
    action: "Stroke-test valve and repack / service positioner",
    interventionFraction: 0.2,
  },
  {
    id: "tube_overheat",
    failureMode: { code: "OHE", label: "Tube metal overtemperature (coking)" },
    appliesTo: ["fired_heater"],
    effects: [
      { tag: "TMT_MAX", direction: 1 },
      { tag: "FLUE_T", direction: 1, atFailure: 0.1 },
    ],
    action: "Reduce firing, plan steam-air decoke",
    interventionFraction: 0.05,
  },
  {
    id: "cell_imbalance",
    failureMode: { code: "PDE", label: "Cell imbalance / accelerated degradation" },
    appliesTo: ["bess"],
    effects: [
      { tag: "CELL_DV", direction: 1 },
      { tag: "CELL_T_MAX", direction: 1 },
      { tag: "SOH", direction: -1 },
    ],
    action: "Run balancing cycle and inspect affected rack",
    interventionFraction: 0.03,
  },
  {
    id: "stator_insulation",
    failureMode: { code: "BRD", label: "Stator insulation degradation" },
    appliesTo: ["generator"],
    effects: [
      { tag: "PD_ACTIVITY", direction: 1 },
      { tag: "STATOR_T", direction: 1 },
    ],
    action: "Offline insulation tests (PI, tan δ) at next outage",
    interventionFraction: 0.1,
  },
];

export function faultTypeById(id: string): FaultType {
  const type = FAULT_TYPES.find((f) => f.id === id);
  if (!type) throw new Error(`Unknown fault type ${id}`);
  return type;
}
