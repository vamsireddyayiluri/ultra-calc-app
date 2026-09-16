import type { DimensionCandidate } from "./dimensionCandidates";
import type { OcrObservationInput } from "./dimensionCandidates";
import type { RoomLabelCandidate } from "./roomLabels";
import type { RoomCropMetadata } from "../browser/roomCrop";

export interface RoomCropValidation {
  valid: boolean;
  status: "ready" | "review" | "insufficient";
  reasons: string[];
  selectedLabelInsideCrop: boolean;
  selectedLabelTextFound: boolean;
  otherRoomLabelsInCrop: number;
  dimensionCandidatesInCrop: number;
  cropWidth: number;
  cropHeight: number;
  paddingUsed: number;
}

function normalize(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, "").trim();
}

function center(box: { x0: number; y0: number; x1: number; y1: number }) {
  return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
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

export function validateRoomCrop(input: {
  metadata: RoomCropMetadata;
  selectedLabel: RoomLabelCandidate;
  roomLabels: RoomLabelCandidate[];
  ocrObservations: OcrObservationInput[];
  dimensionCandidates: DimensionCandidate[];
}): RoomCropValidation {
  const { metadata, selectedLabel, roomLabels, ocrObservations, dimensionCandidates } = input;
  const crop = metadata.cropBoundingBox;
  const cropWidth = crop.x1 - crop.x0;
  const cropHeight = crop.y1 - crop.y0;
  const selectedLabelInsideCrop = isInside(selectedLabel.boundingBox, crop);
  const selectedTokens = normalize(selectedLabel.text).match(/[A-Z]+|\d+/g) ?? [];
  const cropObservations = ocrObservations.filter((observation) => isInside(observation.bbox, crop));
  const cropTokens = cropObservations.map((observation) => normalize(observation.text));
  const selectedLabelTextFound = selectedTokens.length > 0 && selectedTokens.every((token) => cropTokens.includes(token));
  const otherRoomLabelsInCrop = roomLabels.filter(
    (label) => label !== selectedLabel && isInside(label.boundingBox, crop),
  ).length;
  const dimensionCandidatesInCrop = dimensionCandidates.filter((candidate) =>
    intersectsOrNear(candidate.boundingBox, crop, Math.max(120, Math.round(metadata.padding * 0.25))),
  ).length;
  const labelWidth = selectedLabel.boundingBox.x1 - selectedLabel.boundingBox.x0;
  const labelHeight = selectedLabel.boundingBox.y1 - selectedLabel.boundingBox.y0;
  const sufficientContext = metadata.padding >= 300
    && cropWidth >= labelWidth + metadata.padding * 2
    && cropHeight >= labelHeight + metadata.padding * 2;
  const reasons: string[] = [];

  if (selectedLabelInsideCrop) reasons.push("Selected room label is fully inside the crop.");
  else reasons.push("Selected room label is clipped or outside the crop.");
  if (selectedLabelTextFound) reasons.push("Selected room label tokens are present in the OCR observations inside the crop.");
  else reasons.push("Selected room label text was not fully confirmed inside the crop.");
  if (otherRoomLabelsInCrop > 0) reasons.push(`${otherRoomLabelsInCrop} other room-label candidate(s) are also inside the crop; review adjacent-room ambiguity.`);
  if (dimensionCandidatesInCrop > 0) reasons.push(`${dimensionCandidatesInCrop} dimension candidate(s) are inside or near the crop; they are preserved as evidence only.`);
  else reasons.push("No dimension candidate was found inside or near the crop.");
  if (sufficientContext) reasons.push("Crop padding provides surrounding context beyond the selected label.");
  else reasons.push("Crop padding or crop size is insufficient for reliable surrounding context.");

  const baseValid = selectedLabelInsideCrop && selectedLabelTextFound && sufficientContext;
  const status = !baseValid
    ? "insufficient"
    : otherRoomLabelsInCrop > 0 || dimensionCandidatesInCrop === 0
      ? "review"
      : "ready";

  return {
    valid: status !== "insufficient",
    status,
    reasons,
    selectedLabelInsideCrop,
    selectedLabelTextFound,
    otherRoomLabelsInCrop,
    dimensionCandidatesInCrop,
    cropWidth,
    cropHeight,
    paddingUsed: metadata.padding,
  };
}
