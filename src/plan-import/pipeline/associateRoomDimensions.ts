// Deterministic room-dimension association: attaches nearby OCR dimension candidates
// to each FinalRoomCandidate. No AI calls, no RoomInput/geometry/calculations - only
// ranking and evidence preservation over data already produced upstream.
import type { BrowserDimensionCandidate } from "../core/planAnalysis";
import type { FinalRoomBoundingBox, FinalRoomCandidate } from "./mergeRoomCandidates";

export type DimensionRelation = "inside" | "overlapping" | "near";
export type DimensionOrientation = "horizontal" | "vertical" | "unknown";

export interface RoomDimensionEvidence {
  candidate: BrowserDimensionCandidate;
  orientation: DimensionOrientation;
  relation: DimensionRelation;
  distance: number;
  score: number;
  reasons: string[];
}

export interface RoomDimensionAssociationResult {
  roomId: string;
  pageNumber: number;
  primaryHorizontal: RoomDimensionEvidence | null;
  primaryVertical: RoomDimensionEvidence | null;
  additionalDimensions: RoomDimensionEvidence[];
  reviewRequired: boolean;
  reviewReasons: string[];
  summary: {
    totalConsidered: number;
    inside: number;
    overlapping: number;
    near: number;
  };
}

export type FinalRoomCandidateWithDimensions = FinalRoomCandidate & {
  dimensionAssociation: RoomDimensionAssociationResult;
};

function isInside(box: FinalRoomBoundingBox, container: FinalRoomBoundingBox): boolean {
  return box.x0 >= container.x0 && box.y0 >= container.y0 && box.x1 <= container.x1 && box.y1 <= container.y1;
}

function intersects(a: FinalRoomBoundingBox, b: FinalRoomBoundingBox): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

// Shortest gap between two axis-aligned rectangles; 0 when they touch/intersect.
function distanceBetweenBoxes(a: FinalRoomBoundingBox, b: FinalRoomBoundingBox): number {
  const dx = Math.max(b.x0 - a.x1, a.x0 - b.x1, 0);
  const dy = Math.max(b.y0 - a.y1, a.y0 - b.y1, 0);
  return Math.hypot(dx, dy);
}

function classifyRelation(box: FinalRoomBoundingBox, room: FinalRoomBoundingBox): DimensionRelation {
  if (isInside(box, room)) return "inside";
  if (intersects(box, room)) return "overlapping";
  return "near";
}

// Reuses the horizontal/vertical wall-line evidence already computed during spatial
// dimension analysis (see core/spatialDimensionContext.ts) rather than re-deriving it.
function orientationFor(candidate: BrowserDimensionCandidate): DimensionOrientation {
  const { horizontalLineScore, verticalLineScore } = candidate.spatialEvidence;
  if (horizontalLineScore === verticalLineScore) return "unknown";
  return horizontalLineScore > verticalLineScore ? "horizontal" : "vertical";
}

const RELATION_SCORE: Record<DimensionRelation, number> = { inside: 100, overlapping: 70, near: 40 };
const CLASSIFICATION_SCORE: Record<BrowserDimensionCandidate["classification"], number> = {
  high: 20,
  medium: 10,
  uncertain: 0,
  rejected: -40,
};

function scoreCandidate(candidate: BrowserDimensionCandidate, relation: DimensionRelation, distance: number): number {
  const distancePenalty = Math.min(30, distance / 20);
  return RELATION_SCORE[relation] + CLASSIFICATION_SCORE[candidate.classification] + candidate.confidence * 0.3 - distancePenalty;
}

function buildReasons(
  candidate: BrowserDimensionCandidate,
  relation: DimensionRelation,
  orientation: DimensionOrientation,
  distance: number,
): string[] {
  const reasons: string[] = [];
  reasons.push(relation === "near"
    ? `Dimension "${candidate.originalText}" is near the room boundary (${Math.round(distance)}px away).`
    : `Dimension "${candidate.originalText}" is ${relation} the room boundary.`);
  reasons.push(orientation === "unknown"
    ? "Orientation could not be determined from nearby wall-line evidence."
    : `Classified as ${orientation} using nearby wall-line evidence (horizontal score ${candidate.spatialEvidence.horizontalLineScore}, vertical score ${candidate.spatialEvidence.verticalLineScore}).`);
  reasons.push(`OCR classification: ${candidate.classification} (confidence ${candidate.confidence}%).`);
  return reasons;
}

const AMBIGUOUS_SCORE_GAP = 10;

export function associateRoomDimensions(room: FinalRoomCandidate): RoomDimensionAssociationResult {
  const reviewReasons: string[] = [];
  let reviewRequired = false;

  if (room.reviewStatus !== "ok") {
    reviewRequired = true;
    reviewReasons.push(`Room identity is flagged (${room.reviewStatus}); dimension association inherits this uncertainty.`);
  }

  const evaluated: RoomDimensionEvidence[] = room.nearbyDimensionCandidates.map((candidate) => {
    const relation = classifyRelation(candidate.boundingBox, room.roomBoundingBox);
    const distance = relation === "near" ? distanceBetweenBoxes(candidate.boundingBox, room.roomBoundingBox) : 0;
    const orientation = orientationFor(candidate);
    const score = scoreCandidate(candidate, relation, distance);
    return { candidate, orientation, relation, distance, score, reasons: buildReasons(candidate, relation, orientation, distance) };
  });

  const horizontalCandidates = evaluated.filter((entry) => entry.orientation === "horizontal").sort((a, b) => b.score - a.score);
  const verticalCandidates = evaluated.filter((entry) => entry.orientation === "vertical").sort((a, b) => b.score - a.score);

  const primaryHorizontal = horizontalCandidates[0] ?? null;
  const primaryVertical = verticalCandidates[0] ?? null;

  if (!primaryHorizontal) {
    reviewRequired = true;
    reviewReasons.push("No horizontal dimension candidate was found inside, overlapping, or near this room.");
  }
  if (!primaryVertical) {
    reviewRequired = true;
    reviewReasons.push("No vertical dimension candidate was found inside, overlapping, or near this room.");
  }
  if (horizontalCandidates.length >= 2 && horizontalCandidates[0].score - horizontalCandidates[1].score < AMBIGUOUS_SCORE_GAP) {
    reviewRequired = true;
    reviewReasons.push(
      `Ambiguous primary horizontal dimension: "${horizontalCandidates[0].candidate.originalText}" and "${horizontalCandidates[1].candidate.originalText}" have similar evidence scores.`,
    );
  }
  if (verticalCandidates.length >= 2 && verticalCandidates[0].score - verticalCandidates[1].score < AMBIGUOUS_SCORE_GAP) {
    reviewRequired = true;
    reviewReasons.push(
      `Ambiguous primary vertical dimension: "${verticalCandidates[0].candidate.originalText}" and "${verticalCandidates[1].candidate.originalText}" have similar evidence scores.`,
    );
  }
  if (evaluated.length === 0) {
    reviewRequired = true;
    reviewReasons.push("No dimension candidates were found inside, overlapping, or near this room; size cannot be determined automatically.");
  }

  // Every remaining candidate (including orientation-unknown and rejected-classification
  // ones) is preserved here rather than discarded, per the no-silent-discard requirement.
  const additionalDimensions = evaluated
    .filter((entry) => entry !== primaryHorizontal && entry !== primaryVertical)
    .sort((a, b) => b.score - a.score);

  return {
    roomId: room.id,
    pageNumber: room.pageNumber,
    primaryHorizontal,
    primaryVertical,
    additionalDimensions,
    reviewRequired,
    reviewReasons,
    summary: {
      totalConsidered: evaluated.length,
      inside: evaluated.filter((entry) => entry.relation === "inside").length,
      overlapping: evaluated.filter((entry) => entry.relation === "overlapping").length,
      near: evaluated.filter((entry) => entry.relation === "near").length,
    },
  };
}
