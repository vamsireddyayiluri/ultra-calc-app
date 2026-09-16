import type { OcrObservationInput } from "./dimensionCandidates";

export interface RoomLabelCandidate {
  text: string;
  confidence: number;
  boundingBox: OcrObservationInput["bbox"];
  classification: "likely" | "uncertain";
  reason: string;
}

const ROOM_TERMS = [
  "BEDROOM", "BATHROOM", "BATH", "KITCHEN", "OFFICE", "LIBRARY", "FOYER",
  "CLOSET", "LAUNDRY", "GAME", "DINING", "LIVING", "MASTER", "MUD",
  "PANTRY", "GARAGE", "ROOM",
];

function normalizeToken(text: string): string {
  return text.toUpperCase().replace(/[^A-Z0-9]+/g, "").trim();
}

function center(box: OcrObservationInput["bbox"]) {
  return { x: (box.x0 + box.x1) / 2, y: (box.y0 + box.y1) / 2 };
}

function union(boxes: OcrObservationInput["bbox"][]): OcrObservationInput["bbox"] {
  return {
    x0: Math.min(...boxes.map((box) => box.x0)),
    y0: Math.min(...boxes.map((box) => box.y0)),
    x1: Math.max(...boxes.map((box) => box.x1)),
    y1: Math.max(...boxes.map((box) => box.y1)),
  };
}

function groupWordsByLine(observations: OcrObservationInput[]): OcrObservationInput[][] {
  const words = observations
    .filter((observation) => /[A-Za-z]/.test(observation.text))
    .slice()
    .sort((a, b) => center(a.bbox).y - center(b.bbox).y || a.bbox.x0 - b.bbox.x0);
  const lines: OcrObservationInput[][] = [];

  for (const word of words) {
    const wordCenter = center(word.bbox);
    const wordHeight = Math.max(1, word.bbox.y1 - word.bbox.y0);
    const line = lines.find((candidate) => {
      const first = candidate[0];
      const firstCenter = center(first.bbox);
      const firstHeight = Math.max(1, first.bbox.y1 - first.bbox.y0);
      return Math.abs(wordCenter.y - firstCenter.y) <= Math.max(wordHeight, firstHeight) * 0.8
        && word.bbox.x0 >= Math.max(...candidate.map((item) => item.bbox.x1))
        && word.bbox.x0 - Math.max(...candidate.map((item) => item.bbox.x1)) <= Math.max(wordHeight, firstHeight) * 6;
    });

    if (line) line.push(word);
    else lines.push([word]);
  }

  return lines;
}

export function detectRoomLabelCandidates(
  observations: OcrObservationInput[],
): RoomLabelCandidate[] {
  return groupWordsByLine(observations).flatMap((line) => {
    const text = line.map((word) => word.text).join(" ").trim();
    const normalized = line.map((word) => normalizeToken(word.text)).join(" ");
    const hasRoomTerm = ROOM_TERMS.some((term) => normalized.includes(term));
    if (!hasRoomTerm || text.length < 3) return [];

    const confidence = Number((line.reduce((sum, word) => sum + word.confidence, 0) / line.length).toFixed(1));
    const classification = confidence >= 55 ? "likely" : "uncertain";
    return [{
      text,
      confidence,
      boundingBox: union(line.map((word) => word.bbox)),
      classification,
      reason: classification === "likely"
        ? "Compact OCR word group contains a recognized room-type term."
        : "OCR word group resembles a room label but confidence is limited.",
    }];
  });
}
