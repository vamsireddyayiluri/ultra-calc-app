// Deterministic validation/deduplication layer for Gemini page-level room discovery.
// Runs after discoverPageRooms and before crops are generated from Gemini bounding
// boxes. No AI calls here - only structural checks on already-returned data.
import type { AiDiscoveredRoom } from "../ai/contracts";
import {
  convertGeminiBoundingBoxToAnalysisSpace,
  type AnalysisBoundingBox,
  type ImageDimensions,
} from "./discoveredRoomGeometry";

export interface ValidatedDiscoveredRoom {
  id: string;
  pageNumber: number;
  rawName: string;
  normalizedName: string;
  nameKey: string;
  confidence: number;
  geminiBoundingBox: AiDiscoveredRoom["boundingBox"];
  geminiImageDimensions: ImageDimensions;
  analysisImageDimensions: ImageDimensions;
  analysisBoundingBox: AnalysisBoundingBox;
  scaleX: number;
  scaleY: number;
  evidence: string[];
  reviewRequired: boolean;
  suspiciousPartialName: boolean;
  valid: boolean;
  validationReasons: string[];
  isDuplicate: boolean;
  duplicateOfId: string | null;
}

export interface ValidateDiscoveredRoomsInput {
  pageNumber: number;
  rooms: AiDiscoveredRoom[];
  geminiImageDimensions: ImageDimensions;
  analysisImageDimensions: ImageDimensions;
}

export interface ValidateDiscoveredRoomsResult {
  pageNumber: number;
  rooms: ValidatedDiscoveredRoom[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    suspicious: number;
    duplicatesRemoved: number;
  };
}

function normalizeDiscoveredRoomName(name: string): string {
  return name.replace(/\s+/g, " ").trim();
}

function nameKeyFor(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "").trim();
}

// Deterministic backstop for fragment-like names Gemini should not have returned
// (e.g. "THROOM", "E BATHROOM", "|BaTHROOM"). Structural heuristics only - no room
// name whitelist.
function assessSuspiciousName(name: string): { suspicious: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const trimmed = name.trim();

  if (/^[^A-Za-z]/.test(trimmed)) {
    reasons.push(`Name "${name}" starts with a non-letter character, consistent with an OCR-fragment artifact.`);
  }
  if (/^[A-Z]\s+[A-Za-z]/.test(trimmed) && trimmed.length > 2) {
    reasons.push(`Name "${name}" starts with a single leading letter followed by a space, consistent with a truncated qualifier (e.g. "E BATHROOM").`);
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  const hasIrregularCasing = words.some((word) => {
    if (!/[A-Za-z]/.test(word)) return false;
    return !/^[A-Z]+$/.test(word) && !/^[a-z]+$/.test(word) && !/^[A-Z][a-z]*$/.test(word);
  });
  if (hasIrregularCasing) {
    reasons.push(`Name "${name}" has irregular letter casing, consistent with a garbled OCR fragment.`);
  }

  if (nameKeyFor(trimmed).length <= 2) {
    reasons.push(`Name "${name}" is very short after normalization, consistent with an incomplete fragment.`);
  }

  return { suspicious: reasons.length > 0, reasons };
}

function boundingBoxArea(box: AnalysisBoundingBox): number {
  return Math.max(0, box.x1 - box.x0) * Math.max(0, box.y1 - box.y0);
}

function intersectionArea(a: AnalysisBoundingBox, b: AnalysisBoundingBox): number {
  const width = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0);
  const height = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
  return width > 0 && height > 0 ? width * height : 0;
}

function intersectionOverUnion(a: AnalysisBoundingBox, b: AnalysisBoundingBox): number {
  const intersection = intersectionArea(a, b);
  if (intersection <= 0) return 0;
  const union = boundingBoxArea(a) + boundingBoxArea(b) - intersection;
  return union > 0 ? intersection / union : 0;
}

const DUPLICATE_IOU_THRESHOLD = 0.35;

export function validateDiscoveredRooms(
  input: ValidateDiscoveredRoomsInput,
): ValidateDiscoveredRoomsResult {
  const { pageNumber, rooms, geminiImageDimensions, analysisImageDimensions } = input;

  const evaluated: ValidatedDiscoveredRoom[] = rooms.map((room, index) => {
    const validationReasons: string[] = [];
    const normalizedName = normalizeDiscoveredRoomName(room.name);
    const nameKey = nameKeyFor(normalizedName);
    const { analysisBoundingBox, scaleX, scaleY } = convertGeminiBoundingBoxToAnalysisSpace(
      room.boundingBox,
      geminiImageDimensions,
      analysisImageDimensions,
    );

    const positiveSize = room.boundingBox.width > 0 && room.boundingBox.height > 0;
    if (!positiveSize) validationReasons.push("Gemini bounding box width/height is not positive.");

    const clamped: AnalysisBoundingBox = {
      x0: Math.min(Math.max(analysisBoundingBox.x0, 0), analysisImageDimensions.width),
      y0: Math.min(Math.max(analysisBoundingBox.y0, 0), analysisImageDimensions.height),
      x1: Math.min(Math.max(analysisBoundingBox.x1, 0), analysisImageDimensions.width),
      y1: Math.min(Math.max(analysisBoundingBox.y1, 0), analysisImageDimensions.height),
    };
    const insidePage = analysisBoundingBox.x0 >= -1
      && analysisBoundingBox.y0 >= -1
      && analysisBoundingBox.x1 <= analysisImageDimensions.width + 1
      && analysisBoundingBox.y1 <= analysisImageDimensions.height + 1;
    if (!insidePage) validationReasons.push("Bounding box extends outside the page and was clamped to page bounds.");

    const nameKeyEmpty = nameKey.length === 0;
    if (nameKeyEmpty) validationReasons.push("Room name is empty after normalization.");

    const { suspicious, reasons: suspiciousReasons } = assessSuspiciousName(normalizedName);
    validationReasons.push(...suspiciousReasons);

    const valid = positiveSize && !nameKeyEmpty && boundingBoxArea(clamped) > 0;

    return {
      id: `page${pageNumber}-discovered${index}`,
      pageNumber,
      rawName: room.name,
      normalizedName,
      nameKey,
      confidence: room.confidence,
      geminiBoundingBox: room.boundingBox,
      geminiImageDimensions,
      analysisImageDimensions,
      analysisBoundingBox: clamped,
      scaleX,
      scaleY,
      evidence: room.evidence,
      reviewRequired: room.reviewRequired || suspicious || !valid,
      suspiciousPartialName: suspicious,
      valid,
      validationReasons,
      isDuplicate: false,
      duplicateOfId: null,
    };
  });

  // Duplicate/overlap detection: same normalized name or overlapping bounding boxes
  // on the same page. Keep the strongest (valid > invalid, then higher confidence).
  const resolved = new Array(evaluated.length).fill(false);
  for (let i = 0; i < evaluated.length; i += 1) {
    if (resolved[i]) continue;
    const cluster = [i];
    for (let j = i + 1; j < evaluated.length; j += 1) {
      if (resolved[j]) continue;
      const sameName = evaluated[i].nameKey.length > 0 && evaluated[i].nameKey === evaluated[j].nameKey;
      const overlapping = intersectionOverUnion(evaluated[i].analysisBoundingBox, evaluated[j].analysisBoundingBox) >= DUPLICATE_IOU_THRESHOLD;
      if (sameName || overlapping) cluster.push(j);
    }
    cluster.forEach((index) => { resolved[index] = true; });
    if (cluster.length <= 1) continue;

    const strongestIndex = cluster.reduce((bestIndex, candidateIndex) => {
      const best = evaluated[bestIndex];
      const candidate = evaluated[candidateIndex];
      if (candidate.valid !== best.valid) return candidate.valid ? candidateIndex : bestIndex;
      return candidate.confidence > best.confidence ? candidateIndex : bestIndex;
    }, cluster[0]);

    for (const index of cluster) {
      if (index === strongestIndex) continue;
      evaluated[index].isDuplicate = true;
      evaluated[index].duplicateOfId = evaluated[strongestIndex].id;
      evaluated[index].validationReasons.push(
        `Duplicate of "${evaluated[strongestIndex].normalizedName}" (same name or overlapping location); stronger candidate retained.`,
      );
    }
  }

  const summary = {
    total: evaluated.length,
    valid: evaluated.filter((room) => room.valid && !room.isDuplicate).length,
    invalid: evaluated.filter((room) => !room.valid).length,
    suspicious: evaluated.filter((room) => room.suspiciousPartialName).length,
    duplicatesRemoved: evaluated.filter((room) => room.isDuplicate).length,
  };

  return { pageNumber, rooms: evaluated, summary };
}
