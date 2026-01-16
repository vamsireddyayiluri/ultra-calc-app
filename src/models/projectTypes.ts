import { INSTALL_METHOD_OPTIONS } from "./presets";

export type Region = "UK" | "EU" | "US" | "CA_METRIC" | "CA_IMPERIAL";
export type StandardsMode =
  | "generic"
  | "BS_EN_12831"
  | "ASHRAE"
  | "EN_ISO_13790"
  | "CSA_F280";

export type InsulationPeriodKey =
  | "pre1980"
  | "y1980_2000"
  | "y2001_2015"
  | "y2016p";

export type UIUnits = {
  length: "m" | "ft";
  area: "m²" | "ft²";
  temperature: "°C" | "°F";
  uValue: "W/m²·K" | "BTU/hr·ft²·°F";
  power: "W" | "BTU/hr";
  powerDensity: "W/m²" | "BTU/hr·ft²";
  ventilation: "m³/h" | "cfm";
  psi: "W/K" | "Btu/hr·°F";
};

// === U-Values ===
export interface MaterialUValues {
  wall: number;
  window: number;
  door: number;
  roof: number; // same as ceiling
  floor: number;
}

export interface ProjectSettings {
  id?: string;
  name: string;
  contractor: string;
  address: string;
  region: Region;
  standardsMode: StandardsMode;
  insulationPeriod?: InsulationPeriodKey;
  indoorTempC: number;
  outdoorTempC: number | null;
  safetyFactorPct?: number;
  heatUpFactorPct?: number;

  // new psi name from new file (psiAllowance_W_per_K) but keep old
  psiAllowance_W_per_K?: number; // new

  customUOverrides?: Partial<MaterialUValues>;

  // ventilation (merged)
  airChangeRate_per_h?: number; // old generic
  infiltrationACH?: number; // new
  mechVent_m3_per_h?: number; // new

  // NEW additions
  glazing?: GlazingType;
  customU?: Partial<MaterialUValues>; // for new “customU” usage
}

// === Region Defaults (from new) ===
export interface RegionDefaults {
  standardsMode: StandardsMode;
  safetyFactorPct: number;
  heatUpFactorPct: number;
  psiAllowance_W_per_K: number;
  mechVent_m3_per_h: number;
  infiltrationACH: number;
}

export interface PeriodPreset {
  U: {
    wall: number;
    window: number;
    door: number;
    roof: number;
    floor: number;
  };
  ACH: number;
}

export type InstallMethod = (typeof INSTALL_METHOD_OPTIONS)[number]["value"];

// Joist spacing in inches (authoritative)
export type JoistSpacingOption = 12 | 16 | 19 | 24;

export type GlazingType = "single" | "double" | "triple";

export type FloorCoverKey =
  | "tile_stone"
  | "vinyl_lvt"
  | "laminate"
  | "engineered_wood"
  | "solid_wood"
  | "carpet_low_pad"
  | "carpet_high_pad";

// === Room Inputs ===
export interface RoomInput {
  id: string;
  name: string;
  length_m: number;
  width_m: number;
  height_m: number;
  exteriorLen_m: number;
  windowArea_m2: number;
  doorArea_m2: number;
  setpointC?: number;
  ceilingExposed?: boolean;
  floorExposed?: boolean;
  installMethod: InstallMethod;
  joistSpacing?: JoistSpacingOption;
  floorCover?: FloorCoverKey;
  floorOnGround?: boolean;
}

// models/projectTypes.ts

export interface RoomResults {
  name: string;

  qFabric_W: number;
  qVent_W: number;
  qPsi_W: number;
  qGround_W: number;

  qBeforeFactors_W: number;
  qAfterFactors_W: number;

  load_W_per_m2: number;
  waterTemp_C: number;

  warnings: string[];

  floorCover_R_m2K_per_W?: number;
  floorCover_U_W_per_m2K?: number;
}

export interface ProjectSummary {
  totalW: number;
  totalTubing_m: number;

  /** Total number of fins */
  totalFins: number;

  /** Total number of clips/hangers */
  totalClips: number;

  /** Average water temperature (°C) */
  avgWaterTemp_C: number;

  /** Computed average per-area heat load (W/m²) */
  avg_Wm2?: number;

  /** Total number of loops */
  totalLoops?: number;

  /** Notes or warnings */
  notes?: string[];
  ultraFinSpacing_mm?: number | "VARIES";
  tubingSpacing_mm?: number | "VARIES";
}

export interface CalcOutput {
  rooms: RoomResults[];
  summary: ProjectSummary;
}
// models/materialTypes.ts (new file)

export interface MaterialResults {
  tubing_m: number;
  tubing_ft: number;

  loops: number;
  m_per_loop: number;
  ft_per_loop: number;

  fins_pairs: number;
  fin_halves: number;

  drilling_supports: number;
  hanging_supports?: number;
  open_web_ultra_clips?: number;
  topdown_ultra_clips?: number;
  topdown_uc1212?: number;

  supplementalWarning: boolean;
}

export interface Side {
  isExterior: boolean;
  length: number;
  openingArea: number;
  openingUOverride: number | null;
}

export interface RichRoom {
  name: string;
  length: number;
  width: number;
  height: number;
  setpoint: number;
  ceilingExposed: boolean;
  floorExposed: boolean;
  installMethod: InstallMethod;
  spacingOverrideIn: number | null;
  sides: Side[];
}
export type UserType = {
  userId: string;
  name: string;
  email: string;
  cell: string;
  password: string;
};
