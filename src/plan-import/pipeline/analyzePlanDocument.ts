// Orchestration-only module: wires together existing browser-safe PDF/OCR/analysis
// logic to automatically process every page of a plan PDF. Runs two independent,
// comparable crop-generation pipelines: (1) OCR-label-driven deterministic filtering
// with an optional Gemini candidate-review stage, and (2) an optional Gemini
// page-level room-discovery stage that does not rely on OCR labels as the source of
// truth. Neither existing stage is removed - both remain available for comparison.
import { loadPdfDocument } from "../browser/pdfDocument";
import { renderPdfPage } from "../browser/pdfRenderer";
import { recognizeCanvas, type OcrProgress } from "../browser/ocr";
import { createRoomCrop, createRoomCropFromBoundingBox, type RoomCropMetadata } from "../browser/roomCrop";
import { createPageReviewImage } from "../browser/pageImage";
import { analyzePlanObservations, type BrowserDimensionCandidate } from "../core/planAnalysis";
import { validateRoomCrop, type RoomCropValidation } from "../core/validateRoomCrop";
import { validateDiscoveredRoomCrop, type DiscoveredRoomCropValidation } from "../core/validateDiscoveredRoomCrop";
import type { RoomLabelCandidate } from "../core/roomLabels";
import {
  filterRoomLabelCandidates,
  type FilterRoomLabelCandidatesResult,
} from "../core/roomLabelFilter";
import {
  validateDiscoveredRooms,
  type ValidatedDiscoveredRoom,
} from "../core/discoveredRoomValidation";
import {
  mergeRoomCandidates,
  type MergeRoomCandidatesResult,
} from "./mergeRoomCandidates";
import {
  associateRoomDimensions,
  type FinalRoomCandidateWithDimensions,
} from "./associateRoomDimensions";
import {
  reviewRoomDimensions,
  type FinalRoomCandidateWithDimensionReview,
} from "./reviewRoomDimensions";
import type {
  AiPageRoomCandidateInput,
  AiRoomCandidateClassification,
  PageRoomDiscoveryAiClient,
  PageRoomReviewAiClient,
  RoomDimensionReviewAiClient,
} from "../ai/contracts";

export interface AutomatedCandidateReview {
  candidateId: string;
  pageNumber: number;
  labelText: string;
  deterministicClassification: "likelyRoom" | "possibleRoom";
  deterministicScore: number;
  aiClassification: AiRoomCandidateClassification | null;
  aiConfidence: number | null;
  aiReason: string[];
}

export interface AutomatedPageRoomDiscovery {
  provider: "mock-browser" | "gemini-browser";
  geminiImageDimensions: { width: number; height: number };
  analysisImageDimensions: { width: number; height: number };
  rooms: ValidatedDiscoveredRoom[];
  summary: {
    total: number;
    valid: number;
    invalid: number;
    suspicious: number;
    duplicatesRemoved: number;
    cropsGenerated: number;
  };
}

export interface AutomatedPageAnalysis {
  pageNumber: number;
  status: "analyzed" | "skipped" | "error";
  ocrObservationCount: number;
  ocrConfidence: number;
  roomLabelsDetected: number;
  cropsGenerated: number;
  skipReason?: string;
  roomLabelFilter?: FilterRoomLabelCandidatesResult;
  candidateReviews?: AutomatedCandidateReview[];
  roomDiscovery?: AutomatedPageRoomDiscovery;
}

export interface AutomatedRoomCandidate {
  id: string;
  source: "ocr-deterministic" | "gemini-discovery";
  roomName: string;
  sourcePage: number;
  cropDataUrl: string;
  cropMetadata: RoomCropMetadata;
  cropValidation: RoomCropValidation | DiscoveredRoomCropValidation;
  nearbyDimensionCandidates: BrowserDimensionCandidate[];
  evidence: string[];
  status: "ready" | "review" | "insufficient";
  // OCR-deterministic pipeline fields (present when source === "ocr-deterministic").
  labelConfidence?: number;
  labelClassification?: RoomLabelCandidate["classification"];
  labelBoundingBox?: RoomLabelCandidate["boundingBox"];
  filterClassification?: "likelyRoom" | "possibleRoom";
  filterScore?: number;
  aiClassification?: AiRoomCandidateClassification | null;
  aiConfidence?: number | null;
  aiReason?: string[];
  // Gemini-discovery pipeline fields (present when source === "gemini-discovery").
  discoveryConfidence?: number;
  discoverySuspiciousPartialName?: boolean;
  discoveryReviewRequired?: boolean;
}

export interface AutomatedPlanAnalysis {
  source: {
    fileName: string;
    pageCount: number;
    analyzedAt: string;
  };
  pages: AutomatedPageAnalysis[];
  rooms: AutomatedRoomCandidate[];
  finalRooms: FinalRoomCandidateWithDimensionReview[];
  mergeSummary: MergeRoomCandidatesResult["summary"];
  summary: {
    totalPages: number;
    analyzedPages: number;
    skippedPages: number;
    roomLabelsFound: number;
    cropsGenerated: number;
    ready: number;
    review: number;
    insufficient: number;
    likelyRoomCandidates: number;
    possibleRoomCandidates: number;
    rejectedCandidates: number;
    duplicatesRemoved: number;
    aiReviewEnabled: boolean;
    aiConfirmedRooms: number;
    aiNeedsReview: number;
    aiRejectedNotRoom: number;
    ocrPipelineCropsGenerated: number;
    roomDiscoveryEnabled: boolean;
    discoveredRoomsTotal: number;
    discoveredRoomsValid: number;
    discoveredRoomsSuspicious: number;
    discoveredRoomsDuplicatesRemoved: number;
    discoveryPipelineCropsGenerated: number;
  };
  warnings: string[];
}

export interface AnalyzePlanProgress {
  phase: "loading-document" | "rendering-page" | "running-ocr" | "detecting-rooms" | "reviewing-candidates" | "discovering-rooms" | "generating-crop" | "page-complete" | "complete";
  currentPage: number;
  totalPages: number;
  message: string;
  roomsDiscovered: number;
  ocrProgress?: OcrProgress;
}

export interface AnalyzePlanDocumentOptions {
  cropPadding?: number;
  onProgress?: (progress: AnalyzePlanProgress) => void;
  // Optional and explicit: deterministic filtering works fully without any AI stage.
  pageReviewAiClient?: PageRoomReviewAiClient;
  pageReviewImageMaxWidth?: number;
  pageRoomDiscoveryAiClient?: PageRoomDiscoveryAiClient;
  roomDiscoveryImageMaxWidth?: number;
  dimensionReviewAiClient?: RoomDimensionReviewAiClient;
}

const DEFAULT_CROP_PADDING = 900;

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `room-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

// Lets the browser repaint progress state between heavy synchronous steps (canvas render/scan).
function yieldToUi(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") requestAnimationFrame(() => resolve());
    else setTimeout(resolve, 0);
  });
}

// Mirrors the proximity rule used by validateRoomCrop's dimensionCandidatesInCrop count,
// but returns the actual candidates so they can be preserved as room evidence.
function findNearbyDimensionCandidates(
  crop: RoomCropMetadata["cropBoundingBox"],
  padding: number,
  dimensionCandidates: BrowserDimensionCandidate[],
): BrowserDimensionCandidate[] {
  const margin = Math.max(120, Math.round(padding * 0.25));
  return dimensionCandidates.filter((candidate) => {
    const box = candidate.boundingBox;
    return box.x1 >= crop.x0 - margin
      && box.x0 <= crop.x1 + margin
      && box.y1 >= crop.y0 - margin
      && box.y0 <= crop.y1 + margin;
  });
}

export async function analyzePlanDocument(
  file: File,
  options: AnalyzePlanDocumentOptions = {},
): Promise<AutomatedPlanAnalysis> {
  const cropPadding = options.cropPadding ?? DEFAULT_CROP_PADDING;
  const onProgress = options.onProgress;
  const warnings: string[] = [];
  const pages: AutomatedPageAnalysis[] = [];
  const rooms: AutomatedRoomCandidate[] = [];

  onProgress?.({
    phase: "loading-document",
    currentPage: 0,
    totalPages: 0,
    message: `Loading ${file.name}...`,
    roomsDiscovered: 0,
  });

  const data = await file.arrayBuffer();
  const { document: pdfDocument, pageCount } = await loadPdfDocument(data);

  for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
    try {
      onProgress?.({
        phase: "rendering-page",
        currentPage: pageNumber,
        totalPages: pageCount,
        message: `Rendering page ${pageNumber} of ${pageCount}...`,
        roomsDiscovered: rooms.length,
      });

      const canvas = document.createElement("canvas");
      await renderPdfPage(pdfDocument, pageNumber, canvas, { scale: 300 / 72 });
      await yieldToUi();

      onProgress?.({
        phase: "running-ocr",
        currentPage: pageNumber,
        totalPages: pageCount,
        message: `Running OCR on page ${pageNumber} of ${pageCount}...`,
        roomsDiscovered: rooms.length,
      });

      const ocrResult = await recognizeCanvas(canvas, (ocrProgress) => {
        onProgress?.({
          phase: "running-ocr",
          currentPage: pageNumber,
          totalPages: pageCount,
          message: `Running OCR on page ${pageNumber} of ${pageCount}...`,
          roomsDiscovered: rooms.length,
          ocrProgress,
        });
      });

      onProgress?.({
        phase: "detecting-rooms",
        currentPage: pageNumber,
        totalPages: pageCount,
        message: `Detecting room labels on page ${pageNumber} of ${pageCount}...`,
        roomsDiscovered: rooms.length,
      });

      const planAnalysis = analyzePlanObservations(ocrResult.observations, canvas);
      await yieldToUi();

      if (planAnalysis.roomLabels.length === 0) {
        pages.push({
          pageNumber,
          status: "skipped",
          ocrObservationCount: ocrResult.observations.length,
          ocrConfidence: ocrResult.confidence,
          roomLabelsDetected: 0,
          cropsGenerated: 0,
          skipReason: "No room labels detected on this page.",
        });
        continue;
      }

      const roomLabelFilter = filterRoomLabelCandidates({
        pageNumber,
        roomLabels: planAnalysis.roomLabels,
        ocrObservations: ocrResult.observations,
        dimensionCandidates: planAnalysis.dimensionCandidates,
      });

      const acceptedEvaluations = roomLabelFilter.evaluations.filter(
        (evaluation) => !evaluation.isDuplicate && evaluation.classification !== "rejected",
      );

      const reviewMap = new Map<string, { classification: AiRoomCandidateClassification; confidence: number; reason: string[] }>();
      if (options.pageReviewAiClient && acceptedEvaluations.length > 0) {
        onProgress?.({
          phase: "reviewing-candidates",
          currentPage: pageNumber,
          totalPages: pageCount,
          message: `Sending ${acceptedEvaluations.length} filtered candidate(s) on page ${pageNumber} to Gemini for review...`,
          roomsDiscovered: rooms.length,
        });

        try {
          const pageImage = createPageReviewImage(canvas, options.pageReviewImageMaxWidth ?? 1400);
          const candidatesForReview: AiPageRoomCandidateInput[] = acceptedEvaluations.map((evaluation) => ({
            candidateId: evaluation.candidateId,
            text: evaluation.label.text,
            normalizedText: evaluation.normalizedText,
            ocrConfidence: evaluation.label.confidence,
            boundingBox: evaluation.label.boundingBox,
            deterministicClassification: evaluation.classification as "likelyRoom" | "possibleRoom",
            deterministicScore: evaluation.score,
            deterministicReasons: evaluation.reasons,
          }));

          const pageReview = await options.pageReviewAiClient.reviewPageRoomCandidates({
            pageNumber,
            pageImageDataUrl: pageImage.dataUrl,
            candidates: candidatesForReview,
            ocrObservations: ocrResult.observations.slice(0, 150),
          });

          for (const review of pageReview.reviews) {
            reviewMap.set(review.candidateId, review);
          }
        } catch (reviewError) {
          warnings.push(
            `Page ${pageNumber}: Gemini page-level room review failed, falling back to deterministic filtering only (${
              reviewError instanceof Error ? reviewError.message : "unknown error"
            }).`,
          );
        }
      }

      const candidateReviews: AutomatedCandidateReview[] = acceptedEvaluations.map((evaluation) => {
        const review = reviewMap.get(evaluation.candidateId);
        return {
          candidateId: evaluation.candidateId,
          pageNumber,
          labelText: evaluation.label.text,
          deterministicClassification: evaluation.classification as "likelyRoom" | "possibleRoom",
          deterministicScore: evaluation.score,
          aiClassification: review?.classification ?? null,
          aiConfidence: review?.confidence ?? null,
          aiReason: review?.reason ?? [],
        };
      });

      const proceedEvaluations = acceptedEvaluations.filter((evaluation) => {
        const review = reviewMap.get(evaluation.candidateId);
        return !review || review.classification !== "notARoom";
      });

      let cropsGeneratedForPage = 0;

      for (const evaluation of proceedEvaluations) {
        const label = evaluation.label;
        onProgress?.({
          phase: "generating-crop",
          currentPage: pageNumber,
          totalPages: pageCount,
          message: `Generating crop for "${label.text}" on page ${pageNumber}...`,
          roomsDiscovered: rooms.length,
        });

        try {
          const crop = createRoomCrop(canvas, label, pageNumber, cropPadding);
          const cropValidation = validateRoomCrop({
            metadata: crop.metadata,
            selectedLabel: label,
            roomLabels: planAnalysis.roomLabels,
            ocrObservations: ocrResult.observations,
            dimensionCandidates: planAnalysis.dimensionCandidates,
          });
          const nearbyDimensionCandidates = findNearbyDimensionCandidates(
            crop.metadata.cropBoundingBox,
            cropPadding,
            planAnalysis.dimensionCandidates,
          );

          const review = reviewMap.get(evaluation.candidateId);

          rooms.push({
            id: createId(),
            source: "ocr-deterministic",
            roomName: label.text,
            sourcePage: pageNumber,
            labelConfidence: label.confidence,
            labelClassification: label.classification,
            labelBoundingBox: label.boundingBox,
            filterClassification: evaluation.classification as "likelyRoom" | "possibleRoom",
            filterScore: evaluation.score,
            aiClassification: review?.classification ?? null,
            aiConfidence: review?.confidence ?? null,
            aiReason: review?.reason ?? [],
            cropDataUrl: crop.dataUrl,
            cropMetadata: crop.metadata,
            cropValidation,
            nearbyDimensionCandidates,
            evidence: [label.reason, ...evaluation.reasons, ...(review?.reason ?? []), ...cropValidation.reasons],
            status: cropValidation.status,
          });
          cropsGeneratedForPage += 1;
        } catch (cropError) {
          warnings.push(
            `Page ${pageNumber}: unable to generate a crop for "${label.text}" (${
              cropError instanceof Error ? cropError.message : "unknown error"
            }).`,
          );
        }

        await yieldToUi();
      }

      let roomDiscoveryForPage: AutomatedPageRoomDiscovery | undefined;
      if (options.pageRoomDiscoveryAiClient) {
        onProgress?.({
          phase: "discovering-rooms",
          currentPage: pageNumber,
          totalPages: pageCount,
          message: `Sending page ${pageNumber} to Gemini for independent room discovery...`,
          roomsDiscovered: rooms.length,
        });

        try {
          const discoveryImage = createPageReviewImage(canvas, options.roomDiscoveryImageMaxWidth ?? 1400);
          const discoveryResult = await options.pageRoomDiscoveryAiClient.discoverPageRooms({
            pageNumber,
            pageImageDataUrl: discoveryImage.dataUrl,
            pageImageWidth: discoveryImage.width,
            pageImageHeight: discoveryImage.height,
            ocrObservations: ocrResult.observations.slice(0, 150),
          });

          const validatedDiscovery = validateDiscoveredRooms({
            pageNumber,
            rooms: discoveryResult.rooms,
            geminiImageDimensions: { width: discoveryResult.pageImageWidth, height: discoveryResult.pageImageHeight },
            analysisImageDimensions: { width: canvas.width, height: canvas.height },
          });

          const usableDiscoveredRooms = validatedDiscovery.rooms.filter((room) => room.valid && !room.isDuplicate);
          let discoveryCropsGeneratedForPage = 0;

          for (const discoveredRoom of usableDiscoveredRooms) {
            onProgress?.({
              phase: "generating-crop",
              currentPage: pageNumber,
              totalPages: pageCount,
              message: `Generating crop for discovered room "${discoveredRoom.normalizedName}" on page ${pageNumber}...`,
              roomsDiscovered: rooms.length,
            });

            try {
              const crop = createRoomCropFromBoundingBox(
                canvas,
                discoveredRoom.analysisBoundingBox,
                discoveredRoom.normalizedName,
                discoveredRoom.confidence,
                pageNumber,
                cropPadding,
              );
              const cropValidation = validateDiscoveredRoomCrop({
                metadata: crop.metadata,
                selectedRoom: discoveredRoom,
                discoveredRooms: validatedDiscovery.rooms,
                dimensionCandidates: planAnalysis.dimensionCandidates,
              });
              const nearbyDimensionCandidates = findNearbyDimensionCandidates(
                crop.metadata.cropBoundingBox,
                cropPadding,
                planAnalysis.dimensionCandidates,
              );

              rooms.push({
                id: createId(),
                source: "gemini-discovery",
                roomName: discoveredRoom.normalizedName,
                sourcePage: pageNumber,
                cropDataUrl: crop.dataUrl,
                cropMetadata: crop.metadata,
                cropValidation,
                nearbyDimensionCandidates,
                evidence: [...discoveredRoom.evidence, ...discoveredRoom.validationReasons, ...cropValidation.reasons],
                status: cropValidation.status,
                discoveryConfidence: discoveredRoom.confidence,
                discoverySuspiciousPartialName: discoveredRoom.suspiciousPartialName,
                discoveryReviewRequired: discoveredRoom.reviewRequired,
              });
              discoveryCropsGeneratedForPage += 1;
            } catch (cropError) {
              warnings.push(
                `Page ${pageNumber}: unable to generate a discovery crop for "${discoveredRoom.normalizedName}" (${
                  cropError instanceof Error ? cropError.message : "unknown error"
                }).`,
              );
            }

            await yieldToUi();
          }

          roomDiscoveryForPage = {
            provider: discoveryResult.provider,
            geminiImageDimensions: { width: discoveryResult.pageImageWidth, height: discoveryResult.pageImageHeight },
            analysisImageDimensions: { width: canvas.width, height: canvas.height },
            rooms: validatedDiscovery.rooms,
            summary: { ...validatedDiscovery.summary, cropsGenerated: discoveryCropsGeneratedForPage },
          };
        } catch (discoveryError) {
          warnings.push(
            `Page ${pageNumber}: Gemini page-level room discovery failed; existing deterministic results are preserved (${
              discoveryError instanceof Error ? discoveryError.message : "unknown error"
            }).`,
          );
        }
      }

      pages.push({
        pageNumber,
        status: "analyzed",
        ocrObservationCount: ocrResult.observations.length,
        ocrConfidence: ocrResult.confidence,
        roomLabelsDetected: planAnalysis.roomLabels.length,
        cropsGenerated: cropsGeneratedForPage,
        roomLabelFilter,
        candidateReviews,
        roomDiscovery: roomDiscoveryForPage,
      });

      onProgress?.({
        phase: "page-complete",
        currentPage: pageNumber,
        totalPages: pageCount,
        message: `Finished page ${pageNumber} of ${pageCount}.`,
        roomsDiscovered: rooms.length,
      });
    } catch (pageError) {
      const message = pageError instanceof Error ? pageError.message : "Unknown error while analyzing this page.";
      warnings.push(`Page ${pageNumber}: ${message}`);
      pages.push({
        pageNumber,
        status: "error",
        ocrObservationCount: 0,
        ocrConfidence: 0,
        roomLabelsDetected: 0,
        cropsGenerated: 0,
        skipReason: message,
      });
    }
  }

  const allCandidateReviews = pages.flatMap((page) => page.candidateReviews ?? []);
  const allDiscoveredRooms = pages.flatMap((page) => page.roomDiscovery?.rooms ?? []);
  const summary = {
    totalPages: pageCount,
    analyzedPages: pages.filter((page) => page.status === "analyzed").length,
    skippedPages: pages.filter((page) => page.status === "skipped" || page.status === "error").length,
    roomLabelsFound: pages.reduce((sum, page) => sum + page.roomLabelsDetected, 0),
    cropsGenerated: rooms.length,
    ready: rooms.filter((room) => room.status === "ready").length,
    review: rooms.filter((room) => room.status === "review").length,
    insufficient: rooms.filter((room) => room.status === "insufficient").length,
    likelyRoomCandidates: pages.reduce((sum, page) => sum + (page.roomLabelFilter?.summary.likelyRoom ?? 0), 0),
    possibleRoomCandidates: pages.reduce((sum, page) => sum + (page.roomLabelFilter?.summary.possibleRoom ?? 0), 0),
    rejectedCandidates: pages.reduce((sum, page) => sum + (page.roomLabelFilter?.summary.rejected ?? 0), 0),
    duplicatesRemoved: pages.reduce((sum, page) => sum + (page.roomLabelFilter?.summary.duplicatesRemoved ?? 0), 0),
    aiReviewEnabled: Boolean(options.pageReviewAiClient),
    aiConfirmedRooms: allCandidateReviews.filter((review) => review.aiClassification === "confirmedRoom").length,
    aiNeedsReview: allCandidateReviews.filter((review) => review.aiClassification === "needsReview").length,
    aiRejectedNotRoom: allCandidateReviews.filter((review) => review.aiClassification === "notARoom").length,
    ocrPipelineCropsGenerated: rooms.filter((room) => room.source === "ocr-deterministic").length,
    roomDiscoveryEnabled: Boolean(options.pageRoomDiscoveryAiClient),
    discoveredRoomsTotal: allDiscoveredRooms.length,
    discoveredRoomsValid: allDiscoveredRooms.filter((room) => room.valid && !room.isDuplicate).length,
    discoveredRoomsSuspicious: allDiscoveredRooms.filter((room) => room.suspiciousPartialName).length,
    discoveredRoomsDuplicatesRemoved: allDiscoveredRooms.filter((room) => room.isDuplicate).length,
    discoveryPipelineCropsGenerated: rooms.filter((room) => room.source === "gemini-discovery").length,
  };

  const merge = mergeRoomCandidates(rooms);
  const finalRoomsWithAssociation: FinalRoomCandidateWithDimensions[] = merge.finalRooms.map((room) => ({
    ...room,
    dimensionAssociation: associateRoomDimensions(room),
  }));

  onProgress?.({
    phase: "reviewing-candidates",
    currentPage: pageCount,
    totalPages: pageCount,
    message: "Reviewing ambiguous room dimensions with Gemini (if enabled)...",
    roomsDiscovered: rooms.length,
  });

  const dimensionReview = await reviewRoomDimensions(finalRoomsWithAssociation, options.dimensionReviewAiClient);
  warnings.push(...dimensionReview.warnings);
  const finalRooms: FinalRoomCandidateWithDimensionReview[] = finalRoomsWithAssociation.map((room) => ({
    ...room,
    dimensionReview: dimensionReview.outcomes.get(room.id)!,
  }));

  onProgress?.({
    phase: "complete",
    currentPage: pageCount,
    totalPages: pageCount,
    message: "Analysis complete.",
    roomsDiscovered: rooms.length,
  });

  return {
    source: {
      fileName: file.name,
      pageCount,
      analyzedAt: new Date().toISOString(),
    },
    pages,
    rooms,
    finalRooms,
    mergeSummary: merge.summary,
    summary,
    warnings,
  };
}
