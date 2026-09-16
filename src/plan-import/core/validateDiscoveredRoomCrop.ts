// Deterministic crop validation for Gemini-discovered rooms - mirrors validateRoomCrop's
// status semantics (ready/review/insufficient) but is adapted for Gemini-supplied
// bounding boxes/names instead of OCR RoomLabelCandidate text matching.
import type { DimensionCandidate } from "./dimensionCandidates";
import type { RoomCropMetadata } from "../browser/roomCrop";
import type { ValidatedDiscoveredRoom } from "./discoveredRoomValidation";

export interface DiscoveredRoomCropValidation {
  valid: boolean;
  status: "ready" | "review" | "insufficient";
  reasons: string[];
  boundingBoxInsideCrop: boolean;
  otherDiscoveredRoomsInCrop: number;
  dimensionCandidatesInCrop: number;
  cropWidth: number;
  cropHeight: number;
  paddingUsed: number;
}

function isInside(
  box: { x0: number; y0: number; x1: number; y1: number },
  crop: RoomCropMetadata["cropBoundingBox"],
): boolean {
  return box.x0 >= crop.x0 && box.y0 >= crop.y0 && box.x1 <= crop.x1 && box.y1 <= crop.y1;
}

function intersectsOrNear(
  box: { x0: number; y0: number; x1: number; y1: number },
  crop: RoomCropMetadata["cropBoundingBox"],
  margin: number,
): boolean {
  return box.x1 >= crop.x0 - margin
    && box.x0 <= crop.x1 + margin
    && box.y1 >= crop.y0 - margin
    && box.y0 <= crop.y1 + margin;
}

export function validateDiscoveredRoomCrop(input: {
  metadata: RoomCropMetadata;
  selectedRoom: ValidatedDiscoveredRoom;
  discoveredRooms: ValidatedDiscoveredRoom[];
  dimensionCandidates: DimensionCandidate[];
}): DiscoveredRoomCropValidation {
  const { metadata, selectedRoom, discoveredRooms, dimensionCandidates } = input;
  const crop = metadata.cropBoundingBox;
  const cropWidth = crop.x1 - crop.x0;
  const cropHeight = crop.y1 - crop.y0;
  const boundingBoxInsideCrop = isInside(selectedRoom.analysisBoundingBox, crop);
  const otherDiscoveredRoomsInCrop = discoveredRooms.filter(
    (room) => room !== selectedRoom && room.valid && !room.isDuplicate && isInside(room.analysisBoundingBox, crop),
  ).length;
  const dimensionCandidatesInCrop = dimensionCandidates.filter((candidate) =>
    intersectsOrNear(candidate.boundingBox, crop, Math.max(120, Math.round(metadata.padding * 0.25))),
  ).length;
  const boxWidth = selectedRoom.analysisBoundingBox.x1 - selectedRoom.analysisBoundingBox.x0;
  const boxHeight = selectedRoom.analysisBoundingBox.y1 - selectedRoom.analysisBoundingBox.y0;
  const sufficientContext = metadata.padding >= 300
    && cropWidth >= boxWidth + metadata.padding * 2
    && cropHeight >= boxHeight + metadata.padding * 2;

  const reasons: string[] = [...selectedRoom.validationReasons];
  reasons.push(boundingBoxInsideCrop
    ? "Gemini-discovered bounding box is fully inside the generated crop."
    : "Gemini-discovered bounding box is clipped or outside the generated crop.");
  reasons.push(otherDiscoveredRoomsInCrop > 0
    ? `${otherDiscoveredRoomsInCrop} other discovered room(s) are also inside the crop; review adjacent-room ambiguity.`
    : "No other discovered rooms overlap this crop.");
  reasons.push(dimensionCandidatesInCrop > 0
    ? `${dimensionCandidatesInCrop} dimension candidate(s) are inside or near the crop; preserved as evidence only.`
    : "No dimension candidate was found inside or near the crop.");
  reasons.push(sufficientContext
    ? "Crop padding provides surrounding context beyond the discovered bounding box."
    : "Crop padding or crop size is insufficient for reliable surrounding context.");
  if (selectedRoom.suspiciousPartialName) reasons.push("Room name failed the deterministic fragment/name-quality check.");

  const baseValid = selectedRoom.valid && boundingBoxInsideCrop && sufficientContext;
  const status: "ready" | "review" | "insufficient" = !baseValid
    ? "insufficient"
    : selectedRoom.reviewRequired || otherDiscoveredRoomsInCrop > 0 || dimensionCandidatesInCrop === 0
      ? "review"
      : "ready";

  return {
    valid: status !== "insufficient",
    status,
    reasons,
    boundingBoxInsideCrop,
    otherDiscoveredRoomsInCrop,
    dimensionCandidatesInCrop,
    cropWidth,
    cropHeight,
    paddingUsed: metadata.padding,
  };
}
