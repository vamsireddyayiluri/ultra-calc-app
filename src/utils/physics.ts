import { WATER_TABLE } from "../models/waterTable";
import {
  FLOOR_COVER_R,
  GENERIC_PRESETS,
  GLAZING_WINDOW_U,
  MAX_LOOP_M,
  SPACING_TABLE,
  UK_PRESETS,
} from "../models/presets";
import {
  RoomResults,
  RoomInput,
  ProjectSettings,
  MaterialUValues,
} from "../models/projectTypes";
import { m2_to_ft2, m_to_ft } from "./conversions";

// ------------------------------------------------------------
// 1. Interpolation from empirical water temperature table
// ------------------------------------------------------------
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

// ------------------------------------------------------------
// 2. Preset and U-value Merging
// ------------------------------------------------------------
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
  const base = { ...GENERIC_PRESETS[period] };
  console.log("base", base);
  const windowUFromGlazing = getWindowUFromGlazing(settings, base.U.window);
  base.U.window = windowUFromGlazing;

  if (settings.region === "UK" && settings.standardsMode === "BS_EN_12831") {
    const uk = UK_PRESETS[period];
    if (uk?.U) {
      base.U = { ...base.U, ...uk.U, window: windowUFromGlazing };
    }
    const n = base.ACH;
    const U = settings.customUOverrides
      ? { ...base.U, ...settings.customUOverrides }
      : base.U;
    return { U, achOrN: n };
  }

  const ach = base.ACH;
  const U = settings.customUOverrides
    ? { ...base.U, ...settings.customUOverrides }
    : base.U;
  return { U, achOrN: ach };
}

// ------------------------------------------------------------
// 3. Helpers for geometry
// ------------------------------------------------------------
export function roomArea_m2(r: RoomInput): number {
  return r.length_m * r.width_m;
}
export function roomPerimeter_m(r: RoomInput): number {
  return 2 * (r.length_m + r.width_m);
}
export function roomVolume_m3(r: RoomInput): number {
  return roomArea_m2(r) * r.height_m;
}

// ------------------------------------------------------------
// 4. Heat loss calculations (restored wall/window/door logic)
// ------------------------------------------------------------
function fabricLoss_W(
  r: RoomInput,
  uvals: MaterialUValues,
  dT: number
): number {
  const L = r.length_m;
  const W = r.width_m;
  const H = r.height_m;
  const Afloor = L * W;
  const wallArea = Math.max(
    0,
    (r.exteriorLen_m ?? 0) * H - (r.windowArea_m2 ?? 0) - (r.doorArea_m2 ?? 0)
  );

  const Qw = uvals.wall * wallArea * dT;
  const Qwin = uvals.window * (r.windowArea_m2 ?? 0) * dT;
  const Qdoor = uvals.door * (r.doorArea_m2 ?? 0) * dT;
  const Qc = r.ceilingExposed ? uvals.roof * Afloor * dT : 0;
  const Qf = r.floorExposed ? uvals.floor * Afloor * dT : 0;

  return Qw + Qwin + Qdoor + Qc + Qf;
}

// ------------------------------------------------------------
// 5. Ventilation / Infiltration
// ------------------------------------------------------------
function ventilationLoss_W(
  r: RoomInput,
  settings: ProjectSettings,
  achOrN: number,
  dT: number
): number {
  const V = roomVolume_m3(r);
  if (settings.region === "UK" || settings.region === "EU") {
    // Keep old logic: EN12831-style
    const c_air = 0.34;
    const Qinfil = c_air * achOrN * V * dT;
    const Qvent = (settings.mechVent_m3_per_h ?? 0) * c_air * dT;
    return Qinfil + Qvent;
  } else {
    const c_air = 0.33;
    const Q = c_air * achOrN * V * dT;
    return Q;
  }
}

// ------------------------------------------------------------
// 6. Thermal bridges & ground loss
// ------------------------------------------------------------
function thermalBridge_W(settings: ProjectSettings, dT: number): number {
  return (settings.psiThermalBridge_W_per_K ?? 0) * dT;
}
function groundLoss_W(
  settings: ProjectSettings,
  r: RoomInput,
  dT: number
): number {
  if (!settings.floorOnGround) return 0;
  const A = roomArea_m2(r);
  return 0.1 * A * dT;
}

// ------------------------------------------------------------
// 7. Safety & heat-up factors (UK or EU)
// ------------------------------------------------------------
function applySafetyFactors(q_W: number, settings: ProjectSettings): number {
  if (!(settings.region === "UK" || settings.region === "EU")) return q_W;
  const safety = 1 + (settings.safetyFactorPct ?? 0) / 100;
  const heatUp = 1 + (settings.heatUpFactorPct ?? 0) / 100;
  return q_W * safety * heatUp;
}

// ------------------------------------------------------------
// 8. Load to spacing (same as new version)
// ------------------------------------------------------------
function loadToSpacing(load_W_per_m2: number): {
  spacing_in: number;
  tubeSize_in: 0.5 | 0.75;
} {
  for (const row of SPACING_TABLE) {
    if (load_W_per_m2 <= row.maxLoad)
      return { spacing_in: row.spacing_in, tubeSize_in: row.tubeSize_in };
  }
  return { spacing_in: 12, tubeSize_in: 0.75 };
}

// ------------------------------------------------------------
// 9. Imperial material estimation (restored old formula)
// ------------------------------------------------------------
function materialEstimationImperial(
  r: RoomInput,
  spacing_in: number,
  tubeSize_in: 0.5 | 0.75
): {
  Lft: number;
  fins: number;
  clips: number;
  loops: number;
  perLoop_ft: number;
} {
  const Afloor_ft2 = m2_to_ft2(roomArea_m2(r));
  const Perim_ft = m_to_ft(roomPerimeter_m(r));
  const Sft = spacing_in / 12;
  const straight = Afloor_ft2 / Math.max(0.1, Sft);
  const turns = 0.1 * straight;
  const perimAllowance = 0.5 * Perim_ft;
  const Lft = straight + turns + perimAllowance;

  const fins = Math.ceil(Lft * 1.2);
  const clips = Math.ceil(Lft / 2.5);

  const loopMax = tubeSize_in === 0.75 ? 400 : 300;
  const loops = Math.max(1, Math.ceil(Lft / loopMax));
  const perLoop_ft = Math.round(Lft / loops);
  return { Lft, fins, clips, loops, perLoop_ft };
}

// ------------------------------------------------------------
// 10. Floor covering resistance
// ------------------------------------------------------------
function getFloorCoverR(room: RoomInput): number | undefined {
  if (room.floorCover) return FLOOR_COVER_R[room.floorCover];
  return undefined;
}

// ------------------------------------------------------------
// 11. Main function
// ------------------------------------------------------------
export function calculateRoom(
  r: RoomInput,
  settings: ProjectSettings
): RoomResults {
  const dT = (r.setpointC ?? settings.indoorTempC) - settings.outdoorTempC;
  const { U, achOrN } = mergeUValues(settings);

  const qFabric = fabricLoss_W(r, U, dT);
  const qVent = ventilationLoss_W(r, settings, achOrN, dT);
  const qPsi = thermalBridge_W(settings, dT);
  const qGround = groundLoss_W(settings, r, dT);

  const qBefore = qFabric + qVent + qPsi + qGround;
  const qAfter = applySafetyFactors(qBefore, settings);

  const area = roomArea_m2(r);
  const load_W_per_m2 = area > 0 ? qAfter / area : 0;

  const spacingSel = loadToSpacing(load_W_per_m2);
  const materials = materialEstimationImperial(
    r,
    spacingSel.spacing_in,
    spacingSel.tubeSize_in
  );

  const floorR = getFloorCoverR(r);
  let waterTemp_C = interpWaterC(load_W_per_m2);
  if (typeof floorR === "number") {
    waterTemp_C += Math.min(12, 25 * floorR);
  }

  // ------------------------------------------------------------
  // Warnings
  // ------------------------------------------------------------
  const warnings: string[] = [];

  // High load
  if (load_W_per_m2 > 40)
    warnings.push("High load (>40 W/m²): tighten spacing and/or raise SWT.");

  // Loop limit
  if (
    materials.Lft / materials.loops >
    (spacingSel.tubeSize_in === 0.75 ? 400 : 300)
  )
    warnings.push("Exceeds loop limit — add more loops.");

  // High load → recommend 3/4" tubing
  if (load_W_per_m2 > 145)
    warnings.push('Recommend 3/4" tubing due to high load (>145 W/m²).');

  // ✅ Restored: joist spacing warning from new structured code
  if (r.joistSpacing === "24in_600mm" && load_W_per_m2 > 120)
    warnings.push(
      '24" joist bays with high load – consider adding plates or reducing spacing.'
    );

  return {
    name: r.name,
    qFabric_W: qFabric,
    qVent_W: qVent,
    qPsi_W: qPsi,
    qGround_W: qGround,
    qBeforeFactors_W: qBefore,
    qAfterFactors_W: qAfter,

    load_W_per_m2,
    spacing_in: spacingSel.spacing_in,
    tubeSize_in: spacingSel.tubeSize_in,

    // ✅ Metric (required by RoomResults)
    tubingLength_m: materials.Lft * 0.3048, // convert ft → m
    perLoopLength_m: materials.perLoop_ft * 0.3048, // convert ft → m

    // ✅ Optional (legacy, still available)
    tubingLength_ft: materials.Lft,
    perLoop_ft: materials.perLoop_ft,

    fins_qty: materials.fins,
    clips_qty: materials.clips,
    loops_qty: materials.loops,

    waterTemp_C,
    warnings,

    // ✅ Optional metadata
    joistSpacing: r.joistSpacing,
    floorCover: r.floorCover,
    floorCover_R_m2K_per_W: floorR,
    floorCover_U_W_per_m2K: floorR ? 1 / floorR : undefined,
  };
}
