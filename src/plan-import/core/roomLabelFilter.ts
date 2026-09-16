// Deterministic, browser-only filtering/deduplication for room label candidates.
// Runs after OCR-based room-label detection and before crops are treated as final
// candidates. Uses only evidence already produced by OCR/spatial analysis (text
// shape, confidence, bounding boxes, nearby dimensions/observations) - no AI calls
// and no hardcoded exhaustive room-name list as the detection mechanism.
import type { OcrObservationInput, DimensionCandidate } from "./dimensionCandidates";
import type { RoomLabelCandidate } from "./roomLabels";

export type RoomCandidateClassification = "likelyRoom" | "possibleRoom" | "rejected";

export interface RoomLabelFilterEvaluation {
  candidateId: string;
  label: RoomLabelCandidate;
  pageNumber: number;
  normalizedText: string;
  wordCount: number;
  charCount: number;
  score: number;
  classification: RoomCandidateClassification;
  reasons: string[];
  isDuplicate: boolean;
  duplicateOfIndex: number | null;
  nearbyDimensionCandidateCount: number;
  nearbyOcrObservationCount: number;
}

export interface FilterRoomLabelCandidatesInput {
  pageNumber: number;
  roomLabels: RoomLabelCandidate[];
  ocrObservations: OcrObservationInput[];
  dimensionCandidates: DimensionCandidate[];
}

export interface FilterRoomLabelCandidatesResult {
  pageNumber: number;
  evaluations: RoomLabelFilterEvaluation[];
  summary: {
    total: number;
    likelyRoom: number;
    possibleRoom: number;
    rejected: number;
    duplicatesRemoved: number;
  };
}

type BoundingBox = OcrObservationInput["bbox"];

// Generic construction/spec/note vocabulary used only as a negative signal alongside
// other structural evidence - not an allow-list and not the primary detection method.
const NOTE_KEYWORDS = new Set([
  "NOTE", "NOTES", "TYP", "TYPICAL", "SEE", "SHEET", "DETAIL", "DETAILS", "SPEC",
  "SPECIFICATION", "SPECIFICATIONS", "PROVIDE", "INSTALL", "VERIFY", "CONTRACTOR",
  "SHALL", "REQUIRED", "REQUIREMENTS", "GENERAL", "SCALE", "DRAWING", "DRAWINGS",
  "REFER", "APPROVED", "REVISION", "REVISIONS", "SECTION", "SCHEDULE",
  "MANUFACTURER", "EQUAL", "UNLESS", "OTHERWISE", "PER", "CODE", "CODES", "ITEM",
  "EXISTING", "REMOVE", "REPLACE", "CONFIRM", "COORDINATE", "APPLICABLE",
  "COMPLY", "COMPLIANCE", "PRIOR", "FIELD", "ENGINEER", "STRUCTURAL", "OWNER",
]);

const SENTENCE_PUNCTUATION = /[.,;:!?]/g;

function normalizeText(text: string): string {
  return text.toUpperCase().replace(/\s+/g, " ").trim();
}

function normalizeAlnum(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, "").trim();
}

function tokenize(text: string): string[] {
  return normalizeText(text).split(" ").filter(Boolean);
}

function center(box: BoundingBox) {
  return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
}

function boxDiagonal(box: BoundingBox): number {
  return Math.hypot(box.x1 - box.x0, box.y1 - box.y0);
}

function distanceBetween(a: BoundingBox, b: BoundingBox): number {
  const ca = center(a);
  const cb = center(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
}

function intersects(a: BoundingBox, b: BoundingBox): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

function isInsideOrNear(box: BoundingBox, target: BoundingBox, margin: number): boolean {
  return box.x1 >= target.x0 - margin
    && box.x0 <= target.x1 + margin
    && box.y1 >= target.y0 - margin
    && box.y0 <= target.y1 + margin;
}

function countNearbyDimensionCandidates(
  label: RoomLabelCandidate,
  dimensionCandidates: DimensionCandidate[],
  radius: number,
): number {
  return dimensionCandidates.filter((candidate) =>
    isInsideOrNear(candidate.boundingBox, label.boundingBox, radius),
  ).length;
}

// Counts OCR words near the label that are not part of the label's own text, used
// as a signal for "isolated short label" (room name) vs. "dense running text" (note).
function countNearbyOcrObservations(
  label: RoomLabelCandidate,
  ocrObservations: OcrObservationInput[],
  radius: number,
): number {
  return ocrObservations.filter((observation) => {
    if (isInsideOrNear(observation.bbox, label.boundingBox, 2)) return false; // part of the label itself
    return isInsideOrNear(observation.bbox, label.boundingBox, radius);
  }).length;
}

function evaluateLabel(
  label: RoomLabelCandidate,
  pageNumber: number,
  ocrObservations: OcrObservationInput[],
  dimensionCandidates: DimensionCandidate[],
): Omit<RoomLabelFilterEvaluation, "candidateId" | "isDuplicate" | "duplicateOfIndex"> {
  const normalizedText = normalizeText(label.text);
  const tokens = tokenize(label.text);
  const wordCount = tokens.length;
  const charCount = normalizedText.length;
  const reasons: string[] = [];
  let score = label.classification === "likely" ? 55 : 35;
  reasons.push(
    label.classification === "likely"
      ? "Base score from OCR line detection: compact word group containing a recognized room-type term."
      : "Base score from OCR line detection: room-type term matched but with limited grouping confidence.",
  );

  // OCR confidence.
  if (label.confidence >= 70) {
    score += 15;
    reasons.push(`OCR confidence is high (${label.confidence}%).`);
  } else if (label.confidence >= 45) {
    reasons.push(`OCR confidence is moderate (${label.confidence}%).`);
  } else {
    score -= 20;
    reasons.push(`OCR confidence is low (${label.confidence}%), consistent with an incomplete OCR fragment.`);
  }

  // Word count / label length.
  if (wordCount <= 2) {
    score += 20;
    reasons.push(`Short label (${wordCount} word(s)) is consistent with a room name.`);
  } else if (wordCount === 3) {
    score += 5;
    reasons.push(`Label has ${wordCount} words, still within typical room-name length.`);
  } else if (wordCount === 4) {
    score -= 15;
    reasons.push(`Label has ${wordCount} words, longer than a typical room name.`);
  } else {
    score -= 45;
    reasons.push(`Label has ${wordCount} words, resembling a sentence or descriptive note rather than a room name.`);
  }

  if (charCount > 40) {
    score -= 25;
    reasons.push(`Label text is ${charCount} characters long, typical of descriptive or specification text.`);
  } else if (charCount > 25) {
    score -= 10;
    reasons.push(`Label text is ${charCount} characters long, longer than most room names.`);
  }

  // Sentence-style punctuation (periods, commas, colons, etc. - parentheses/hyphens/apostrophes allowed).
  const punctuationMatches = normalizedText.match(SENTENCE_PUNCTUATION) ?? [];
  if (punctuationMatches.length >= 2) {
    score -= 30;
    reasons.push(`Label contains ${punctuationMatches.length} sentence-style punctuation marks, indicating descriptive text.`);
  } else if (punctuationMatches.length === 1) {
    score -= 10;
    reasons.push("Label contains sentence-style punctuation, uncommon in room names.");
  }

  // Construction/spec/note keyword hits (negative signal only, not primary detection).
  const noteKeywordHits = tokens.filter((token) => NOTE_KEYWORDS.has(normalizeAlnum(token)));
  if (noteKeywordHits.length > 0) {
    score -= 35;
    reasons.push(`Label contains construction/specification wording (${Array.from(new Set(noteKeywordHits)).join(", ")}).`);
  }

  // Incomplete-fragment heuristic: single very short alphabetic token with no room term.
  if (wordCount === 1 && tokens[0].length <= 2) {
    score -= 20;
    reasons.push("Label is a single very short token, consistent with an incomplete OCR fragment.");
  }

  // Nearby dimension evidence (small positive signal; rooms are often dimensioned nearby).
  const margin = Math.max(150, Math.round(boxDiagonal(label.boundingBox)));
  const nearbyDimensionCandidateCount = countNearbyDimensionCandidates(label, dimensionCandidates, margin);
  if (nearbyDimensionCandidateCount > 0) {
    score += 5;
    reasons.push(`${nearbyDimensionCandidateCount} nearby dimension candidate(s) support this as a room area.`);
  } else {
    reasons.push("No nearby dimension candidates were found.");
  }

  // Nearby OCR density: a label surrounded by many other words nearby suggests running text.
  const nearbyOcrObservationCount = countNearbyOcrObservations(label, ocrObservations, Math.max(80, margin * 0.4));
  if (nearbyOcrObservationCount >= 15) {
    score -= 15;
    reasons.push(`${nearbyOcrObservationCount} OCR word(s) found immediately around this label, consistent with a dense paragraph of text rather than an isolated room label.`);
  }

  score = Math.max(0, Math.min(100, score));
  const classification: RoomCandidateClassification = score >= 65 ? "likelyRoom" : score >= 40 ? "possibleRoom" : "rejected";

  return {
    label,
    pageNumber,
    normalizedText,
    wordCount,
    charCount,
    score,
    classification,
    reasons,
    nearbyDimensionCandidateCount,
    nearbyOcrObservationCount,
  };
}

// Two labels are treated as duplicates when their normalized text matches (or one
// fully contains the other) and their bounding boxes overlap or sit very close together.
function areDuplicates(a: RoomLabelFilterEvaluation, b: RoomLabelFilterEvaluation): boolean {
  const normA = normalizeAlnum(a.label.text);
  const normB = normalizeAlnum(b.label.text);
  if (!normA || !normB) return false;
  const sameOrContained = normA === normB || normA.includes(normB) || normB.includes(normA);
  if (!sameOrContained) return false;

  const boxA = a.label.boundingBox;
  const boxB = b.label.boundingBox;
  if (intersects(boxA, boxB)) return true;

  const proximityRadius = Math.max(boxDiagonal(boxA), boxDiagonal(boxB));
  return distanceBetween(boxA, boxB) <= proximityRadius;
}

export function filterRoomLabelCandidates(
  input: FilterRoomLabelCandidatesInput,
): FilterRoomLabelCandidatesResult {
  const { pageNumber, roomLabels, ocrObservations, dimensionCandidates } = input;

  const evaluations: RoomLabelFilterEvaluation[] = roomLabels.map((label, index) => ({
    candidateId: `page${pageNumber}-label${index}`,
    ...evaluateLabel(label, pageNumber, ocrObservations, dimensionCandidates),
    isDuplicate: false,
    duplicateOfIndex: null,
  }));

  // Duplicate detection: for each cluster of mutually-duplicate labels, keep the
  // strongest (highest score, tie-broken by OCR confidence) and mark the rest.
  const resolved = new Array(evaluations.length).fill(false);
  for (let i = 0; i < evaluations.length; i += 1) {
    if (resolved[i]) continue;
    const clusterIndices = [i];
    for (let j = i + 1; j < evaluations.length; j += 1) {
      if (resolved[j]) continue;
      if (areDuplicates(evaluations[i], evaluations[j])) clusterIndices.push(j);
    }
    clusterIndices.forEach((index) => { resolved[index] = true; });
    if (clusterIndices.length <= 1) continue;

    const strongestIndex = clusterIndices.reduce((bestIndex, candidateIndex) => {
      const best = evaluations[bestIndex];
      const candidate = evaluations[candidateIndex];
      if (candidate.score !== best.score) return candidate.score > best.score ? candidateIndex : bestIndex;
      return candidate.label.confidence > best.label.confidence ? candidateIndex : bestIndex;
    }, clusterIndices[0]);

    for (const index of clusterIndices) {
      if (index === strongestIndex) continue;
      evaluations[index].isDuplicate = true;
      evaluations[index].duplicateOfIndex = strongestIndex;
      evaluations[index].reasons.push(
        `Duplicate of "${evaluations[strongestIndex].label.text}" detected at an overlapping or nearby location on this page; stronger candidate retained.`,
      );
    }
  }

  const summary = {
    total: evaluations.length,
    likelyRoom: evaluations.filter((evaluation) => evaluation.classification === "likelyRoom" && !evaluation.isDuplicate).length,
    possibleRoom: evaluations.filter((evaluation) => evaluation.classification === "possibleRoom" && !evaluation.isDuplicate).length,
    rejected: evaluations.filter((evaluation) => evaluation.classification === "rejected").length,
    duplicatesRemoved: evaluations.filter((evaluation) => evaluation.isDuplicate).length,
  };

  return { pageNumber, evaluations, summary };
}
