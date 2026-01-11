import { ProjectSettings } from "../models/projectTypes";
import {
  normalizeTemperature,
  normalizeVentilation,
  normalizeUValue,
  normalizePsiAllowance,
} from "./normalize";

export function normalizeProjectSettings(
  project: ProjectSettings
): ProjectSettings {
  return {
    ...project,

    // 🔥 Already normalized by UI
    indoorTempC: project.indoorTempC,
    outdoorTempC: project.outdoorTempC,

    mechVent_m3_per_h: normalizeVentilation(
      project.region,
      project.mechVent_m3_per_h
    ),

    psiAllowance_W_per_K: normalizePsiAllowance(
      project.region,
      project.psiAllowance_W_per_K
    ),

    customUOverrides: project.customUOverrides
      ? {
          wall: normalizeUValue(project.region, project.customUOverrides.wall),
          window: normalizeUValue(
            project.region,
            project.customUOverrides.window
          ),
          door: normalizeUValue(project.region, project.customUOverrides.door),
          roof: normalizeUValue(project.region, project.customUOverrides.roof),
          floor: normalizeUValue(
            project.region,
            project.customUOverrides.floor
          ),
        }
      : undefined,
  };
}
