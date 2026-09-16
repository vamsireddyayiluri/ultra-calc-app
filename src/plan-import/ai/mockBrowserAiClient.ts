import type {
  AiDraftAnalysis,
  AiPageRoomDiscoveryResult,
  AiPageRoomReviewResult,
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

function orientationFor(candidate: BrowserAiAnalysisInput["ocrDimensionCandidates"][number]): "horizontal" | "vertical" | "unknown" {
  const context = candidate.reason.toLowerCase();
  if (context.includes("horizontal")) return "horizontal";
  if (context.includes("vertical")) return "vertical";
  return "unknown";
}

export class MockBrowserAiClient implements BrowserAiClient, PageRoomReviewAiClient, PageRoomDiscoveryAiClient, RoomDimensionReviewAiClient {
  async analyzeRoomCrop(input: BrowserAiAnalysisInput): Promise<AiDraftAnalysis> {
    await new Promise((resolve) => window.setTimeout(resolve, 500));

    const dimensions = input.ocrDimensionCandidates.slice(0, 8).map((candidate) => ({
      rawText: candidate.originalText,
      normalizedText: candidate.normalizedText,
      feet: candidate.feet,
      inches: candidate.inches,
      decimalFeet: candidate.decimalFeet,
      orientation: orientationFor(candidate),
      confidence: Math.max(0, Math.min(1, candidate.confidence / 100)),
      evidence: "Mock browser provider echoed deterministic OCR evidence; no external AI call was made.",
    }));

    return {
      provider: "mock-browser",
      analyzedAt: new Date().toISOString(),
      room: {
        name: input.crop.roomLabelText,
        sourcePage: input.crop.sourcePage,
        crop: input.crop,
        dimensions,
        confidence: 0.5,
        reviewRequired: true,
        missingInformation: ["AI visual confirmation is not connected", "Room boundaries require manual review"],
        warnings: ["This is mock draft output and has not been analyzed by an AI provider."],
        evidence: [
          "Room label came from the selected OCR room-label candidate.",
          `Crop contains ${input.ocrDimensionCandidates.length} deterministic dimension candidate(s) before mock analysis.`,
        ],
      },
    };
  }

  async reviewPageRoomCandidates(input: BrowserPageRoomReviewInput): Promise<AiPageRoomReviewResult> {
    await new Promise((resolve) => window.setTimeout(resolve, 300));

    return {
      provider: "mock-browser",
      analyzedAt: new Date().toISOString(),
      pageNumber: input.pageNumber,
      reviews: input.candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        classification: candidate.deterministicClassification === "likelyRoom" ? "confirmedRoom" : "needsReview",
        confidence: candidate.deterministicClassification === "likelyRoom" ? 0.8 : 0.5,
        reason: [
          "Mock browser provider echoed the deterministic classification; no visual AI review was performed.",
        ],
      })),
    };
  }

  async discoverPageRooms(input: BrowserPageRoomDiscoveryInput): Promise<AiPageRoomDiscoveryResult> {
    await new Promise((resolve) => window.setTimeout(resolve, 300));

    const names = Array.from(new Set(
      (input.ocrObservations ?? [])
        .map((observation) => observation.text.trim())
        .filter((text) => /[A-Za-z]/.test(text) && text.length >= 3),
    )).slice(0, 6);
    if (names.length === 0) names.push("ROOM");

    const boxWidth = Math.max(40, Math.round(input.pageImageWidth / 6));
    const boxHeight = Math.max(20, Math.round(input.pageImageHeight / 20));

    return {
      provider: "mock-browser",
      analyzedAt: new Date().toISOString(),
      pageNumber: input.pageNumber,
      pageImageWidth: input.pageImageWidth,
      pageImageHeight: input.pageImageHeight,
      rooms: names.map((name, index) => {
        const column = index % 3;
        const row = Math.floor(index / 3);
        return {
          id: `page${input.pageNumber}-discovered${index}`,
          name: name.toUpperCase(),
          confidence: 0.4,
          boundingBox: {
            x: Math.min(Math.max(0, input.pageImageWidth - boxWidth), column * (boxWidth + 20) + 20),
            y: Math.min(Math.max(0, input.pageImageHeight - boxHeight), row * (boxHeight + 20) + 20),
            width: boxWidth,
            height: boxHeight,
          },
          evidence: ["Mock browser provider echoed an OCR observation; no visual AI discovery was performed."],
          reviewRequired: true,
        };
      }),
    };
  }

  async reviewRoomDimensions(input: BrowserRoomDimensionReviewInput): Promise<AiRoomDimensionReviewResult> {
    await new Promise((resolve) => window.setTimeout(resolve, 300));

    return {
      provider: "mock-browser",
      analyzedAt: new Date().toISOString(),
      review: {
        roomId: input.roomId,
        confidence: 0.5,
        dimensions: input.candidates.map((candidate) => ({
          candidateId: candidate.candidateId,
          role: candidate.deterministicRole === "additional" ? "extra" : candidate.deterministicRole,
          confidence: candidate.confidence / 100,
          evidence: ["Mock browser provider echoed the deterministic role; no visual AI review was performed."],
        })),
        missingInformation: [],
        warnings: ["This is mock dimension-review output and has not been analyzed by an AI provider."],
        evidence: [],
      },
    };
  }
}
