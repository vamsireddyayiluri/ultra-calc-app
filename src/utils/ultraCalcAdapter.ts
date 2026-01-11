// utils/runUltraCalc.ts
import { ultraCalc, UltraCalcInput } from "./ultraCalcLocked";
import { RoomInput, RoomResults, ProjectSettings } from "../models/projectTypes";

export function runUltraCalc(
  room: RoomInput,
  results: RoomResults,
  project: ProjectSettings
) {
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
  return ultraCalc(input);
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
