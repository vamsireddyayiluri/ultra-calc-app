import { GoogleGenAI } from "@google/genai";
import { GEMINI_BROWSER_MODEL, getGeminiBrowserApiKey } from "./browserConfig";
import type {
  AiDimension,
  AiDimensionReviewEntry,
  AiDimensionRole,
  AiDiscoveredRoom,
  AiDraftAnalysis,
  AiDraftRoom,
  AiPageRoomDiscoveryResult,
  AiPageRoomReviewResult,
  AiRoomCandidateClassification,
  AiRoomCandidateReview,
  AiRoomDimensionReview,
  AiRoomDimensionReviewResult,
  BrowserAiAnalysisInput,
  BrowserAiClient,
  BrowserPageRoomDiscoveryInput,
  BrowserPageRoomReviewInput,
  BrowserRoomDimensionReviewInput,
  PageRoomDiscoveryAiClient,
  PageRoomReviewAiClient,
  RoomDimensionReviewAiClient,
} from "./contracts";

const PROMPT = `You are reviewing one cropped region of an architectural floor plan. Analyze only the supplied crop. Do not infer, calculate, or invent dimensions that are not visibly supported. Return JSON only with roomName, dimensions, confidence, missingInformation, warnings, and evidence. Each dimension must contain rawText, normalizedText, feet, inches, decimalFeet, orientation (horizontal|vertical|unknown), confidence, and evidence. Only include dimensions whose text is visibly present in the crop. Preserve uncertainty rather than guessing.`;

const PAGE_REVIEW_PROMPT = `You are reviewing one page of an architectural floor plan together with a list of OCR-detected text candidates that a deterministic filter has already flagged as possible room or named-space labels. Use the page image and the supplied evidence to decide which candidates are genuinely room/space labels.

For every supplied candidate, return exactly one classification:
- "confirmedRoom": the visual page context reasonably supports this as an actual room or named space (e.g. a bedroom, bathroom, kitchen, closet, garage, office, or similar named space) at the labeled location.
- "notARoom": the candidate is actually a construction note, specification text, descriptive paragraph, architectural annotation, generic/ambiguous text, incomplete OCR fragment, or a duplicate of another room label.
- "needsReview": you cannot confidently decide from the supplied image and evidence.

Only use the candidateId values supplied to you. Do not invent new candidates, do not merge candidates, and do not omit any supplied candidate. Do not propose dimensions, room geometry, or any calculations - this is a classification-only review.

Return JSON only, in this exact shape:
{ "candidates": [ { "candidateId": string, "classification": "confirmedRoom" | "notARoom" | "needsReview", "confidence": number between 0 and 1, "reason": string[] } ] }`;

const ROOM_DISCOVERY_PROMPT = `You are examining one full page of an architectural floor plan image. Identify every room or named space that is explicitly visible and labeled on this page (for example bedrooms, bathrooms, kitchens, closets, garages, offices, living/dining/game rooms, foyers, laundry rooms, pantries, and similarly named spaces).

The supplied OCR text observations are supporting evidence only - they may be incomplete or garbled fragments (e.g. "THROOM", "E BATHROOM", "CLOSET GC", "|BaTHROOM"). Do not copy an OCR fragment into your output. Use the page image itself as your primary evidence and return the complete, correctly spelled room name as it visually appears on the page.

Rules:
- Only return rooms/spaces that are explicitly visible on this page image. Do not invent rooms.
- Each room should appear only once in your output.
- "name" must be a clean, complete room name (e.g. "MASTER BEDROOM", "BATHROOM", "CLOSET"), never a partial OCR fragment.
- "boundingBox" must locate the room's label text (not the whole room outline) using pixel coordinates in the coordinate space of the supplied image, with (0,0) at the top-left corner. Provide x, y, width, height as numbers, where (x,y) is the top-left corner of the box.
- If you cannot confidently locate a room's bounding box, still report the room but set "reviewRequired": true and provide your best-effort bounding box.
- "confidence" is a number between 0 and 1.
- "evidence" is a short list of strings explaining why you believe this is a room (mention visual cues and/or supporting OCR text).
- Do not propose dimensions, geometry, or any calculations - this is a discovery/classification task only.

Return JSON only, in this exact shape:
{ "rooms": [ { "name": string, "confidence": number, "boundingBox": { "x": number, "y": number, "width": number, "height": number }, "evidence": string[], "reviewRequired": boolean } ] }`;

const DIMENSION_REVIEW_PROMPT = `You are reviewing the deterministic dimension measurements associated with one cropped room region of an architectural floor plan. You are given the room crop image and a list of dimension-text candidates that OCR and spatial analysis already found near this room, each with a candidateId, the deterministic orientation/relation evidence, and the deterministic role already assigned (primaryHorizontal, primaryVertical, or additional).

Your job is to review and refine this existing evidence, not to invent new dimensions or search elsewhere on the page:
- Only use the candidateId values supplied to you. Never invent a dimension or measurement that is not one of the supplied candidates.
- For every supplied candidate, assign exactly one role:
  - "primaryHorizontal": the single most likely primary horizontal (width) measurement of this room.
  - "primaryVertical": the single most likely primary vertical (height) measurement of this room.
  - "extra": a real dimension near this room but not the primary horizontal/vertical (e.g. an internal feature, closet, alcove, or secondary measurement).
  - "rejected": this candidate clearly belongs to a different/neighboring room, or is unrelated/not actually a room dimension.
- Assign "primaryHorizontal" to at most one candidate and "primaryVertical" to at most one candidate. It is fine to assign neither if you are not confident.
- "confidence" per candidate and the overall "confidence" are numbers between 0 and 1.
- "evidence" per candidate is a short list of strings explaining the role you assigned, referencing the room crop image and/or the supplied deterministic evidence.
- "missingInformation" and "warnings" describe anything you could not confidently resolve (e.g. "no clear vertical dimension is visible in this crop").
- Do not propose room geometry, area/perimeter calculations, or create any room records - this is a dimension-classification review only.

Return JSON only, in this exact shape:
{ "confidence": number, "dimensions": [ { "candidateId": string, "role": "primaryHorizontal" | "primaryVertical" | "extra" | "rejected", "confidence": number, "evidence": string[] } ], "missingInformation": string[], "warnings": string[], "evidence": string[] }`;

interface GeminiGenerateRequest {
  model: string;
  contents: Array<{ inlineData: { mimeType: string; data: string } } | { text: string }>;
  config: { responseMimeType: string };
}


function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Gemini returned no JSON object.");
  try { return JSON.parse(text.slice(start, end + 1)); } catch { throw new Error("Gemini returned malformed JSON."); }
}

function stringField(value: unknown, field: string): string {
  if (typeof value !== "string") throw new Error(`Gemini response field '${field}' is invalid.`);
  return value;
}

function nullableNumber(value: unknown, field: string): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Gemini response field '${field}' is invalid.`);
  return value;
}

function confidenceNumber(value: unknown, field: string): number {
  if (typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1) return value;
  if (typeof value === "string") {
    const levels: Record<string, number> = { high: 0.9, medium: 0.65, low: 0.35, uncertain: 0.4 };
    const mapped = levels[value.toLowerCase()];
    if (mapped !== undefined) return mapped;
  }
  throw new Error(`Gemini response field '${field}' is invalid.`);
}

function stringArray(value: unknown, field: string): string[] {
  if (typeof value === "string") return [value];
  if (!Array.isArray(value)) throw new Error(`Gemini response field '${field}' is invalid.`);
  return value.map((entry, index) => stringField(entry, `${field}[${index}]`));
}

function validateDimension(value: unknown, index: number): AiDimension {
  if (!value || typeof value !== "object") throw new Error(`Gemini dimension ${index + 1} is invalid.`);
  const item = value as Record<string, unknown>;
  const orientation = item.orientation;
  if (orientation !== "horizontal" && orientation !== "vertical" && orientation !== "unknown") throw new Error(`Gemini dimension ${index + 1} orientation is invalid.`);
  const confidence = confidenceNumber(item.confidence, `dimensions[${index}].confidence`);
  return {
    rawText: stringField(item.rawText, `dimensions[${index}].rawText`),
    normalizedText: item.normalizedText === null ? null : stringField(item.normalizedText, `dimensions[${index}].normalizedText`),
    feet: nullableNumber(item.feet, `dimensions[${index}].feet`),
    inches: nullableNumber(item.inches, `dimensions[${index}].inches`),
    decimalFeet: nullableNumber(item.decimalFeet, `dimensions[${index}].decimalFeet`),
    orientation,
    confidence,
    evidence: stringField(item.evidence, `dimensions[${index}].evidence`),
  };
}

function validateDraft(value: unknown, input: BrowserAiAnalysisInput): AiDraftRoom {
  if (!value || typeof value !== "object") throw new Error("Gemini returned an invalid draft room.");
  const item = value as Record<string, unknown>;
  if (!Array.isArray(item.dimensions)) throw new Error("Gemini response is missing the dimensions array.");
  const confidence = confidenceNumber(item.confidence, "confidence");
  return {
    name: item.roomName === null ? null : stringField(item.roomName, "roomName"),
    sourcePage: input.crop.sourcePage,
    crop: input.crop,
    dimensions: item.dimensions.map(validateDimension),
    confidence,
    reviewRequired: true,
    missingInformation: stringArray(item.missingInformation ?? [], "missingInformation"),
    warnings: stringArray(item.warnings ?? [], "warnings"),
    evidence: stringArray(item.evidence ?? [], "evidence"),
  };
}

function isTransientGeminiError(error: unknown): boolean {
  const candidate = error as { status?: number | string; message?: string } | null;
  const message = candidate?.message ?? String(error);
  return candidate?.status === 503
    || candidate?.status === "UNAVAILABLE"
    || /high demand|temporarily unavailable|service unavailable/i.test(message);
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

// Shared retry-on-transient-failure behavior reused by every Gemini request in this client.
async function generateWithRetry(ai: GoogleGenAI, request: GeminiGenerateRequest, errorLabel: string) {
  let response;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      response = await ai.models.generateContent(request);
      break;
    } catch (error) {
      if (!isTransientGeminiError(error) || attempt === 2) {
        throw new Error(`${errorLabel} failed after ${attempt + 1} attempt(s): ${error instanceof Error ? error.message : String(error)}`);
      }
      await wait(800 * (attempt + 1));
    }
  }
  if (!response) throw new Error(`${errorLabel} returned no response.`);
  return response;
}

function validateCandidateReview(value: unknown, index: number): AiRoomCandidateReview {
  if (!value || typeof value !== "object") throw new Error(`Gemini candidate review ${index + 1} is invalid.`);
  const item = value as Record<string, unknown>;
  const candidateId = stringField(item.candidateId, `candidates[${index}].candidateId`);
  const classification = item.classification;
  if (classification !== "confirmedRoom" && classification !== "notARoom" && classification !== "needsReview") {
    throw new Error(`Gemini candidate review ${index + 1} ("${candidateId}") has an invalid classification.`);
  }
  const confidence = confidenceNumber(item.confidence, `candidates[${index}].confidence`);
  const reason = stringArray(item.reason ?? item.reasons ?? [], `candidates[${index}].reason`);
  return { candidateId, classification: classification as AiRoomCandidateClassification, confidence, reason };
}

function validatePageReview(value: unknown, input: BrowserPageRoomReviewInput): AiRoomCandidateReview[] {
  if (!value || typeof value !== "object") throw new Error("Gemini returned an invalid page review.");
  const item = value as Record<string, unknown>;
  const rawList = item.candidates ?? item.reviews;
  if (!Array.isArray(rawList)) throw new Error("Gemini page review response is missing the candidates array.");
  const parsed = rawList.map((entry, index) => validateCandidateReview(entry, index));

  const expectedIds = new Set(input.candidates.map((candidate) => candidate.candidateId));
  const seenIds = new Set<string>();
  for (const review of parsed) {
    if (!expectedIds.has(review.candidateId)) {
      throw new Error(`Gemini page review referenced an unknown candidateId "${review.candidateId}".`);
    }
    if (seenIds.has(review.candidateId)) {
      throw new Error(`Gemini page review returned duplicate results for candidateId "${review.candidateId}".`);
    }
    seenIds.add(review.candidateId);
  }
  const missingIds = [...expectedIds].filter((id) => !seenIds.has(id));
  if (missingIds.length > 0) {
    throw new Error(`Gemini page review is missing result(s) for candidateId(s): ${missingIds.join(", ")}.`);
  }

  const byId = new Map(parsed.map((review) => [review.candidateId, review]));
  // Return in the same order as the supplied candidates for stable rendering.
  return input.candidates.map((candidate) => byId.get(candidate.candidateId)!);
}

function validateDiscoveredRoom(value: unknown, index: number, pageNumber: number): AiDiscoveredRoom {
  if (!value || typeof value !== "object") throw new Error(`Gemini discovered room ${index + 1} is invalid.`);
  const item = value as Record<string, unknown>;
  const name = stringField(item.name, `rooms[${index}].name`);
  const confidence = confidenceNumber(item.confidence, `rooms[${index}].confidence`);
  const box = item.boundingBox;
  if (!box || typeof box !== "object") throw new Error(`Gemini discovered room ${index + 1} ("${name}") is missing a boundingBox.`);
  const boxItem = box as Record<string, unknown>;
  const numericField = (fieldValue: unknown, field: string): number => {
    if (typeof fieldValue !== "number" || !Number.isFinite(fieldValue)) throw new Error(`Gemini discovered room ${index + 1} ("${name}") field '${field}' is invalid.`);
    return fieldValue;
  };
  const boundingBox = {
    x: numericField(boxItem.x, `rooms[${index}].boundingBox.x`),
    y: numericField(boxItem.y, `rooms[${index}].boundingBox.y`),
    width: numericField(boxItem.width, `rooms[${index}].boundingBox.width`),
    height: numericField(boxItem.height, `rooms[${index}].boundingBox.height`),
  };
  const evidence = stringArray(item.evidence ?? [], `rooms[${index}].evidence`);
  const reviewRequired = typeof item.reviewRequired === "boolean" ? item.reviewRequired : false;

  // Ids are assigned deterministically here rather than trusted from Gemini's output.
  return { id: `page${pageNumber}-discovered${index}`, name, confidence, boundingBox, evidence, reviewRequired };
}

function validateRoomDiscovery(value: unknown, pageNumber: number): AiDiscoveredRoom[] {
  if (!value || typeof value !== "object") throw new Error("Gemini returned an invalid room-discovery response.");
  const item = value as Record<string, unknown>;
  const rawList = item.rooms;
  if (!Array.isArray(rawList)) throw new Error("Gemini room-discovery response is missing the rooms array.");
  return rawList.map((entry, index) => validateDiscoveredRoom(entry, index, pageNumber));
}

function validateDimensionReviewEntry(value: unknown, index: number): AiDimensionReviewEntry {
  if (!value || typeof value !== "object") throw new Error(`Gemini dimension review entry ${index + 1} is invalid.`);
  const item = value as Record<string, unknown>;
  const candidateId = stringField(item.candidateId, `dimensions[${index}].candidateId`);
  const role = item.role;
  if (role !== "primaryHorizontal" && role !== "primaryVertical" && role !== "extra" && role !== "rejected") {
    throw new Error(`Gemini dimension review entry ${index + 1} ("${candidateId}") has an invalid role.`);
  }
  const confidence = confidenceNumber(item.confidence, `dimensions[${index}].confidence`);
  const evidence = stringArray(item.evidence ?? [], `dimensions[${index}].evidence`);
  return { candidateId, role: role as AiDimensionRole, confidence, evidence };
}

function validateRoomDimensionReview(value: unknown, input: BrowserRoomDimensionReviewInput): AiRoomDimensionReview {
  if (!value || typeof value !== "object") throw new Error("Gemini returned an invalid room-dimension review.");
  const item = value as Record<string, unknown>;
  const rawList = item.dimensions;
  if (!Array.isArray(rawList)) throw new Error("Gemini room-dimension review response is missing the dimensions array.");
  const parsed = rawList.map((entry, index) => validateDimensionReviewEntry(entry, index));

  const expectedIds = new Set(input.candidates.map((candidate) => candidate.candidateId));
  const seenIds = new Set<string>();
  for (const entry of parsed) {
    if (!expectedIds.has(entry.candidateId)) {
      throw new Error(`Gemini room-dimension review referenced an unknown candidateId "${entry.candidateId}".`);
    }
    if (seenIds.has(entry.candidateId)) {
      throw new Error(`Gemini room-dimension review returned duplicate results for candidateId "${entry.candidateId}".`);
    }
    seenIds.add(entry.candidateId);
  }
  const missingIds = [...expectedIds].filter((id) => !seenIds.has(id));
  if (missingIds.length > 0) {
    throw new Error(`Gemini room-dimension review is missing result(s) for candidateId(s): ${missingIds.join(", ")}.`);
  }

  const primaryHorizontalCount = parsed.filter((entry) => entry.role === "primaryHorizontal").length;
  const primaryVerticalCount = parsed.filter((entry) => entry.role === "primaryVertical").length;
  if (primaryHorizontalCount > 1) throw new Error("Gemini room-dimension review assigned 'primaryHorizontal' to more than one candidate.");
  if (primaryVerticalCount > 1) throw new Error("Gemini room-dimension review assigned 'primaryVertical' to more than one candidate.");

  const byId = new Map(parsed.map((entry) => [entry.candidateId, entry]));
  // Return in the same order as the supplied candidates for stable rendering.
  const dimensions = input.candidates.map((candidate) => byId.get(candidate.candidateId)!);

  return {
    roomId: input.roomId,
    confidence: confidenceNumber(item.confidence, "confidence"),
    dimensions,
    missingInformation: stringArray(item.missingInformation ?? [], "missingInformation"),
    warnings: stringArray(item.warnings ?? [], "warnings"),
    evidence: stringArray(item.evidence ?? [], "evidence"),
  };
}

export class GeminiBrowserAiClient implements BrowserAiClient, PageRoomReviewAiClient, PageRoomDiscoveryAiClient, RoomDimensionReviewAiClient {
  async analyzeRoomCrop(input: BrowserAiAnalysisInput): Promise<AiDraftAnalysis> {
    const apiKey = getGeminiBrowserApiKey();
    if (!apiKey) throw new Error("Gemini browser analysis is not configured. Set VITE_GEMINI_API_KEY for this local experiment.");
    const ai = new GoogleGenAI({ apiKey });
    const request = {
      model: GEMINI_BROWSER_MODEL,
      contents: [
        { inlineData: { mimeType: "image/png", data: input.cropDataUrl.split(",")[1] ?? input.cropDataUrl } },
        { text: `${PROMPT}\nSelected OCR label: ${input.crop.roomLabelText}\nSource page: ${input.crop.sourcePage}\nDeterministic dimension evidence:\n${JSON.stringify(input.ocrDimensionCandidates, null, 2)}\nOCR evidence:\n${JSON.stringify(input.ocrObservations.slice(0, 100), null, 2)}` },
      ],
      config: { responseMimeType: "application/json" },
    };

    const response = await generateWithRetry(ai, request, "Gemini browser analysis");
    return { provider: "gemini-browser", analyzedAt: new Date().toISOString(), room: validateDraft(extractJson(response.text ?? ""), input) };
  }

  async reviewPageRoomCandidates(input: BrowserPageRoomReviewInput): Promise<AiPageRoomReviewResult> {
    const apiKey = getGeminiBrowserApiKey();
    if (!apiKey) throw new Error("Gemini browser page review is not configured. Set VITE_GEMINI_API_KEY for this local experiment.");
    const ai = new GoogleGenAI({ apiKey });
    const request = {
      model: GEMINI_BROWSER_MODEL,
      contents: [
        { inlineData: { mimeType: "image/png", data: input.pageImageDataUrl.split(",")[1] ?? input.pageImageDataUrl } },
        {
          text: `${PAGE_REVIEW_PROMPT}\nPage number: ${input.pageNumber}\nCandidates:\n${JSON.stringify(input.candidates, null, 2)}${
            input.ocrObservations ? `\nRelevant OCR evidence (subset):\n${JSON.stringify(input.ocrObservations.slice(0, 150), null, 2)}` : ""
          }`,
        },
      ],
      config: { responseMimeType: "application/json" },
    };

    const response = await generateWithRetry(ai, request, "Gemini browser page review");
    return {
      provider: "gemini-browser",
      analyzedAt: new Date().toISOString(),
      pageNumber: input.pageNumber,
      reviews: validatePageReview(extractJson(response.text ?? ""), input),
    };
  }

  async discoverPageRooms(input: BrowserPageRoomDiscoveryInput): Promise<AiPageRoomDiscoveryResult> {
    const apiKey = getGeminiBrowserApiKey();
    if (!apiKey) throw new Error("Gemini browser room discovery is not configured. Set VITE_GEMINI_API_KEY for this local experiment.");
    const ai = new GoogleGenAI({ apiKey });
    const request = {
      model: GEMINI_BROWSER_MODEL,
      contents: [
        { inlineData: { mimeType: "image/png", data: input.pageImageDataUrl.split(",")[1] ?? input.pageImageDataUrl } },
        {
          text: `${ROOM_DISCOVERY_PROMPT}\nImage dimensions (pixels): ${input.pageImageWidth} x ${input.pageImageHeight} (x=0, y=0 at top-left)\nPage number: ${input.pageNumber}${
            input.ocrObservations ? `\nSupporting OCR evidence (subset, may include fragments):\n${JSON.stringify(input.ocrObservations.slice(0, 150), null, 2)}` : ""
          }`,
        },
      ],
      config: { responseMimeType: "application/json" },
    };

    const response = await generateWithRetry(ai, request, "Gemini browser room discovery");
    return {
      provider: "gemini-browser",
      analyzedAt: new Date().toISOString(),
      pageNumber: input.pageNumber,
      pageImageWidth: input.pageImageWidth,
      pageImageHeight: input.pageImageHeight,
      rooms: validateRoomDiscovery(extractJson(response.text ?? ""), input.pageNumber),
    };
  }

  async reviewRoomDimensions(input: BrowserRoomDimensionReviewInput): Promise<AiRoomDimensionReviewResult> {
    const apiKey = getGeminiBrowserApiKey();
    if (!apiKey) throw new Error("Gemini browser room-dimension review is not configured. Set VITE_GEMINI_API_KEY for this local experiment.");
    const ai = new GoogleGenAI({ apiKey });
    const request = {
      model: GEMINI_BROWSER_MODEL,
      contents: [
        { inlineData: { mimeType: "image/png", data: input.cropDataUrl.split(",")[1] ?? input.cropDataUrl } },
        {
          text: `${DIMENSION_REVIEW_PROMPT}\nRoom name: ${input.roomName}\nDeterministic primary horizontal candidateId: ${input.deterministicPrimaryHorizontalId ?? "none"}\nDeterministic primary vertical candidateId: ${input.deterministicPrimaryVerticalId ?? "none"}\nCandidates:\n${JSON.stringify(input.candidates, null, 2)}`,
        },
      ],
      config: { responseMimeType: "application/json" },
    };

    const response = await generateWithRetry(ai, request, "Gemini browser room-dimension review");
    return {
      provider: "gemini-browser",
      analyzedAt: new Date().toISOString(),
      review: validateRoomDimensionReview(extractJson(response.text ?? ""), input),
    };
  }
}

