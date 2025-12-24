import { GENERIC_PRESETS, UK_PRESETS } from "../models/presets";
import { ProjectSettings, MaterialUValues } from "../models/projectTypes";

export function getDefaultUValues(settings: Partial<ProjectSettings>): MaterialUValues {
  const period = settings.insulationPeriod ?? "pre1980";
  const base = GENERIC_PRESETS[period]?.U ?? {
    wall: 0,
    window: 0,
    door: 0,
    roof: 0,
    floor: 0,
  };

  if (settings.region === "UK" && settings.standardsMode === "BS_EN_12831") {
    const uk = UK_PRESETS[period];
    if (uk?.U) return { ...base, ...uk.U } as MaterialUValues;
  }

  return base as MaterialUValues;
}

