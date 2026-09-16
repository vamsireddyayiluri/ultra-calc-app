import { HeatingSystem, ProjectSettings } from "../models/projectTypes";

export const DEFAULT_HEATING_SYSTEM: HeatingSystem = "STANDARD";

export const HEATING_SYSTEM_LABELS: Record<HeatingSystem, string> = {
  STANDARD: "Standard Boiler",
  HEAT_PUMP: "Heat Pump",
};

export function getHeatingSystem(project: Pick<ProjectSettings, "heatingSystem">): HeatingSystem {
  return project.heatingSystem ?? DEFAULT_HEATING_SYSTEM;
}

export function getHeatingSystemLabel(
  heatingSystem: HeatingSystem | undefined,
): string {
  return HEATING_SYSTEM_LABELS[heatingSystem ?? DEFAULT_HEATING_SYSTEM];
}

