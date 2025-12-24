export type UnitMode = "metric" | "imperial";
export type Region = "UK" | "US" | "EU" | "CA";
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
  unitMode: UnitMode;
  region: Region;
  standardsMode: StandardsMode;
  insulationPeriod?: InsulationPeriodKey;
  indoorTempC: number;
  outdoorTempC: number;
  safetyFactorPct?: number;
  heatUpFactorPct?: number;

  // new psi name from new file (psiAllowance_W_per_K) but keep old
  psiThermalBridge_W_per_K?: number; // old
  psiAllowance_W_per_K?: number; // new

  floorOnGround?: boolean;
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
  floorOnGround: boolean;
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

export type InstallMethod = "top" | "hangers" | "drilled" | "inslab";

export type GlazingType = "single" | "double" | "triple";
export type JoistSpacingOption = "16in_400mm" | "19in_488mm" | "24in_600mm";

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
}

export interface RoomResults {
  name: string;
  qFabric_W: number;
  qVent_W: number;
  qPsi_W: number;
  qGround_W: number;
  qBeforeFactors_W: number;
  qAfterFactors_W: number;

  load_W_per_m2: number;
  spacing_in: number;
  tubeSize_in: 0.5 | 0.75;

  tubingLength_m: number;
  fins_qty: number;
  clips_qty: number;
  loops_qty: number;
  perLoopLength_m: number;

  waterTemp_C: number;
  warnings: string[];
  tubingLength_ft?: number;
  perLoop_ft?: number;
  Q_W?: number;
  q_Wm2?: number;

  joistSpacing?: JoistSpacingOption;
  floorCover?: FloorCoverKey;
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
}

export interface CalcOutput {
  rooms: RoomResults[];
  summary: ProjectSummary;
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
