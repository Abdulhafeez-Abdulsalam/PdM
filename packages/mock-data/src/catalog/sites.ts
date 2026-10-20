/**
 * The fictional company: 3 regions, 12 sites, and what equipment sits in each area.
 * Names and locations are invented (coordinates are plausible for each region).
 */
import type { AssetClass, BusinessLine } from "@pdm/contracts";

/** How a site's equipment is loaded over the day. */
export type SiteProfile =
  | "baseload" // runs flat out around the clock (oil & gas)
  | "dispatch" // follows grid demand: higher by day (combined-cycle plants)
  | "peaker" // only runs at peak hours, starts and stops daily
  | "solar"; // follows the sun

/** [asset class, how many, optional size factor for power/flow tags] */
export type AreaAssets = readonly (readonly [AssetClass, number, number?])[];

export interface AreaDef {
  code: string;
  name: string;
  assets: AreaAssets;
}

export interface SiteDef {
  code: string;
  name: string;
  regionId: string;
  businessUnit: string;
  businessLine: BusinessLine;
  timezone: string;
  /** Fixed offset used by the simulation (daylight saving ignored). */
  utcOffsetHours: number;
  lat: number;
  lon: number;
  meanTempC: number;
  /** 0 = always clear skies, 1 = very cloudy. */
  cloudiness: number;
  profile: SiteProfile;
  areas: readonly AreaDef[];
}

export const REGIONS = [
  { id: "R-NA", name: "North America" },
  { id: "R-ME", name: "Middle East" },
  { id: "R-WA", name: "West Africa" },
] as const;

// ─── Reusable area layouts ────────────────────────────────────────────────────

const gtTrain = (n: number): AreaDef => ({
  code: `GT${n}`,
  name: `GT Train ${n}`,
  assets: [
    ["gas_turbine", 1],
    ["generator", 1],
    ["hrsg", 1],
    ["transformer", 1],
    ["pump", 3],
    ["control_valve", 4],
  ],
});

const ccgtCommon: AreaDef[] = [
  {
    code: "STC",
    name: "Steam Cycle",
    assets: [
      ["steam_turbine", 1],
      ["generator", 1, 0.58],
      ["pump", 6],
      ["heat_exchanger", 4],
      ["control_valve", 6],
    ],
  },
  {
    code: "ELE",
    name: "Electrical",
    assets: [
      ["transformer", 4],
      ["switchgear", 6],
    ],
  },
  {
    code: "BOP",
    name: "Balance of Plant",
    assets: [
      ["compressor", 2, 0.2],
      ["pump", 6],
      ["heat_exchanger", 2],
      ["storage_tank", 2],
      ["psv", 8],
    ],
  },
];

const solarBlock = (letter: string): AreaDef => ({
  code: `BL${letter}`,
  name: `Block ${letter}`,
  assets: [
    ["inverter", 8],
    ["pv_string", 48],
    ["combiner_box", 8],
    ["tracker", 8],
  ],
});

const solarCommon: AreaDef[] = [
  {
    code: "SUB",
    name: "Substation",
    assets: [
      ["transformer", 2],
      ["switchgear", 4],
    ],
  },
  {
    code: "BES",
    name: "BESS Yard",
    assets: [
      ["bess", 2],
      ["transformer", 1],
    ],
  },
  { code: "MET", name: "Met Station", assets: [["weather_station", 2]] },
];

const wellPad = (n: number): AreaDef => ({
  code: `WP${n}`,
  name: `Well Pad ${n}`,
  assets: [
    ["wellhead", 8],
    ["esp", 5],
    ["rod_pump", 2],
    ["pump", 1],
  ],
});

const compressorStation = (n: number): AreaDef => ({
  code: `CS${n}`,
  name: `Compressor Station ${n}`,
  assets: [
    ["compressor", 4],
    ["pump", 2],
    ["heat_exchanger", 2],
    ["control_valve", 6],
    ["psv", 6],
    ["pressure_vessel", 2],
  ],
});

const pipelineSection = (letter: string): AreaDef => ({
  code: `PL${letter}`,
  name: `Pipeline Section ${letter}`,
  assets: [
    ["pipeline_segment", 14],
    ["control_valve", 3],
  ],
});

// ─── Sites ────────────────────────────────────────────────────────────────────

export const SITES: readonly SiteDef[] = [
  // North America
  {
    code: "PBU",
    name: "Permian Basin Upstream",
    regionId: "R-NA",
    businessUnit: "Upstream",
    businessLine: "oil_gas",
    timezone: "America/Chicago",
    utcOffsetHours: -6,
    lat: 31.85,
    lon: -102.37,
    meanTempC: 18,
    cloudiness: 0.2,
    profile: "baseload",
    areas: [
      wellPad(1),
      wellPad(2),
      wellPad(3),
      wellPad(4),
      {
        code: "PF",
        name: "Production Facility",
        assets: [
          ["separator", 4],
          ["compressor", 3, 0.3],
          ["pump", 4],
          ["heat_exchanger", 3],
          ["storage_tank", 4],
          ["pressure_vessel", 3],
          ["control_valve", 8],
          ["psv", 8],
        ],
      },
    ],
  },
  {
    code: "GCM",
    name: "Gulf Coast Midstream",
    regionId: "R-NA",
    businessUnit: "Midstream",
    businessLine: "oil_gas",
    timezone: "America/Chicago",
    utcOffsetHours: -6,
    lat: 29.3,
    lon: -94.8,
    meanTempC: 21,
    cloudiness: 0.4,
    profile: "baseload",
    areas: [
      compressorStation(1),
      compressorStation(2),
      compressorStation(3),
      pipelineSection("A"),
      pipelineSection("B"),
      pipelineSection("C"),
    ],
  },
  {
    code: "CBC",
    name: "Coastal Bend CCGT",
    regionId: "R-NA",
    businessUnit: "Power Generation",
    businessLine: "gas_to_power",
    timezone: "America/Chicago",
    utcOffsetHours: -6,
    lat: 27.8,
    lon: -97.4,
    meanTempC: 22,
    cloudiness: 0.35,
    profile: "dispatch",
    areas: [gtTrain(1), gtTrain(2), ...ccgtCommon],
  },
  {
    code: "PCS",
    name: "Pecos Solar Farm",
    regionId: "R-NA",
    businessUnit: "Renewables",
    businessLine: "solar",
    timezone: "America/Chicago",
    utcOffsetHours: -6,
    lat: 31.4,
    lon: -103.5,
    meanTempC: 18,
    cloudiness: 0.15,
    profile: "solar",
    areas: [solarBlock("A"), solarBlock("B"), solarBlock("C"), solarBlock("D"), ...solarCommon],
  },

  // Middle East
  {
    code: "RKR",
    name: "Ras Kharma Refinery",
    regionId: "R-ME",
    businessUnit: "Downstream",
    businessLine: "oil_gas",
    timezone: "Asia/Dubai",
    utcOffsetHours: 4,
    lat: 25.9,
    lon: 55.95,
    meanTempC: 29,
    cloudiness: 0.05,
    profile: "baseload",
    areas: [
      {
        code: "CDU",
        name: "Crude Distillation Unit",
        assets: [
          ["fired_heater", 2],
          ["heat_exchanger", 10],
          ["pump", 10],
          ["pressure_vessel", 4],
          ["control_valve", 12],
          ["psv", 10],
          ["compressor", 1, 0.15],
        ],
      },
      {
        code: "HTU",
        name: "Hydrotreater",
        assets: [
          ["fired_heater", 1],
          ["compressor", 2, 0.15],
          ["heat_exchanger", 6],
          ["pump", 6],
          ["pressure_vessel", 3],
          ["control_valve", 8],
          ["psv", 6],
        ],
      },
      {
        code: "UTL",
        name: "Utilities",
        assets: [
          ["steam_turbine", 1, 0.3],
          ["generator", 1, 0.18],
          ["pump", 6],
          ["compressor", 2, 0.1],
          ["heat_exchanger", 2],
          ["transformer", 3],
        ],
      },
      {
        code: "TKF",
        name: "Tank Farm",
        assets: [
          ["storage_tank", 12],
          ["pump", 6],
          ["control_valve", 4],
        ],
      },
    ],
  },
  {
    code: "ANP",
    name: "Al Noor CCGT",
    regionId: "R-ME",
    businessUnit: "Power Generation",
    businessLine: "gas_to_power",
    timezone: "Asia/Dubai",
    utcOffsetHours: 4,
    lat: 24.4,
    lon: 54.6,
    meanTempC: 30,
    cloudiness: 0.05,
    profile: "dispatch",
    areas: [gtTrain(1), gtTrain(2), gtTrain(3), ...ccgtCommon],
  },
  {
    code: "SPV",
    name: "Sahra PV Park",
    regionId: "R-ME",
    businessUnit: "Renewables",
    businessLine: "solar",
    timezone: "Asia/Dubai",
    utcOffsetHours: 4,
    lat: 23.6,
    lon: 53.7,
    meanTempC: 30,
    cloudiness: 0.05,
    profile: "solar",
    areas: [solarBlock("A"), solarBlock("B"), solarBlock("C"), solarBlock("D"), solarBlock("E"), solarBlock("F"), ...solarCommon],
  },
  {
    code: "WSS",
    name: "Wadi Shams Solar",
    regionId: "R-ME",
    businessUnit: "Renewables",
    businessLine: "solar",
    timezone: "Asia/Riyadh",
    utcOffsetHours: 3,
    lat: 24.1,
    lon: 46.2,
    meanTempC: 28,
    cloudiness: 0.05,
    profile: "solar",
    areas: [solarBlock("A"), solarBlock("B"), solarBlock("C"), ...solarCommon],
  },

  // West Africa
  {
    code: "DOP",
    name: "Delta Offshore Platform",
    regionId: "R-WA",
    businessUnit: "Upstream",
    businessLine: "oil_gas",
    timezone: "Africa/Lagos",
    utcOffsetHours: 1,
    lat: 4.3,
    lon: 5.6,
    meanTempC: 27,
    cloudiness: 0.6,
    profile: "baseload",
    areas: [
      {
        code: "WEL",
        name: "Wellbay",
        assets: [
          ["wellhead", 12],
          ["esp", 6],
        ],
      },
      {
        code: "PRO",
        name: "Process Deck",
        assets: [
          ["separator", 4],
          ["compressor", 3, 0.4],
          ["pump", 6],
          ["heat_exchanger", 4],
          ["pressure_vessel", 4],
          ["control_valve", 10],
          ["psv", 10],
        ],
      },
      {
        code: "UTL",
        name: "Power & Utilities",
        assets: [
          ["gas_turbine", 2, 0.15],
          ["generator", 2, 0.15],
          ["recip_engine", 2, 0.4],
          ["transformer", 2],
          ["switchgear", 2],
        ],
      },
    ],
  },
  {
    code: "EBC",
    name: "Ebute Combined Cycle",
    regionId: "R-WA",
    businessUnit: "Power Generation",
    businessLine: "gas_to_power",
    timezone: "Africa/Lagos",
    utcOffsetHours: 1,
    lat: 6.6,
    lon: 3.45,
    meanTempC: 27,
    cloudiness: 0.55,
    profile: "dispatch",
    areas: [gtTrain(1), gtTrain(2), ...ccgtCommon],
  },
  {
    code: "SHP",
    name: "Sahel Peaker Plant",
    regionId: "R-WA",
    businessUnit: "Power Generation",
    businessLine: "gas_to_power",
    timezone: "Africa/Lagos",
    utcOffsetHours: 1,
    lat: 12.05,
    lon: 8.45,
    meanTempC: 28,
    cloudiness: 0.25,
    profile: "peaker",
    areas: [
      {
        code: "ENG",
        name: "Engine Hall",
        assets: [
          ["recip_engine", 10],
          ["generator", 10, 0.11],
        ],
      },
      {
        code: "GTA",
        name: "GT Area",
        assets: [
          ["gas_turbine", 2, 0.3],
          ["generator", 2, 0.3],
        ],
      },
      {
        code: "ELE",
        name: "Electrical",
        assets: [
          ["transformer", 4],
          ["switchgear", 6],
        ],
      },
      {
        code: "BOP",
        name: "Balance of Plant",
        assets: [
          ["pump", 6],
          ["storage_tank", 3],
          ["compressor", 1, 0.1],
          ["psv", 4],
        ],
      },
    ],
  },
  {
    code: "KSF",
    name: "Kano Sun Farm",
    regionId: "R-WA",
    businessUnit: "Renewables",
    businessLine: "solar",
    timezone: "Africa/Lagos",
    utcOffsetHours: 1,
    lat: 12.2,
    lon: 8.7,
    meanTempC: 27,
    cloudiness: 0.3,
    profile: "solar",
    areas: [solarBlock("A"), solarBlock("B"), solarBlock("C"), ...solarCommon],
  },
];

/** The gas turbine the demo storyline happens to. Always the first GT at Coastal Bend. */
export const STORYLINE_ASSET_ID = "CBC-GT-101";
