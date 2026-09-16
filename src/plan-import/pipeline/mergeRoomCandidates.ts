// Deterministic merge stage: combines OCR-deterministic and Gemini-discovery room
// candidates from the same PDF page into one final room list. No AI calls here -
// only spatial/name evidence already produced by the two discovery pipelines.
// Crops are reused from whichever source candidate is chosen as canonical; no new
// crops are generated.
import type { AutomatedRoomCandidate } from "./analyzePlanDocument";
import type { BrowserDimensionCandidate } from "../core/planAnalysis";

export type FinalRoomSource = "ocr-deterministic" | "gemini-discovery";
export type FinalRoomMergeStatus = "merged" | "ocr-only" | "gemini-only";
export type FinalRoomReviewStatus = "ok" | "nameConflict" | "locationConflict";

export interface FinalRoomBoundingBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface FinalRoomCandidate {
  id: string;
  pageNumber: number;
  roomName: string;
  alternateNames: string[];
  confidence: number;
  sources: FinalRoomSource[];
  mergedFromIds: string[];
  mergeStatus: FinalRoomMergeStatus;
  reviewStatus: FinalRoomReviewStatus;
  reviewReasons: string[];
  cropDataUrl: string;
  cropSourceId: string;
  boundingBox: FinalRoomBoundingBox;
  // Approximate room-area rectangle (the generated crop region) used as the spatial
  // anchor for associating nearby dimension candidates - larger than boundingBox,
  // which only marks the room-label text itself.
  roomBoundingBox: FinalRoomBoundingBox;
  nearbyDimensionCandidates: BrowserDimensionCandidate[];
  status: "ready" | "review" | "insufficient";
  evidence: string[];
}

export interface MergeRoomCandidatesResult {
  finalRooms: FinalRoomCandidate[];
  summary: {
    totalCandidates: number;
    finalRoomCount: number;
    merged: number;
    ocrOnly: number;
    geminiOnly: number;
    nameConflicts: number;
    locationConflicts: number;
    duplicateCropsAvoided: number;
  };
}

function nameKeyFor(name: string): string {
  return name.toUpperCase().replace(/[^A-Z0-9]+/g, "").trim();
}

function namesSimilar(keyA: string, keyB: string): boolean {
  if (!keyA || !keyB) return false;
  return keyA === keyB || keyA.includes(keyB) || keyB.includes(keyA);
}

function center(box: FinalRoomBoundingBox) {
  return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
}

function diagonal(box: FinalRoomBoundingBox): number {
  return Math.hypot(box.x1 - box.x0, box.y1 - box.y0);
}

function intersects(a: FinalRoomBoundingBox, b: FinalRoomBoundingBox): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

function distanceBetween(a: FinalRoomBoundingBox, b: FinalRoomBoundingBox): number {
  const centerA = center(a);
  const centerB = center(b);
  return Math.hypot(centerA.x - centerB.x, centerA.y - centerB.y);
}

// Two candidates are considered the same physical location if their label boxes
// overlap, or are close relative to their own size (mirrors the proximity rule used
// by roomLabelFilter/discoveredRoomValidation duplicate detection elsewhere).
function spatiallyLinked(a: FinalRoomBoundingBox, b: FinalRoomBoundingBox): boolean {
  if (intersects(a, b)) return true;
  const proximityRadius = Math.max(diagonal(a), diagonal(b));
  return distanceBetween(a, b) <= proximityRadius;
}

function boundingBoxFor(room: AutomatedRoomCandidate): FinalRoomBoundingBox {
  return room.cropMetadata.originalLabelBoundingBox;
}

function effectiveConfidence(room: AutomatedRoomCandidate): number {
  if (room.source === "gemini-discovery") return room.discoveryConfidence ?? 0;
  return Math.max(room.aiConfidence ?? 0, (room.filterScore ?? 0) / 100, (room.labelConfidence ?? 0) / 100);
}

const STATUS_RANK: Record<AutomatedRoomCandidate["status"], number> = { ready: 2, review: 1, insufficient: 0 };

// Deterministic tie-break: best crop-validation status first, then confidence, then
// prefer Gemini-discovery names (they are asked to return complete, clean names).
function pickCanonical(members: AutomatedRoomCandidate[]): AutomatedRoomCandidate {
  return members.slice().sort((a, b) => {
    const statusDiff = STATUS_RANK[b.status] - STATUS_RANK[a.status];
    if (statusDiff !== 0) return statusDiff;
    const confidenceDiff = effectiveConfidence(b) - effectiveConfidence(a);
    if (confidenceDiff !== 0) return confidenceDiff;
    if (a.source !== b.source) return a.source === "gemini-discovery" ? -1 : 1;
    return 0;
  })[0];
}

export function mergeRoomCandidates(rooms: AutomatedRoomCandidate[]): MergeRoomCandidatesResult {
  const pageGroups = new Map<number, AutomatedRoomCandidate[]>();
  for (const room of rooms) {
    const list = pageGroups.get(room.sourcePage) ?? [];
    list.push(room);
    pageGroups.set(room.sourcePage, list);
  }

  const finalRooms: FinalRoomCandidate[] = [];

  for (const [pageNumber, pageRooms] of pageGroups) {
    // Union-find over this page's candidates only - merges never cross pages.
    const parent = pageRooms.map((_, index) => index);
    const find = (index: number): number => {
      if (parent[index] !== index) parent[index] = find(parent[index]);
      return parent[index];
    };
    const union = (a: number, b: number) => {
      const rootA = find(a);
      const rootB = find(b);
      if (rootA !== rootB) parent[rootA] = rootB;
    };

    for (let i = 0; i < pageRooms.length; i += 1) {
      for (let j = i + 1; j < pageRooms.length; j += 1) {
        if (spatiallyLinked(boundingBoxFor(pageRooms[i]), boundingBoxFor(pageRooms[j]))) {
          union(i, j);
        }
      }
    }

    const clusters = new Map<number, AutomatedRoomCandidate[]>();
    pageRooms.forEach((room, index) => {
      const root = find(index);
      const list = clusters.get(root) ?? [];
      list.push(room);
      clusters.set(root, list);
    });

    let clusterSequence = 0;
    for (const members of clusters.values()) {
      clusterSequence += 1;
      const canonical = pickCanonical(members);
      const sources = Array.from(new Set(members.map((member) => member.source))) as FinalRoomSource[];

      const referenceKey = nameKeyFor(canonical.roomName);
      const namesMatch = members.every((member) => namesSimilar(nameKeyFor(member.roomName), referenceKey));

      const sourceCounts = members.reduce<Record<string, number>>((counts, member) => {
        counts[member.source] = (counts[member.source] ?? 0) + 1;
        return counts;
      }, {});
      const hasAmbiguousSameSourceOverlap = Object.values(sourceCounts).some((count) => count > 1);

      const reviewReasons: string[] = [];
      let reviewStatus: FinalRoomReviewStatus = "ok";
      if (hasAmbiguousSameSourceOverlap) {
        reviewStatus = "locationConflict";
        reviewReasons.push(
          `${members.length} candidate(s) from the same pipeline overlap at this location; pairing across pipelines is ambiguous and needs manual review.`,
        );
      } else if (!namesMatch) {
        reviewStatus = "nameConflict";
        reviewReasons.push(
          `Overlapping candidates disagree on room name: ${Array.from(new Set(members.map((member) => member.roomName))).join(", ")}.`,
        );
      }

      const mergeStatus: FinalRoomMergeStatus = sources.length > 1
        ? "merged"
        : sources[0] === "gemini-discovery" ? "gemini-only" : "ocr-only";

      const alternateNames = Array.from(
        new Set(members.map((member) => member.roomName).filter((name) => name !== canonical.roomName)),
      );
      // Union by reference: members on the same page share the same dimension-candidate
      // array instances, so a Set correctly dedupes without re-deriving spatial evidence.
      const nearbyDimensionCandidates = Array.from(
        new Set(members.flatMap((member) => member.nearbyDimensionCandidates)),
      );

      finalRooms.push({
        id: `page${pageNumber}-final${clusterSequence}`,
        pageNumber,
        roomName: canonical.roomName,
        alternateNames,
        confidence: effectiveConfidence(canonical),
        sources,
        mergedFromIds: members.map((member) => member.id),
        mergeStatus,
        reviewStatus,
        reviewReasons,
        cropDataUrl: canonical.cropDataUrl,
        cropSourceId: canonical.id,
        boundingBox: boundingBoxFor(canonical),
        roomBoundingBox: canonical.cropMetadata.cropBoundingBox,
        nearbyDimensionCandidates,
        status: canonical.status,
        evidence: Array.from(new Set(members.flatMap((member) => member.evidence))),
      });
    }
  }

  const summary = {
    totalCandidates: rooms.length,
    finalRoomCount: finalRooms.length,
    merged: finalRooms.filter((room) => room.mergeStatus === "merged").length,
    ocrOnly: finalRooms.filter((room) => room.mergeStatus === "ocr-only").length,
    geminiOnly: finalRooms.filter((room) => room.mergeStatus === "gemini-only").length,
    nameConflicts: finalRooms.filter((room) => room.reviewStatus === "nameConflict").length,
    locationConflicts: finalRooms.filter((room) => room.reviewStatus === "locationConflict").length,
    duplicateCropsAvoided: rooms.length - finalRooms.length,
  };

  return { finalRooms, summary };
}
