export type UnitSystem = "metric" | "imperial";
export type PeriodKey = "pre1980" | "y1980_2000" | "y2001_2015" | "y2016p";
export type Method = "top" | "hangers" | "drilled" | "inslab";
// models/region.ts (or append to projectTypes.ts)

export type RegionKey = "UK" | "US" | "EU" | "CA";
export type StandardsMode =
  | "generic"
  | "BS_EN_12831"
  | "ASHRAE"
  | "EN_ISO_13790"
  | "CSA_F280";

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
    ceiling: number;
    floor: number;
  };
  ACH: number;
}

export interface ProjectHeader {
  id?: string;
  name: string;
  contractor: string;
  address: string;
  designIndoorC: number;
  designOutdoorC: number;
  period: PeriodKey;
  units: UnitSystem;

  // Region/Standards
  region?: RegionKey;
  standardsMode?: StandardsMode;
  safetyFactorPct?: number;
  heatUpFactorPct?: number;
  psiAllowance_W_per_K?: number;
  mechVent_m3_per_h?: number;
  infiltrationACH?: number;
  floorOnGround?: boolean;
  customU?: Partial<PeriodPreset["U"]>;
}

export interface Room {
  id: string;
  name: string;
  // stored in SI (meters, m²)
  length_m: number;
  width_m: number;
  height_m: number;
  exteriorLen_m: number;
  windowArea_m2: number;
  doorArea_m2: number;
  ceilingExposed: boolean;
  floorExposed: boolean;
  method: Method;
}

export interface RoomResults {
  Q_W: number; // total heat loss W
  q_Wm2: number; // per-area W/m²
  spacing_in: number; // recommended spacing (inches)
  tubingSize: '1/2"' | '3/4"';
  tubingLength_ft: number;
  loops: number;
  perLoop_ft: number;
  fins_count: number;
  clips_count: number;
  waterC: number;
  warnings: string[];
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
  method: Method;
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
