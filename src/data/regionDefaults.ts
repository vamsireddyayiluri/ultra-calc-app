// data/regionDefaults.ts
import { RegionDefaults, Region } from "../models/projectTypes";

export const REGION_DEFAULTS: Record<Region, RegionDefaults> = {
  UK: {
    standardsMode: "BS_EN_12831",
    safetyFactorPct: 12.5,
    heatUpFactorPct: 27.5,
    psiAllowance_W_per_K: 0.04,
    mechVent_m3_per_h: 0.4,
    infiltrationACH: 0.25,
  },
  US: {
    standardsMode: "ASHRAE",
    safetyFactorPct: 10,
    heatUpFactorPct: 20,
    psiAllowance_W_per_K: 0.05,
    mechVent_m3_per_h: 0.5,
    infiltrationACH: 0.35,
  },
  EU: {
    standardsMode: "EN_ISO_13790",
    safetyFactorPct: 12,
    heatUpFactorPct: 25,
    psiAllowance_W_per_K: 0.035,
    mechVent_m3_per_h: 0.45,
    infiltrationACH: 0.3,
  },
  CA_METRIC: {
    standardsMode: "CSA_F280",
    safetyFactorPct: 15,
    heatUpFactorPct: 30,
    psiAllowance_W_per_K: 0.045,
    mechVent_m3_per_h: 0.4, 
    infiltrationACH: 0.3,
  },

  CA_IMPERIAL: {
    standardsMode: "CSA_F280",
    safetyFactorPct: 15,
    heatUpFactorPct: 30,
    psiAllowance_W_per_K: 0.045,
    mechVent_m3_per_h: 0.4, 
    infiltrationACH: 0.3,
  },
};
