import { PeriodKey, PeriodPreset } from "./projectTypes";

export const PRESETS_GLOBAL: Record<PeriodKey, PeriodPreset> = {
  pre1980: {
    U: { wall: 0.8, window: 3.0, door: 2.0, ceiling: 0.6, floor: 0.6 },
    ACH: 1.0,
  },
  y1980_2000: {
    U: { wall: 0.6, window: 2.5, door: 1.8, ceiling: 0.45, floor: 0.5 },
    ACH: 0.7,
  },
  y2001_2015: {
    U: { wall: 0.35, window: 2.0, door: 1.6, ceiling: 0.25, floor: 0.35 },
    ACH: 0.5,
  },
  y2016p: {
    U: { wall: 0.25, window: 1.6, door: 1.2, ceiling: 0.18, floor: 0.25 },
    ACH: 0.35,
  },
};
export const PRESETS_UK: Record<PeriodKey, PeriodPreset> = {
  pre1980: {
    U: { wall: 0.8, window: 3.0, door: 2.0, ceiling: 0.6, floor: 0.6 },
    ACH: 1.0,
  },
  y1980_2000: {
    U: { wall: 0.6, window: 2.5, door: 1.8, ceiling: 0.45, floor: 0.5 },
    ACH: 0.7,
  },
  y2001_2015: {
    U: { wall: 0.35, window: 2.0, door: 1.6, ceiling: 0.25, floor: 0.35 },
    ACH: 0.5,
  },
  y2016p: {
    U: { wall: 0.25, window: 1.6, door: 1.2, ceiling: 0.18, floor: 0.25 },
    ACH: 0.35,
  },
};
