import type { DimensionCandidate } from "../core/dimensionCandidates";
import type { RoomCropMetadata } from "../browser/roomCrop";
import type { OcrObservationInput } from "../core/dimensionCandidates";

export interface AiDimension {
  rawText: string;
  normalizedText: string | null;
  feet: number | null;
  inches: number | null;
  decimalFeet: number | null;
  orientation: "horizontal" | "vertical" | "unknown";
  confidence: number;
  evidence: string;
}

export interface AiDraftRoom {
  name: string | null;
  sourcePage: number;
  crop: RoomCropMetadata;
  dimensions: AiDimension[];
  confidence: number;
  reviewRequired: boolean;
  missingInformation: string[];
  warnings: string[];
  evidence: string[];
}

export interface AiDraftAnalysis {
  provider: "mock-browser" | "gemini-browser";
  analyzedAt: string;
  room: AiDraftRoom;
}

export interface BrowserAiAnalysisInput {
  cropDataUrl: string;
  crop: RoomCropMetadata;
  ocrDimensionCandidates: DimensionCandidate[];
  ocrObservations: OcrObservationInput[];
}

export interface BrowserAiClient {
  analyzeRoomCrop(input: BrowserAiAnalysisInput): Promise<AiDraftAnalysis>;
}

// Page-level room-candidate review: a separate contract/method from analyzeRoomCrop.
// One request reviews every filtered candidate on a page at once (not per-candidate).
export type AiRoomCandidateClassification = "confirmedRoom" | "notARoom" | "needsReview";

export interface AiRoomCandidateReview {
  candidateId: string;
  classification: AiRoomCandidateClassification;
  confidence: number;
  reason: string[];
}

export interface AiPageRoomCandidateInput {
  candidateId: string;
  text: string;
  normalizedText: string;
  ocrConfidence: number;
  boundingBox: OcrObservationInput["bbox"];
  deterministicClassification: "likelyRoom" | "possibleRoom";
  deterministicScore: number;
  deterministicReasons: string[];
}

export interface BrowserPageRoomReviewInput {
  pageNumber: number;
  pageImageDataUrl: string;
  candidates: AiPageRoomCandidateInput[];
  ocrObservations?: OcrObservationInput[];
}

export interface AiPageRoomReviewResult {
  provider: "mock-browser" | "gemini-browser";
  analyzedAt: string;
  pageNumber: number;
  reviews: AiRoomCandidateReview[];
}

export interface PageRoomReviewAiClient {
  reviewPageRoomCandidates(input: BrowserPageRoomReviewInput): Promise<AiPageRoomReviewResult>;
}

// Page-level room discovery: an independent contract/method that does NOT rely on
// OCR room-label candidates as the source of truth. Gemini examines the page image
// directly and reports rooms it can actually see; OCR is supporting evidence only.
export interface AiDiscoveredRoomBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface AiDiscoveredRoom {
  id: string;
  name: string;
  confidence: number;
  boundingBox: AiDiscoveredRoomBoundingBox;
  evidence: string[];
  reviewRequired: boolean;
}

export interface BrowserPageRoomDiscoveryInput {
  pageNumber: number;
  pageImageDataUrl: string;
  pageImageWidth: number;
  pageImageHeight: number;
  ocrObservations?: OcrObservationInput[];
}

export interface AiPageRoomDiscoveryResult {
  provider: "mock-browser" | "gemini-browser";
  analyzedAt: string;
  pageNumber: number;
  pageImageWidth: number;
  pageImageHeight: number;
  rooms: AiDiscoveredRoom[];
}

export interface PageRoomDiscoveryAiClient {
  discoverPageRooms(input: BrowserPageRoomDiscoveryInput): Promise<AiPageRoomDiscoveryResult>;
}

// Room-level dimension review: reviews the deterministic dimension-association result
// for one FinalRoomCandidate at a time. Only called for rooms already flagged
// reviewRequired/ambiguous by the deterministic stage - a separate contract/method
// from every other AI stage. Gemini refines the existing candidates; it never invents
// new dimensions.
export type AiDimensionRole = "primaryHorizontal" | "primaryVertical" | "extra" | "rejected";

export interface AiDimensionCandidateInput {
  candidateId: string;
  rawText: string;
  normalizedText: string | null;
  feet: number | null;
  inches: number | null;
  decimalFeet: number | null;
  confidence: number;
  classification: DimensionCandidate["classification"];
  orientation: "horizontal" | "vertical" | "unknown";
  relation: "inside" | "overlapping" | "near";
  deterministicRole: "primaryHorizontal" | "primaryVertical" | "additional";
  reasons: string[];
}

export interface AiDimensionReviewEntry {
  candidateId: string;
  role: AiDimensionRole;
  confidence: number;
  evidence: string[];
}

export interface AiRoomDimensionReview {
  roomId: string;
  confidence: number;
  dimensions: AiDimensionReviewEntry[];
  missingInformation: string[];
  warnings: string[];
  evidence: string[];
}

export interface BrowserRoomDimensionReviewInput {
  roomId: string;
  roomName: string;
  cropDataUrl: string;
  candidates: AiDimensionCandidateInput[];
  deterministicPrimaryHorizontalId: string | null;
  deterministicPrimaryVerticalId: string | null;
}

export interface AiRoomDimensionReviewResult {
  provider: "mock-browser" | "gemini-browser";
  analyzedAt: string;
  review: AiRoomDimensionReview;
}

export interface RoomDimensionReviewAiClient {
  reviewRoomDimensions(input: BrowserRoomDimensionReviewInput): Promise<AiRoomDimensionReviewResult>;
}

