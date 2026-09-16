// utils/runUltraCalc.ts
import { determineMode, ultraCalc, UltraCalcInput } from "./ultraCalcLocked";
import { RoomInput, RoomResults, ProjectSettings } from "../models/projectTypes";

export function runUltraCalc(
  room: RoomInput,
  results: RoomResults,
  project: ProjectSettings
) {
  const heatingSystem = project.heatingSystem ?? "STANDARD";
  // Heat Pump spacing optimisation will be implemented later after
  // business confirmation. Current UltraCalc sizing remains unchanged:
  // the client has not confirmed whether Heat Pump projects should
  // always use the tightest spacing or keep dynamic spacing while
  // optimizing for lower water temperature.

  const input: UltraCalcInput = {
    heatLoad: {
      unit: "W_M2",
      value: results.load_W_per_m2,
    },
    room: {
      unit: "M",
      length: room.length_m!,
      width: room.width_m!,
    },
    method: mapInstallMethod(room.installMethod),
    joist: mapJoist(room.joistSpacing?.toString()),
  };

  if (project.heatingSystem === "HEAT_PUMP") {
    return ultraCalc(applyHeatPumpMinimumSpacing(input));
  }

  return ultraCalc(input);
}

function applyHeatPumpMinimumSpacing(input: UltraCalcInput): UltraCalcInput {
  const standard = ultraCalc(input);
  if (standard.selection.mode !== "LL") return input;

  return {
    ...input,
    heatLoad: {
      unit: "BTU_FT2",
      value: firstHighLoadBTU(),
    },
  };
}

function firstHighLoadBTU(): number {
  let loadBTU = 0;
  while (determineMode(loadBTU) === "LL") {
    loadBTU += 1;
  }
  return loadBTU;
}

function mapInstallMethod(method?: string) {
  switch (method) {
    case "DRILLING":
      return "DRILLING";
    case "OPEN_WEB":
      return "OPEN_WEB";
    case "HANGING_SNAKE":
      return "HANGING_SNAKE";
    case "HANGING_ULTRACLIP":
      return "HANGING_ULTRACLIP";
    case "TOPDOWN_UC_UC1212":
      return "TOPDOWN_UC_UC1212";
    case "INSLAB":
      return "INSLAB";
    default:
      return "DRILLING";
  }
}

function mapJoist(js?: string): 12 | 16 | 19 | 24 {
  switch (js) {
    case "12":
      return 12;
    case "16":
      return 16;
    case "19":
      return 19;
    case "24":
      return 24;
    default:
      return 16;
  }
}
