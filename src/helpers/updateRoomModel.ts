import { RichRoom, RoomInput } from "../models/projectTypes";
import { uid } from "../utils/uid";

export function toRichRoom(simple: RoomInput): RichRoom {
  return {
    name: simple.name,
    length: simple.length_m,
    width: simple.width_m,
    height: simple.height_m,
    setpoint: 21, // Default comfort temp
    ceilingExposed: simple.ceilingExposed,
    floorExposed: simple.floorExposed,
    installMethod: simple.installMethod,
    spacingOverrideIn: null,
    sides: [
      {
        isExterior: true,
        length: simple.exteriorLen_m,
        openingArea: (simple.windowArea_m2 || 0) + (simple.doorArea_m2 || 0),
        openingUOverride: null,
      },
    ],
  };
}
export function fromRichRoom(rich: RichRoom): RoomInput {
  return {
    id: uid(),
    name: rich.name,
    length_m: rich.length,
    width_m: rich.width,
    height_m: rich.height,
    exteriorLen_m: rich.sides[0]?.length || 0,
    windowArea_m2: rich.sides[0]?.openingArea || 0,
    doorArea_m2: 0,
    ceilingExposed: rich.ceilingExposed,
    floorExposed: rich.floorExposed,
    installMethod: rich.installMethod,
  };
}