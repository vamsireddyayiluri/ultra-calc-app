import { useMemo } from "react";
import { computeRoom } from "../utils/physics";
import { ProjectHeader, Room, RoomResults } from "../models/projectTypes";

/**
 * Computes overall project summary by aggregating all room results.
 */
export function useProjectSummary(
  rooms: Room[],
  project: ProjectHeader
): {
  totalW: number;
  avg_Wm2: number;
  totalTube_ft: number;
  totalFins: number;
  totalClips: number;
  totalLoops: number;
} {
  return useMemo(() => {
    if (!rooms?.length) {
      return {
        totalW: 0,
        avg_Wm2: 0,
        totalTube_ft: 0,
        totalFins: 0,
        totalClips: 0,
        totalLoops: 0,
      };
    }

    let totalW = 0;
    let totalArea_m2 = 0;
    let totalTube_ft = 0;
    let totalFins = 0;
    let totalClips = 0;
    let totalLoops = 0;

    for (const room of rooms) {
      // Compute results using your physics logic
      const res: RoomResults = computeRoom(room, project.period, project);
      const area_m2 = room.length_m * room.width_m;

      totalW += res.Q_W ?? 0;
      totalArea_m2 += area_m2;
      totalTube_ft += res.tubingLength_ft ?? 0;
      totalFins += res.fins_count ?? 0;
      totalClips += res.clips_count ?? 0;
      totalLoops += res.loops ?? 0;
    }

    const avg_Wm2 = totalArea_m2 > 0 ? totalW / totalArea_m2 : 0;

    return {
      totalW,
      avg_Wm2,
      totalTube_ft,
      totalFins,
      totalClips,
      totalLoops,
    };
  }, [rooms, project]);
}
