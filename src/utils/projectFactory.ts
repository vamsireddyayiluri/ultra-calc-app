import type { PlanImportProjectMetadata, ProjectSettings, RoomInput } from "../models/projectTypes";
import { DEFAULT_HEATING_SYSTEM } from "./heatingSystem";
import { uid } from "./uid";
import { getDefaultUValues } from "./uDefaults";

export type EditableProject = ProjectSettings & { rooms: RoomInput[] };

export function createEmptyRoom(name = "Room"): RoomInput {
  return {
    id: uid(),
    name,
    length_m: 0,
    width_m: 0,
    height_m: 0,
    exteriorLen_m: 0,
    windowArea_m2: 0,
    doorArea_m2: 0,
    ceilingExposed: false,
    floorExposed: false,
    setpointC: 21,
    joistSpacing: 16,
    floorCover: "tile_stone",
    installMethod: "DRILLING",
    floorOnGround: false,
  };
}

/**
 * Backfills a stable, unique `id` on any room that lacks one (e.g. legacy
 * Firestore documents saved before `RoomInput.id` existed). Rooms are
 * identified and edited/removed strictly by `id` elsewhere in the app (see
 * ProjectPage.tsx/RoomCard.tsx) - without this, two rooms sharing the same
 * `name` (e.g. "BEDROOM" on two different floors) could silently shadow one
 * another once their id falls back to an empty string.
 */
export function ensureRoomIds(rooms: RoomInput[]): RoomInput[] {
  return rooms.map((room) => (room.id ? room : { ...room, id: uid() }));
}

export function createDraftProject({
  idPrefix,
  name = "",
  planImport,
  rooms = [],
}: {
  idPrefix?: string;
  name?: string;
  planImport?: PlanImportProjectMetadata;
  rooms?: RoomInput[];
} = {}): EditableProject {
  return {
    id: uid(idPrefix),
    status: "draft",
    createdAt: Date.now(),
    name,
    contractor: "",
    address: "",
    region: "UK",
    heatingSystem: DEFAULT_HEATING_SYSTEM,
    standardsMode: "BS_EN_12831",
    insulationPeriod: "y2001_2015",
    indoorTempC: 21,
    outdoorTempC: null,
    safetyFactorPct: 12.5,
    heatUpFactorPct: 27.5,
    psiAllowance_W_per_K: 0.04,
    mechVent_m3_per_h: 0.4,
    infiltrationACH: 0.25,
    glazing: "double",
    planImport,
    rooms,
    customUOverrides: getDefaultUValues({
      region: "UK",
      standardsMode: "BS_EN_12831",
      insulationPeriod: "y2001_2015",
    }),
  };
}
