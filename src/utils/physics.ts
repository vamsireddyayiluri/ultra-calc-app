import { WATER_TABLE } from "../models/waterTable";
import { PRESETS_UK, PRESETS_GLOBAL } from "../models/presets";
import {
  Room,
  PeriodKey,
  RoomResults,
  RegionKey,
  ProjectHeader,
} from "../models/projectTypes";
import { m2_to_ft2, m_to_ft } from "./conversions";

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
function getPreset(
  region: RegionKey,
  period: PeriodKey,
  custom?: ProjectHeader["customU"]
) {
  const base = (
    region === "UK" || region === "EU" ? PRESETS_UK : PRESETS_GLOBAL
  )[period];
  return { ...base, U: { ...base.U, ...(custom || {}) } };
}

export function computeRoom(
  room: Room,
  periodKey: PeriodKey,
  project: ProjectHeader
): RoomResults {
  const preset = getPreset(project.region, periodKey, project.customU);
  const dT = project.designIndoorC - project.designOutdoorC;

  const L = room.length_m;
  const W = room.width_m;
  const H = room.height_m;
  const Afloor = L * W;
  const Perim = 2 * (L + W);
  const wallArea = Math.max(
    0,
    room.exteriorLen_m * H - (room.windowArea_m2 + room.doorArea_m2)
  );

  // Conduction
  const Qw = preset.U.wall * wallArea * dT;
  const Qwin = preset.U.window * room.windowArea_m2 * dT;
  const Qdoor = preset.U.door * room.doorArea_m2 * dT;
  const Qc = room.ceilingExposed ? preset.U.ceiling * Afloor * dT : 0;
  const Qf = room.floorExposed ? preset.U.floor * Afloor * dT : 0;

  // Infiltration & Ventilation
  const Volume = L * W * H;
  let Qinfil = 0;
  let Qvent = 0;

  if (project.region === "UK" || project.region === "EU") {
    // UK/EU: EN12831-style ventilation & infiltration
    const c_air = 0.34; // W·h/m³·K
    const n = project.infiltrationACH ?? preset.ACH;
    Qinfil = c_air * n * Volume * dT;
    Qvent = (project.mechVent_m3_per_h ?? 0) * c_air * dT;
  } else {
    // Global / North American: generic combined formula
    const c_air = 0.33;
    const ACH = project.infiltrationACH ?? preset.ACH;
    Qinfil = c_air * ACH * Volume * dT;
    Qvent = 0;
  }

  const Qi = Qinfil + Qvent;

  // Psi allowance
  const Qpsi = (project.psiAllowance_W_per_K ?? 0) * dT;

  // Ground/floor loss (placeholder)
  const Qground = room.floorExposed && project.floorOnGround ? 0 : 0;

  // Base total
  const Qbase = Qw + Qwin + Qdoor + Qc + Qf + Qi + Qpsi + Qground;

  // Apply safety & heat-up factors (region-based)
  const applySafety = project.region === "UK" || project.region === "EU";
  const safety = 1 + (project.safetyFactorPct ?? 0) / 100;
  const heatUp = 1 + (project.heatUpFactorPct ?? 0) / 100;
  const Q_design = applySafety ? Qbase * safety * heatUp : Qbase;

  // Floor load & tubing sizing
  const q = Afloor > 0 ? Q_design / Afloor : 0;
  const spacing_in = q <= 50 ? 16 : q <= 145 ? 12 : 12;
  const tubingSize: '1/2"' | '3/4"' = q > 145 ? '3/4"' : '1/2"';

  // Tubing length estimate
  const Afloor_ft2 = m2_to_ft2(Afloor);
  const Perim_ft = m_to_ft(Perim);
  const Sft = spacing_in / 12; // ft between passes
  const straight = Afloor_ft2 / Math.max(0.1, Sft);
  const turns = 0.1 * straight;
  const perimAllowance = 0.5 * Perim_ft;
  const Lft = straight + turns + perimAllowance;

  // Ultra-Fins / Clips
  const fins = Math.ceil(Lft * 1.2);
  const clips = Math.ceil(Lft / 2.5);

  // Loop limits
  const loopMax = tubingSize === '3/4"' ? 400 : 300;
  const loops = Math.max(1, Math.ceil(Lft / loopMax));
  const perLoop = Math.round(Lft / loops);

  const waterC = interpWaterC(q);

  // Warnings
  const warnings: string[] = [];
  if (q > 40)
    warnings.push(
      "High load (>40 W/m²): tighten spacing and/or increase cavity temperature."
    );
  if (Lft / loops > loopMax) warnings.push("Exceeds loop limit — add loops.");
  if (q > 145)
    warnings.push('Recommend 3/4" tubing due to high load (>145 W/m²).');

  return {
    Q_W: Q_design,
    q_Wm2: q,
    spacing_in,
    tubingSize,
    tubingLength_ft: Lft,
    loops,
    perLoop_ft: perLoop,
    fins_count: fins,
    clips_count: clips,
    waterC,
    warnings,
  };
}
