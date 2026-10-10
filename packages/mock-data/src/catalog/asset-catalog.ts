/**
 * Per asset class: short code for IDs, display label, (fictional) manufacturers,
 * how critical it usually is, and typical costs. Manufacturer names are invented
 * so the demo never implies anything about real companies' equipment.
 */
import type { AssetClass } from "@pdm/contracts";

export interface AssetClassInfo {
  code: string;
  label: string;
  makers: readonly (readonly [maker: string, models: readonly string[]])[];
  /** Typical criticality range, 1 (low consequence) – 5 (severe). */
  criticality: readonly [min: number, max: number];
  /** Rough cost of an unplanned failure (repair + lost production), USD. */
  failureCost: number;
  /** Is a predictive model deployed for this class? (Gives it an RUL estimate.) */
  modelled: boolean;
}

export const ASSET_CLASSES: Record<AssetClass, AssetClassInfo> = {
  gas_turbine: { code: "GT", label: "Gas Turbine", makers: [["Meridian Turbines", ["MT-9F", "MT-7HA"]], ["Northwind Power Systems", ["NW-SGT5"]]], criticality: [5, 5], failureCost: 2_400_000, modelled: true },
  steam_turbine: { code: "ST", label: "Steam Turbine", makers: [["Meridian Turbines", ["MT-D11"]], ["Northwind Power Systems", ["NW-SST600"]]], criticality: [4, 5], failureCost: 1_600_000, modelled: true },
  hrsg: { code: "HRSG", label: "Heat Recovery Steam Generator", makers: [["Calder Boiler Works", ["CB-3P-RH"]]], criticality: [4, 5], failureCost: 900_000, modelled: false },
  generator: { code: "GEN", label: "Generator", makers: [["Volta Electric", ["VE-H2-200", "VE-AIR-25"]]], criticality: [4, 5], failureCost: 1_800_000, modelled: true },
  transformer: { code: "TX", label: "Transformer", makers: [["Fenwick Transformers", ["FT-230/33", "FT-33/0.69"]], ["Volta Electric", ["VE-GSU-250"]]], criticality: [3, 5], failureCost: 1_200_000, modelled: true },
  switchgear: { code: "SWG", label: "Switchgear", makers: [["Fenwick Transformers", ["FS-33-GIS"]]], criticality: [2, 4], failureCost: 250_000, modelled: false },
  recip_engine: { code: "ENG", label: "Gas Engine", makers: [["Hartland Engines", ["HE-20V34", "HE-18V50"]]], criticality: [3, 4], failureCost: 400_000, modelled: true },
  compressor: { code: "CMP", label: "Centrifugal Compressor", makers: [["Oakridge Compression", ["OC-BCL-405", "OC-RB-60"]]], criticality: [4, 5], failureCost: 1_100_000, modelled: true },
  pump: { code: "PMP", label: "Centrifugal Pump", makers: [["Tidewater Pumps", ["TP-OH2", "TP-BB3"]], ["Kestrel Fluid", ["KF-VS6"]]], criticality: [2, 4], failureCost: 120_000, modelled: true },
  esp: { code: "ESP", label: "Electric Submersible Pump", makers: [["Deepline Lift", ["DL-538", "DL-400"]]], criticality: [3, 4], failureCost: 350_000, modelled: true },
  rod_pump: { code: "RDP", label: "Rod Pump", makers: [["Prairie Lift", ["PL-640", "PL-456"]]], criticality: [2, 3], failureCost: 60_000, modelled: false },
  wellhead: { code: "WH", label: "Wellhead", makers: [["Saltmarsh Wellhead", ["SW-5K", "SW-10K"]]], criticality: [3, 4], failureCost: 300_000, modelled: false },
  separator: { code: "SEP", label: "Separator", makers: [["Calder Boiler Works", ["CB-3PH-H"]]], criticality: [3, 4], failureCost: 400_000, modelled: false },
  pipeline_segment: { code: "PL", label: "Pipeline Segment", makers: [["Gulfline Steel", ["API 5L X65 24in", "API 5L X70 30in"]]], criticality: [4, 5], failureCost: 3_000_000, modelled: true },
  heat_exchanger: { code: "HX", label: "Heat Exchanger", makers: [["Thermex", ["TEMA AES", "TEMA BEM"]]], criticality: [2, 4], failureCost: 180_000, modelled: true },
  fired_heater: { code: "FH", label: "Fired Heater", makers: [["Thermex", ["TX-CAB-40"]]], criticality: [4, 5], failureCost: 1_500_000, modelled: true },
  pressure_vessel: { code: "PV", label: "Pressure Vessel", makers: [["Calder Boiler Works", ["CB-V-ASME8"]]], criticality: [3, 4], failureCost: 500_000, modelled: false },
  storage_tank: { code: "TK", label: "Storage Tank", makers: [["Gulfline Steel", ["API 650 FR", "API 650 CR"]]], criticality: [2, 4], failureCost: 700_000, modelled: false },
  control_valve: { code: "CV", label: "Control Valve", makers: [["Kestrel Fluid", ["KF-GX", "KF-ED"]]], criticality: [2, 3], failureCost: 40_000, modelled: true },
  psv: { code: "PSV", label: "Pressure Safety Valve", makers: [["Kestrel Fluid", ["KF-2600"]]], criticality: [4, 5], failureCost: 900_000, modelled: false },
  inverter: { code: "INV", label: "Inverter", makers: [["Helion Power", ["HP-3600CS", "HP-4400UD"]], ["Sunmark", ["SM-CI3.5"]]], criticality: [3, 3], failureCost: 90_000, modelled: true },
  pv_string: { code: "STR", label: "PV String", makers: [["Lumina Modules", ["LM-550-BF"]]], criticality: [1, 1], failureCost: 1_500, modelled: true },
  combiner_box: { code: "CB", label: "Combiner Box", makers: [["Helion Power", ["HP-CB24"]]], criticality: [2, 2], failureCost: 8_000, modelled: false },
  tracker: { code: "TRK", label: "Tracker Row Group", makers: [["Arcadia Trackers", ["AT-1P"]]], criticality: [1, 2], failureCost: 12_000, modelled: false },
  bess: { code: "BESS", label: "Battery Energy Storage", makers: [["Corestack Energy", ["CS-LFP-20"]]], criticality: [3, 4], failureCost: 1_500_000, modelled: true },
  weather_station: { code: "MET", label: "Weather Station", makers: [["Skyward Instruments", ["SI-MET3"]]], criticality: [1, 2], failureCost: 5_000, modelled: false },
};
