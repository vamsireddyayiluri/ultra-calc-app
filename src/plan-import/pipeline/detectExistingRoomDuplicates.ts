import type { RoomInput } from "../../models/projectTypes";
import type { ConvertedV2RoomInput } from "./convertV2ReviewToRoomInput";

export interface AppendRoomCandidate {
  convertedRoom: ConvertedV2RoomInput;
  matchedExistingRoomId: string | null;
  matchedExistingRoomName: string | null;
}

/** Lowercase, strip punctuation, collapse whitespace - name comparison only, never dimensions. */
export function normalizeRoomName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Flags rooms whose normalized name exactly matches an existing project room -
 * a hint for the reviewer, never an automatic merge. Matching room names alone
 * must never cause rooms to be combined without a human decision (see
 * AppendRoomsReviewCard, which always defaults every candidate to "add").
 */
export function detectExistingRoomDuplicates(
  convertedRooms: ConvertedV2RoomInput[],
  existingRooms: RoomInput[],
): AppendRoomCandidate[] {
  const existingByNormalizedName = new Map<string, RoomInput>();
  for (const room of existingRooms) {
    const key = normalizeRoomName(room.name);
    if (key && !existingByNormalizedName.has(key)) {
      existingByNormalizedName.set(key, room);
    }
  }

  return convertedRooms.map((convertedRoom) => {
    const key = normalizeRoomName(convertedRoom.roomInput.name);
    const match = key ? existingByNormalizedName.get(key) ?? null : null;
    return {
      convertedRoom,
      matchedExistingRoomId: match?.id ?? null,
      matchedExistingRoomName: match?.name ?? null,
    };
  });
}
