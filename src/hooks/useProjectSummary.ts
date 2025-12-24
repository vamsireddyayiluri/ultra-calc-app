import { useMemo } from "react";
import { calculateRoom } from "../utils/physics";
import {
  ProjectSettings,
  RoomInput,
  RoomResults,
  ProjectSummary,
} from "../models/projectTypes";

export function useProjectSummary(
  rooms: RoomInput[],
  project: ProjectSettings
): ProjectSummary {
  return useMemo(() => {
    if (!rooms?.length) {
      return {
        totalW: 0,
        totalTubing_m: 0,
        totalFins: 0,
        totalClips: 0,
        avgWaterTemp_C: 0,
        avg_Wm2: 0,
        totalLoops: 0,
        notes: [],
      };
    }

    let totalW = 0;
    let totalArea_m2 = 0;
    let totalTubing_m = 0;
    let totalFins = 0;
    let totalClips = 0;
    let totalLoops = 0;
    let weightedWaterTempSum = 0;

    const notes: string[] = [];

    for (const room of rooms) {
      const res: RoomResults = calculateRoom(room, project);
      const area_m2 = room.length_m * room.width_m;

      totalW += res.qAfterFactors_W ?? res.Q_W ?? 0;
      totalArea_m2 += area_m2;
      totalTubing_m += res.tubingLength_m ?? (res.tubingLength_ft ?? 0) / 3.28084;
      totalFins += res.fins_qty ?? 0;
      totalClips += res.clips_qty ?? 0;
      totalLoops += res.loops_qty ?? 0;

      // ✅ Weighted water temperature (area-based)
      weightedWaterTempSum += (res.waterTemp_C ?? 0) * area_m2;

      // ✅ Collect warnings per room (optional)
      if (res.warnings?.length) {
        notes.push(`${res.name}: ${res.warnings.join("; ")}`);
      }
    }

    const avg_Wm2 = totalArea_m2 > 0 ? totalW / totalArea_m2 : 0;
    const avgWaterTemp_C =
      totalArea_m2 > 0 ? weightedWaterTempSum / totalArea_m2 : 0;

    return {
      totalW,
      totalTubing_m,
      totalFins,
      totalClips,
      avgWaterTemp_C,
      avg_Wm2,
      totalLoops,
      notes,
    };
  }, [rooms, project]);
}
