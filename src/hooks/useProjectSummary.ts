import { useMemo } from "react";
import { calculateRoom } from "../utils/physics";
import {
  ProjectSettings,
  RoomInput,
  ProjectSummary,
} from "../models/projectTypes";
import { normalizeProjectSettings } from "../utils/normalizeProject";
import { runUltraCalc } from "../utils/ultraCalcAdapter";

export function useProjectSummary(
  rooms: RoomInput[],
  project: ProjectSettings,
): ProjectSummary {
  return useMemo(() => {
    if (!rooms?.length) {
      return {
        totalW: 0,
        totalTubing_m: 0,
        totalFins: 0,
        totalClips: 0,
        totalLoops: 0,
        avgWaterTemp_C: 0,
        avg_Wm2: 0,
        notes: [],
        waterTempRange_C: undefined,
      };
    }

    const normalizedProject = normalizeProjectSettings(project);

    let totalW = 0;
    let totalArea_m2 = 0;

    let totalTubing_m = 0;
    let totalFins = 0;
    let totalClips = 0;
    let totalLoops = 0;

    let weightedWaterTempSum = 0;
    let maxWaterTemp_C = 0;

    const notes: string[] = [];
    const ultraFinSpacingSet = new Set<number>();
    const tubingSpacingSet = new Set<number>();

    for (const room of rooms) {
      const res = calculateRoom(room, normalizedProject);

      const area_m2 = room.length_m * room.width_m;

      totalW += res.qAfterFactors_W;
      totalArea_m2 += area_m2;

      const waterTemp = res.waterTemp_C ?? 0;
      weightedWaterTempSum += waterTemp * area_m2;

      // Track max water temp
      if (waterTemp > maxWaterTemp_C) {
        maxWaterTemp_C = waterTemp;
      }

      if (res.warnings?.length) {
        notes.push(`${room.name}: ${res.warnings.join("; ")}`);
      }

      const ultra = runUltraCalc(room, res, project);

      totalTubing_m += ultra.materials.tubing_m;
      totalFins += ultra.materials.fins_pairs;
      totalLoops += ultra.materials.loops;

      totalClips +=
        (ultra.materials.hanging_supports ?? 0) +
        (ultra.materials.open_web_ultra_clips ?? 0) +
        (ultra.materials.topdown_ultra_clips ?? 0) +
        (ultra.materials.topdown_uc1212 ?? 0) +
        (ultra.materials.topdown_uc1234 ?? 0);

      if (ultra.selection.ultraFinSpacing_mm != null) {
        ultraFinSpacingSet.add(ultra.selection.ultraFinSpacing_mm);
      }

      if (ultra.selection.tubingSpacing_mm != null) {
        tubingSpacingSet.add(ultra.selection.tubingSpacing_mm);
      }

      if (ultra.selection.supplementalWarning) {
        notes.push(`${room.name}: Supplemental heat recommended (high load)`);
      }
    }

    const avg_Wm2 = totalArea_m2 > 0 ? totalW / totalArea_m2 : 0;
    const avgWaterTemp_C =
      totalArea_m2 > 0 ? weightedWaterTempSum / totalArea_m2 : 0;

    const ultraFinSpacing_mm =
      ultraFinSpacingSet.size === 1
        ? [...ultraFinSpacingSet][0]
        : ultraFinSpacingSet.size > 1
        ? "VARIES"
        : undefined;

    const tubingSpacing_mm =
      tubingSpacingSet.size === 1
        ? [...tubingSpacingSet][0]
        : tubingSpacingSet.size > 1
        ? "VARIES"
        : undefined;

    // 🔥 Build water temperature range (client requirement)
    let waterTempRange_C: string | undefined;

    if (maxWaterTemp_C > 0) {
      if (project.region === "US" || project.region === "CA_IMPERIAL") {
        const maxF = Math.round((maxWaterTemp_C * 9) / 5 + 32);
        waterTempRange_C = `100–${maxF}°F`;
      } else {
        const maxC = Math.round(maxWaterTemp_C);
        waterTempRange_C = `38–${maxC}°C`;
      }
    }

    return {
      totalW,
      totalTubing_m,
      totalFins,
      totalClips,
      totalLoops,
      avgWaterTemp_C,
      avg_Wm2,
      notes,
      ultraFinSpacing_mm,
      tubingSpacing_mm,
      waterTempRange_C,
    };
  }, [rooms, project]);
}