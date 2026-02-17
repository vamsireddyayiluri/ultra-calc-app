// ultraCalcLocked.ts
// ==============================================
// ULTRA-CALC — LOCKED MATERIAL CALCULATOR (FINAL)
// ==============================================
// This file implements the FULL locked material sheet.
// All values are dual-unit (imperial + metric).
// All material quantities are rounded UP for purchasing.
// ==============================================

/* -----------------------------
   TYPES
-------------------------------- */

export type InstallMethod =
  | "DRILLING"
  | "OPEN_WEB"
  | "HANGING_SNAKE"
  | "HANGING_ULTRACLIP"
  | "TOPDOWN_UC_UC1212"
  | "INSLAB";

export type JoistKey = 12 | 16 | 19 | 24;
export type LoadMode = "LL" | "HL" | "HighOutput";
export type TubeSize = 16 | 20;

export type HeatLoadInput =
  | { unit: "BTU_FT2"; value: number }
  | { unit: "W_M2"; value: number };

export type RoomInput =
  | { unit: "FT"; length: number; width: number }
  | { unit: "M"; length: number; width: number };

export interface UltraCalcInput {
  method: InstallMethod;
  joist: JoistKey;
  heatLoad: HeatLoadInput;
  room: RoomInput;
}

export interface UltraCalcOutput {
  selection: {
    method: InstallMethod;
    joist: JoistKey;
    mode: LoadMode;
    tubeSize: TubeSize;
    supplementalWarning: boolean;
    finBlockSvg: string;
    ultraFinSpacing_mm?: number | null;
    tubingSpacing_mm?: number | null;
    spacingDisplayText?: string;
  };
  area: {
    ft2: number;
    m2: number;
  };
  materials: {
    tubing_ft: number;
    tubing_m: number;
    loops: number;
    ft_per_loop: number;
    m_per_loop: number;
    fins_pairs: number;
    fin_halves: number;
    drilling_supports: number;
    hanging_supports?: number;
    open_web_ultra_clips?: number;
    topdown_ultra_clips?: number;
    topdown_uc1212?: number;
    topdown_uc1234?: number;
  };
}

/* -----------------------------
   CONSTANTS & CONVERSIONS
-------------------------------- */

const FT2_PER_M2 = 10.7639;
const W_M2_PER_BTU_FT2 = 3.15459;
const MAX_LOOP_FT = 300;
const SUPPORTS_PER_FT_TUBE = 0.4; // 1 every 30"

const LOAD_BANDS = {
  LL: { maxBTU: 24, maxW: 76 },
  HL: { maxBTU: 46, maxW: 145 },
};

const THRESHOLDS = {
  tubeUpgradeBTU: 46,
  supplementalBTU: 50,
};

const FIN_DENSITY = {
  LL: { ft2PerFin: 1.8 },
  HL: { ft2PerFin: 1.4 },
};

const FIN_SPACING = {
  12: { LL: 22, HL: 17 },
  16: { LL: 16, HL: 13 },
  19: { LL: 14, HL: 11 },
  24: { LL: 21, HL: 17 },
};

const TUBE_PITCH_ACROSS = {
  12: { LL: 21, HL: 17 },
  16: { LL: 16, HL: 13 },
  19: { LL: 14, HL: 11 },
  24: { LL: 21, HL: 17 },
};

const TUBING_ACROSS = {
  12: { LL: 0.5714, HL: 0.7059 },
  16: { LL: 0.75, HL: 0.9231 },
  19: { LL: 0.8571, HL: 1.0909 },
  24: { LL: 0.5714, HL: 0.7059 },
};

const TUBING_WITH = {
  12: 1.0,
  16: 0.75,
  19: 0.6316,
  24: 1.0, // two tubes
};

const OPEN_WEB_CLIPS = {
  12: { LL: 0.286, HL: 0.353 },
  16: { LL: 0.281, HL: 0.346 },
  19: { LL: 0.271, HL: 0.344 },
  24: { LL: 0.286, HL: 0.353 },
};

const INSLAB_TUBING_FACTOR = {
  LL: 1.5, // 8"
  HL: 2.0, // 6"
};

/* -----------------------------
   HELPERS
-------------------------------- */

const ceil = Math.ceil;

export function toBTU(load: HeatLoadInput): number {
  return load.unit === "BTU_FT2" ? load.value : load.value / W_M2_PER_BTU_FT2;
}

function area(room: RoomInput) {
  if (room.unit === "FT") {
    const ft2 = room.length * room.width;
    return { ft2, m2: ft2 / FT2_PER_M2 };
  }
  const m2 = room.length * room.width;
  return { m2, ft2: m2 * FT2_PER_M2 };
}

export function determineMode(loadBTU: number): LoadMode {
  if (loadBTU <= LOAD_BANDS.LL.maxBTU) return "LL";
  if (loadBTU <= LOAD_BANDS.HL.maxBTU) return "HL";
  return "HighOutput";
}

function finBlockName(j: JoistKey, m: "LL" | "HL", method: InstallMethod) {
  const type =
    method === "DRILLING" || method === "OPEN_WEB" ? "drilled" : "parallel";
  return `FB_${j}_${m}_${type}.svg`;
}

function calcLoops(tubingFt: number) {
  const loops = Math.max(1, ceil(tubingFt / MAX_LOOP_FT));
  const ftPer = tubingFt / loops;
  return { loops, ftPer, mPer: ftPer * 0.3048 };
}
function getInslabSpacingText(load: LoadMode): string | null {
  if (load === "LL") return '8" (200 mm)';
  if (load === "HL") return '6" (150 mm)';
  return null;
}

type FinSpacingTable = {
  [joist in JoistKey]: {
    LL: number;
    HL: number;
  };
};

export const ULTRA_FIN_SPACING_MM: FinSpacingTable = {
  12: { LL: 530, HL: 430 },
  16: { LL: 400, HL: 330 },
  19: { LL: 360, HL: 280 },
  24: { LL: 530, HL: 430 },
};
export function getUltraFinSpacing_mm(
  joist: JoistKey,
  load: LoadMode,
  installMethod: InstallMethod
): number | null {
  const WITH_JOIST_METHODS: InstallMethod[] = [
    "HANGING_SNAKE",
    "HANGING_ULTRACLIP",
    "TOPDOWN_UC_UC1212",
  ];

  if (!WITH_JOIST_METHODS.includes(installMethod)) return null;

  const mode = load === "LL" ? "LL" : "HL";
  return ULTRA_FIN_SPACING_MM[joist][mode];
}

export const TUBING_SPACING_MM = ULTRA_FIN_SPACING_MM;
export function getTubingSpacing_mm(
  joist: JoistKey,
  load: LoadMode,
  installMethod: InstallMethod
): number | null {
  const ACROSS_JOIST_METHODS: InstallMethod[] = ["DRILLING", "OPEN_WEB"];

  if (!ACROSS_JOIST_METHODS.includes(installMethod)) return null;

  const mode = load === "LL" ? "LL" : "HL";
  return TUBING_SPACING_MM[joist][mode];
}

export function ultraCalc(input: UltraCalcInput): UltraCalcOutput {
  const loadBTU = toBTU(input.heatLoad);
  const mode = determineMode(loadBTU);
  const calcMode: "LL" | "HL" = mode === "LL" ? "LL" : "HL";

  const tubeSize: TubeSize =
    input.method === "INSLAB"
      ? 16
      : loadBTU > THRESHOLDS.tubeUpgradeBTU
      ? 20
      : 16;

  const supplementalWarning = loadBTU > THRESHOLDS.supplementalBTU;

  const a = area(input.room);

  let tubingFactor: number;

  if (input.method === "INSLAB") {
    tubingFactor = INSLAB_TUBING_FACTOR[calcMode];
  } else {
    const isAcross = input.method === "DRILLING" || input.method === "OPEN_WEB";
    tubingFactor = isAcross
      ? TUBING_ACROSS[input.joist][calcMode]
      : TUBING_WITH[input.joist];
  }

  const tubing_ft = ceil(a.ft2 * tubingFactor);

  const tubing_m = ceil(a.m2 * tubingFactor * 3.28084);

  const fins_pairs =
    input.method === "INSLAB"
      ? 0
      : ceil(a.ft2 / FIN_DENSITY[calcMode].ft2PerFin);

  const fin_halves = fins_pairs * 2;

  let hanging_supports: number | undefined;
  let open_web_ultra_clips: number | undefined;
  let topdown_ultra_clips: number | undefined;
  let topdown_uc1212: number | undefined;
  let topdown_uc1234: number | undefined;

  if (
    input.method === "HANGING_SNAKE" ||
    input.method === "HANGING_ULTRACLIP"
  ) {
    hanging_supports = ceil(tubing_ft * SUPPORTS_PER_FT_TUBE);
  }

  if (input.method === "OPEN_WEB") {
    open_web_ultra_clips = ceil(a.ft2 * OPEN_WEB_CLIPS[input.joist][calcMode]);
  }

  if (input.method === "TOPDOWN_UC_UC1212") {
    const baseSupports = ceil(tubing_ft * SUPPORTS_PER_FT_TUBE);

    topdown_ultra_clips = baseSupports * 2;

    if (tubeSize === 16) {
      topdown_uc1212 = baseSupports;
    } else {
      topdown_uc1234 = baseSupports;
    }
  }

  const loops = calcLoops(tubing_ft);
  const ultraFinSpacing_mm = getUltraFinSpacing_mm(
    input.joist,
    mode,
    input.method
  );

  const tubingSpacing_mm = getTubingSpacing_mm(input.joist, mode, input.method);
  const spacingDisplayText =
    input.method === "INSLAB"
      ? mode === "LL"
        ? '8" (200 mm)'
        : '6" (150 mm)'
      : undefined;

  return {
    selection: {
      method: input.method,
      joist: input.joist,
      mode,
      tubeSize,
      supplementalWarning,
      finBlockSvg: finBlockName(input.joist, calcMode, input.method),
      ultraFinSpacing_mm: input.method === "INSLAB" ? null : ultraFinSpacing_mm,
      tubingSpacing_mm: input.method === "INSLAB" ? null : tubingSpacing_mm,
      spacingDisplayText
    },
    area: {
      ft2: a.ft2,
      m2: a.m2,
    },
    materials: {
      tubing_ft,
      tubing_m,
      loops: loops.loops,
      ft_per_loop: loops.ftPer,
      m_per_loop: loops.mPer,
      fins_pairs,
      fin_halves,
      drilling_supports: 0,
      hanging_supports,
      open_web_ultra_clips,
      topdown_ultra_clips,
      topdown_uc1212,
      topdown_uc1234,
    },
  };
}
