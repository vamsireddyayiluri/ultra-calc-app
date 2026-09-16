import { INSTALL_METHOD_OPTIONS } from "../models/presets";
import { Region, ProjectSummary } from "../models/projectTypes";
import { W_to_Btuh, Wpm2_to_Btuhft2 } from "../utils/conversions";
import { toDisplayArea } from "./display";
import { InstallMethod } from "./ultraCalcLocked";

export function formatProjectSummary(region: Region, summary: ProjectSummary) {
  const imperial =
    region === "US" || region === "CA_IMPERIAL" || region === "CA_METRIC";

  return {
    totalHeat: imperial
      ? `${Math.round(W_to_Btuh(summary.totalW))} BTU/hr`
      : `${Math.round(summary.totalW)} W`,

    avgLoad: imperial
      ? `${Wpm2_to_Btuhft2(summary.avg_Wm2).toFixed(1)} BTU/hr·ft²`
      : `${summary.avg_Wm2.toFixed(1)} W/m²`,

    totalArea: `${(toDisplayArea(region, summary.totalArea_m2) ?? 0).toFixed(2)} ${
      region === "US" || region === "CA_IMPERIAL" ? "sq ft" : "m2"
    }`,

    tubing: imperial
      ? `${Math.round(summary.totalTubing_m * 3.28084)} ft`
      : `${Math.round(summary.totalTubing_m)} m`,
    fins: `${summary.totalFins} pairs (${summary.totalFinHalves} halves)`,

    clips: summary.totalClips.toLocaleString(),
    loops: (summary.totalLoops ?? 0).toLocaleString(),
  };
}
export const getInstallMethodLabel = (value?: InstallMethod) =>
  INSTALL_METHOD_OPTIONS.find((o) => o.value === value)?.label ?? "-";
