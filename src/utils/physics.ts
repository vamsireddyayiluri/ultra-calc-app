// utils/calculateRoom.ts
import { WATER_TABLE } from "../models/waterTable";
import {
  FLOOR_COVER_R,
  GENERIC_PRESETS,
  GLAZING_WINDOW_U,
  UK_PRESETS,
} from "../models/presets";
import {
  RoomResults,
  RoomInput,
  ProjectSettings,
  MaterialUValues,
} from "../models/projectTypes";
import { determineMode, toBTU } from "./ultraCalcLocked";

/* ------------------------------------------------------------
   1. Water temperature interpolation
------------------------------------------------------------ */
export function interpWaterC(q_Wm2: number): number {
  const a = WATER_TABLE;
  if (q_Wm2 <= a[0].wpm2) return a[0].c;
  if (q_Wm2 >= a[a.length - 1].wpm2) return a[a.length - 1].c;

  for (let i = 0; i < a.length - 1; i++) {
    const p = a[i];
    const n = a[i + 1];
    if (q_Wm2 >= p.wpm2 && q_Wm2 <= n.wpm2) {
      const t = (q_Wm2 - p.wpm2) / (n.wpm2 - p.wpm2);
      return p.c + t * (n.c - p.c);
    }
  }
  return a[a.length - 1].c;
}

/* ------------------------------------------------------------
   2. U-value merging (region + glazing + overrides)
------------------------------------------------------------ */
function getWindowUFromGlazing(
  settings: ProjectSettings,
  fallback: number
): number {
  if (settings.glazing) return GLAZING_WINDOW_U[settings.glazing] ?? fallback;
  return fallback;
}

function mergeUValues(settings: ProjectSettings): {
  U: MaterialUValues;
  achOrN: number;
} {
  const period = settings.insulationPeriod ?? "custom";

  let base = GENERIC_PRESETS[period];
  let U: MaterialUValues = { ...base.U };
  let achOrN = base.ACH;

  if (settings.region === "UK" && settings.standardsMode === "BS_EN_12831") {
    const uk = UK_PRESETS[period];
    if (uk?.U) {
      U = { ...U, ...uk.U };
    }
  }

  U.window = getWindowUFromGlazing(settings, U.window);

  if (settings.customUOverrides) {
    U = { ...U, ...settings.customUOverrides };
  }

  return { U, achOrN };
}

/* ------------------------------------------------------------
   3. Geometry helpers
------------------------------------------------------------ */
export function roomArea_m2(r: RoomInput): number {
  return r.length_m * r.width_m;
}

export function roomVolume_m3(r: RoomInput): number {
  const OCCUPIED_HEIGHT_CAP_M = 2.4;
  const effectiveHeight_m = Math.min(
    r.height_m ?? OCCUPIED_HEIGHT_CAP_M,
    OCCUPIED_HEIGHT_CAP_M
  );
  return roomArea_m2(r) * effectiveHeight_m;
}

/* ------------------------------------------------------------
   4. Fabric heat loss
------------------------------------------------------------ */
function fabricLoss_W(r: RoomInput, U: MaterialUValues, dT: number): number {
  const Afloor = r.length_m * r.width_m;

  const wallArea = Math.max(
    0,
    (r.exteriorLen_m ?? 0) * r.height_m -
      (r.windowArea_m2 ?? 0) -
      (r.doorArea_m2 ?? 0)
  );

  const Qw = U.wall * wallArea * dT;
  const Qwin = U.window * (r.windowArea_m2 ?? 0) * dT;
  const Qdoor = U.door * (r.doorArea_m2 ?? 0) * dT;
  const Qc = r.ceilingExposed ? U.roof * Afloor * dT : 0;
  const Qf = r.floorExposed ? U.floor * Afloor * dT : 0;

  return Qw + Qwin + Qdoor + Qc + Qf;
}

/* ------------------------------------------------------------
   5. Ventilation / infiltration
------------------------------------------------------------ */
function ventilationLoss_W(
  r: RoomInput,
  settings: ProjectSettings,
  achOrN: number,
  dT: number
): number {
  const V = roomVolume_m3(r);

  if (settings.region === "UK" || settings.region === "EU") {
    const c_air = 0.34;
    return (
      c_air * achOrN * V * dT + (settings.mechVent_m3_per_h ?? 0) * c_air * dT
    );
  }

  return 0.33 * achOrN * V * dT;
}

/* ------------------------------------------------------------
   6. Psi & ground losses
------------------------------------------------------------ */
function thermalBridge_W(settings: ProjectSettings, dT: number): number {
  return (settings.psiAllowance_W_per_K ?? 0) * dT;
}

function groundLoss_W(r: RoomInput, dT: number): number {
  console.log(r.floorOnGround);
  if (!r.floorOnGround) return 0;
  return 0.1 * roomArea_m2(r) * dT;
}

/* ------------------------------------------------------------
   7. Safety & heat-up factors (EU/UK only)
------------------------------------------------------------ */
function applySafetyFactors(q_W: number, settings: ProjectSettings): number {
  if (!(settings.region === "UK" || settings.region === "EU")) return q_W;

  const safety = 1 + (settings.safetyFactorPct ?? 0) / 100;
  const heatUp = 1 + (settings.heatUpFactorPct ?? 0) / 100;

  return q_W * safety * heatUp;
}

/* ------------------------------------------------------------
   8. Floor covering resistance
------------------------------------------------------------ */
function getFloorCoverR(room: RoomInput): number | undefined {
  return room.floorCover ? FLOOR_COVER_R[room.floorCover] : undefined;
}

/* ------------------------------------------------------------
   9. MAIN — PHYSICS ONLY
------------------------------------------------------------ */
export function calculateRoom(
  r: RoomInput,
  settings: ProjectSettings
): RoomResults {
  const dT = (r.setpointC ?? settings.indoorTempC) - settings.outdoorTempC;

  const { U, achOrN } = mergeUValues(settings);

  const qFabric = fabricLoss_W(r, U, dT);
  const qVent = ventilationLoss_W(r, settings, achOrN, dT);
  const qPsi = thermalBridge_W(settings, dT);
  const qGround = groundLoss_W(r, dT);

  const qBefore = qFabric + qVent + qPsi + qGround;
  const qAfter = applySafetyFactors(qBefore, settings);

  const area = roomArea_m2(r);
  const load_W_per_m2 = area > 0 ? qAfter / area : 0;

  const floorR = getFloorCoverR(r);

  let waterTemp_C: number;

  if (r.installMethod === "INSLAB") {
    const loadBTU = toBTU({
      unit: "W_M2",
      value: load_W_per_m2,
    });
    const mode = determineMode(loadBTU);
    waterTemp_C =
      mode === "LL"
        ? ((100 - 32) * 5) / 9 
        : ((120 - 32) * 5) / 9; 
  } else {
    waterTemp_C = interpWaterC(load_W_per_m2);

    if (typeof floorR === "number") {
      waterTemp_C += Math.min(12, 25 * floorR);
    }
  }

  const warnings: string[] = [];
  if (load_W_per_m2 > 145)
    warnings.push("High load — supplemental heat may be required.");

  return {
    name: r.name,

    qFabric_W: qFabric,
    qVent_W: qVent,
    qPsi_W: qPsi,
    qGround_W: qGround,

    qBeforeFactors_W: qBefore,
    qAfterFactors_W: qAfter,

    load_W_per_m2,
    waterTemp_C,
    warnings,

    floorCover_R_m2K_per_W: floorR,
    floorCover_U_W_per_m2K: floorR ? 1 / floorR : undefined,
  };
}
