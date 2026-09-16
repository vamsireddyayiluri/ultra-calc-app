import type { DimensionCandidate } from "./dimensionCandidates";
import type { RoomLabelCandidate } from "./roomLabels";

export interface DimensionSpatialEvidence {
  horizontalLineScore: number;
  verticalLineScore: number;
  nearbyDimensionCandidateCount: number;
  nearbyRoomLabelCount: number;
  nearestRoomLabelDistance: number | null;
  reason: string;
}

export type SpatialDimensionCandidate = DimensionCandidate & {
  spatialEvidence: DimensionSpatialEvidence;
  preSpatialClassification: DimensionCandidate["classification"];
};

function center(box: { x0: number; y0: number; x1: number; y1: number }) {
  return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
}

function distanceBetween(
  first: { x0: number; y0: number; x1: number; y1: number },
  second: { x0: number; y0: number; x1: number; y1: number },
): number {
  const firstCenter = center(first);
  const secondCenter = center(second);
  return Math.hypot(firstCenter.x - secondCenter.x, firstCenter.y - secondCenter.y);
}

function scanLineEvidence(
  canvas: HTMLCanvasElement,
  box: DimensionCandidate["boundingBox"],
): { horizontal: number; vertical: number } {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return { horizontal: 0, vertical: 0 };

  const padding = 120;
  const left = Math.max(0, Math.floor(box.x0 - padding));
  const top = Math.max(0, Math.floor(box.y0 - padding));
  const right = Math.min(canvas.width - 1, Math.ceil(box.x1 + padding));
  const bottom = Math.min(canvas.height - 1, Math.ceil(box.y1 + padding));
  const width = right - left + 1;
  const height = bottom - top + 1;
  if (width <= 0 || height <= 0) return { horizontal: 0, vertical: 0 };

  const pixels = context.getImageData(left, top, width, height).data;
  const dark = (x: number, y: number) => {
    const index = (y * width + x) * 4;
    return pixels[index] < 110 && pixels[index + 1] < 110 && pixels[index + 2] < 110;
  };

  let longestHorizontal = 0;
  for (let y = 0; y < height; y += 1) {
    let run = 0;
    for (let x = 0; x < width; x += 1) {
      run = dark(x, y) ? run + 1 : 0;
      longestHorizontal = Math.max(longestHorizontal, run);
    }
  }

  let longestVertical = 0;
  for (let x = 0; x < width; x += 1) {
    let run = 0;
    for (let y = 0; y < height; y += 1) {
      run = dark(x, y) ? run + 1 : 0;
      longestVertical = Math.max(longestVertical, run);
    }
  }

  return {
    horizontal: longestHorizontal / Math.max(1, box.x1 - box.x0),
    vertical: longestVertical / Math.max(1, box.y1 - box.y0),
  };
}

export function applySpatialDimensionContext(
  canvas: HTMLCanvasElement | null,
  candidates: DimensionCandidate[],
  roomLabels: RoomLabelCandidate[],
): SpatialDimensionCandidate[] {
  return candidates.map((candidate) => {
    const nearbyDistances = roomLabels
      .map((label) => distanceBetween(candidate.boundingBox, label.boundingBox))
      .filter((distance) => distance <= 1000)
      .sort((a, b) => a - b);
    const nearbyDimensionCandidateCount = candidates.filter(
      (other) => other !== candidate && distanceBetween(candidate.boundingBox, other.boundingBox) <= 700,
    ).length;
    const lineEvidence = canvas ? scanLineEvidence(canvas, candidate.boundingBox) : { horizontal: 0, vertical: 0 };
    const hasLineEvidence = lineEvidence.horizontal >= 1.5 || lineEvidence.vertical >= 1.5;
    const hasNearbyStructure = nearbyDistances.length > 0 || nearbyDimensionCandidateCount > 0;
    const hasExplicitMarks = Boolean(candidate.normalizedText?.includes("'") && candidate.normalizedText.includes('"'));
    let classification = candidate.classification;

    if (candidate.classification !== "rejected" && candidate.normalizedText && hasLineEvidence && hasNearbyStructure) {
      if (hasExplicitMarks && candidate.confidence >= 75) classification = "high";
      else if (candidate.confidence >= 60) classification = "medium";
    }

    const reason = hasLineEvidence && hasNearbyStructure
      ? "Nearby dark line evidence and nearby OCR structure support this dimension interpretation; no room association was made."
      : candidate.reason;

    return {
      ...candidate,
      preSpatialClassification: candidate.classification,
      classification,
      spatialEvidence: {
        horizontalLineScore: Number(lineEvidence.horizontal.toFixed(2)),
        verticalLineScore: Number(lineEvidence.vertical.toFixed(2)),
        nearbyDimensionCandidateCount,
        nearbyRoomLabelCount: nearbyDistances.length,
        nearestRoomLabelDistance: nearbyDistances[0] === undefined ? null : Number(nearbyDistances[0].toFixed(1)),
        reason,
      },
      reason,
    };
  });
}
