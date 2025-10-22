import * as Papa from "papaparse";
import { saveAs } from "file-saver";
import { ProjectHeader, Room } from "../models/projectTypes";

export const exportCSV = (project: ProjectHeader & { rooms: Room[]; }) => {
  const rows = project.rooms.map((r: { name: any; length_m: number; width_m: number; exteriorLen_m: any; windowArea_m2: any; doorArea_m2: any; ceilingExposed: any; floorExposed: any; method: any; }) => ({
    Project: project.name,
    Room: r.name,
    Length_m: r.length_m,
    Width_m: r.width_m,
    Area_m2: r.length_m * r.width_m,
    Exterior_m: r.exteriorLen_m,
    Window_m2: r.windowArea_m2,
    Door_m2: r.doorArea_m2,
    CeilingExposed: r.ceilingExposed ? "Yes" : "No",
    FloorExposed: r.floorExposed ? "Yes" : "No",
    Method: r.method,
  }));

  const csv = Papa.unparse(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  saveAs(blob, `${project.name}_rooms.csv`);
};
