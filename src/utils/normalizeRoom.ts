import { Region, RoomInput } from "../models/projectTypes";
import {
  normalizeLength,
  normalizeArea,
  normalizeTemperature,
} from "./normalize";

export function normalizeRoomInput(room: RoomInput): RoomInput {
  return room;
}

