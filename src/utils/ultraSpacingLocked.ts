// src/utils/ultraSpacingLocked.ts

import { JoistKey, LoadMode, InstallMethod } from "./ultraCalcLocked";

type FinSpacingTable = {
  [joist in JoistKey]: {
    LL: number; // mm
    HL: number; // mm
  };
};

export const ULTRA_FIN_SPACING_MM: FinSpacingTable = {
  12: { LL: 530, HL: 430 },
  16: { LL: 400, HL: 330 },
  19: { LL: 360, HL: 280 },
  24: { LL: 530, HL: 430 },
};

// same numbers, different meaning
export const TUBING_SPACING_MM = ULTRA_FIN_SPACING_MM;
