import {
  FloorCoverKey,
  GlazingType,
  InsulationPeriodKey,
  JoistSpacingOption,
  PeriodPreset,
} from "./projectTypes";

// Glazing window U-values (W/m²K)
export const GLAZING_WINDOW_U: Record<GlazingType, number> = {
  single: 5.0,
  double: 2.7,
  triple: 1.0,
};

// Floor covering resistance (m²K/W)
export const FLOOR_COVER_R: Record<FloorCoverKey, number> = {
  tile_stone: 0.01,
  vinyl_lvt: 0.02,
  laminate: 0.03,
  engineered_wood: 0.05,
  solid_wood: 0.07,
  carpet_low_pad: 0.1,
  carpet_high_pad: 0.15,
};

// Joist spacing options (mm)
export const JOIST_SPACING_MM: Record<JoistSpacingOption, number> = {
  "16in_400mm": 400,
  "19in_488mm": 488,
  "24in_600mm": 600,
};

export const GENERIC_PRESETS: Record<InsulationPeriodKey, PeriodPreset> = {
  pre1980: {
    U: { wall: 0.8, window: 3.0, door: 2.0, roof: 0.6, floor: 0.6 },
    ACH: 1.0,
  },
  y1980_2000: {
    U: { wall: 0.6, window: 2.5, door: 1.8, roof: 0.45, floor: 0.5 },
    ACH: 0.7,
  },
  y2001_2015: {
    U: { wall: 0.35, window: 2.0, door: 1.6, roof: 0.25, floor: 0.35 },
    ACH: 0.5,
  },
  y2016p: {
    U: { wall: 0.25, window: 1.6, door: 1.2, roof: 0.18, floor: 0.25 },
    ACH: 0.35,
  },
};

export const UK_PRESETS: Partial<Record<InsulationPeriodKey, PeriodPreset>> = {
  pre1980: {
    U: { wall: 0.8, window: 3.0, door: 2.0, roof: 0.6, floor: 0.6 },
    ACH: 1.0,
  },
  y1980_2000: {
    U: { wall: 0.6, window: 2.5, door: 1.8, roof: 0.45, floor: 0.5 },
    ACH: 0.7,
  },
  y2001_2015: {
    U: { wall: 0.35, window: 2.0, door: 1.6, roof: 0.25, floor: 0.35 },
    ACH: 0.5,
  },
  y2016p: {
    U: { wall: 0.25, window: 1.6, door: 1.2, roof: 0.18, floor: 0.25 },
    ACH: 0.35,
  },
};

export const MAX_LOOP_M = 90;

export const SPACING_TABLE: {
  maxLoad: number;
  spacing_in: number;
  tubeSize_in: 0.5 | 0.75;
}[] = [
  { maxLoad: 50, spacing_in: 16, tubeSize_in: 0.5 },
  { maxLoad: 145, spacing_in: 12, tubeSize_in: 0.5 },
  { maxLoad: Infinity, spacing_in: 12, tubeSize_in: 0.75 },
];
