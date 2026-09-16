// Optional Gemini review of the deterministic dimension association for one room at
// a time. Only runs for rooms already flagged reviewRequired/ambiguous by
// associateRoomDimensions - high-confidence rooms never trigger a Gemini call. This
// stage refines the existing deterministic candidates; it never invents new ones and
// falls back to the deterministic result if Gemini fails.
import type { FinalRoomCandidateWithDimensions, RoomDimensionEvidence } from "./associateRoomDimensions";
import type {
  AiDimensionCandidateInput,
  AiRoomDimensionReview,
  RoomDimensionReviewAiClient,
} from "../ai/contracts";

export type RoomDimensionReviewStatus = "not-run" | "skipped-high-confidence" | "reviewed" | "failed";

export interface RoomDimensionRecommendation {
  primaryHorizontal: RoomDimensionEvidence | null;
  primaryVertical: RoomDimensionEvidence | null;
  horizontalSource: "deterministic" | "gemini";
  verticalSource: "deterministic" | "gemini";
}

export interface RoomDimensionReviewOutcome {
  roomId: string;
  status: RoomDimensionReviewStatus;
  reason?: string;
  provider?: "mock-browser" | "gemini-browser";
  aiReview?: AiRoomDimensionReview;
  recommendation: RoomDimensionRecommendation;
  disagreement: boolean;
  disagreementReasons: string[];
}

export type FinalRoomCandidateWithDimensionReview = FinalRoomCandidateWithDimensions & {
  dimensionReview: RoomDimensionReviewOutcome;
};

interface DimensionEntry {
  candidateId: string;
  evidence: RoomDimensionEvidence;
}

function collectDimensionEntries(room: FinalRoomCandidateWithDimensions): DimensionEntry[] {
  const evidenceList: RoomDimensionEvidence[] = [];
  if (room.dimensionAssociation.primaryHorizontal) evidenceList.push(room.dimensionAssociation.primaryHorizontal);
  if (room.dimensionAssociation.primaryVertical) evidenceList.push(room.dimensionAssociation.primaryVertical);
  evidenceList.push(...room.dimensionAssociation.additionalDimensions);
  return evidenceList.map((evidence, index) => ({ candidateId: `${room.id}-dim${index}`, evidence }));
}

function toAiCandidateInput(entry: DimensionEntry, room: FinalRoomCandidateWithDimensions): AiDimensionCandidateInput {
  const deterministicRole = room.dimensionAssociation.primaryHorizontal === entry.evidence
    ? "primaryHorizontal"
    : room.dimensionAssociation.primaryVertical === entry.evidence
      ? "primaryVertical"
      : "additional";
  return {
    candidateId: entry.candidateId,
    rawText: entry.evidence.candidate.originalText,
    normalizedText: entry.evidence.candidate.normalizedText,
    feet: entry.evidence.candidate.feet,
    inches: entry.evidence.candidate.inches,
    decimalFeet: entry.evidence.candidate.decimalFeet,
    confidence: entry.evidence.candidate.confidence,
    classification: entry.evidence.candidate.classification,
    orientation: entry.evidence.orientation,
    relation: entry.evidence.relation,
    deterministicRole,
    reasons: entry.evidence.reasons,
  };
}

// Resolves one axis (horizontal or vertical): prefer Gemini's pick when it made one;
// if Gemini explicitly rejected the deterministic pick and offered no replacement,
// drop it rather than keep evidence Gemini flagged as unrelated; otherwise keep the
// deterministic pick.
function resolveAxis(
  deterministicPick: RoomDimensionEvidence | null,
  geminiPick: RoomDimensionEvidence | null,
  deterministicWasRejectedByGemini: boolean,
): { value: RoomDimensionEvidence | null; source: "deterministic" | "gemini" } {
  if (geminiPick) return { value: geminiPick, source: "gemini" };
  if (deterministicWasRejectedByGemini) return { value: null, source: "gemini" };
  return { value: deterministicPick, source: "deterministic" };
}

export async function reviewRoomDimensions(
  rooms: FinalRoomCandidateWithDimensions[],
  client: RoomDimensionReviewAiClient | undefined,
): Promise<{ outcomes: Map<string, RoomDimensionReviewOutcome>; warnings: string[] }> {
  const outcomes = new Map<string, RoomDimensionReviewOutcome>();
  const warnings: string[] = [];

  for (const room of rooms) {
    const deterministicRecommendation: RoomDimensionRecommendation = {
      primaryHorizontal: room.dimensionAssociation.primaryHorizontal,
      primaryVertical: room.dimensionAssociation.primaryVertical,
      horizontalSource: "deterministic",
      verticalSource: "deterministic",
    };

    if (!client) {
      outcomes.set(room.id, {
        roomId: room.id,
        status: "not-run",
        recommendation: deterministicRecommendation,
        disagreement: false,
        disagreementReasons: [],
      });
      continue;
    }

    const entries = collectDimensionEntries(room);

    if (!room.dimensionAssociation.reviewRequired) {
      outcomes.set(room.id, {
        roomId: room.id,
        status: "skipped-high-confidence",
        reason: "Deterministic dimension association is already confident; Gemini review was not requested for this room.",
        recommendation: deterministicRecommendation,
        disagreement: false,
        disagreementReasons: [],
      });
      continue;
    }

    if (entries.length === 0) {
      outcomes.set(room.id, {
        roomId: room.id,
        status: "skipped-high-confidence",
        reason: "No dimension candidates are available near this room; there is nothing for Gemini to review.",
        recommendation: deterministicRecommendation,
        disagreement: false,
        disagreementReasons: [],
      });
      continue;
    }

    try {
      const deterministicHorizontalId = entries.find((entry) => entry.evidence === room.dimensionAssociation.primaryHorizontal)?.candidateId ?? null;
      const deterministicVerticalId = entries.find((entry) => entry.evidence === room.dimensionAssociation.primaryVertical)?.candidateId ?? null;

      const aiResult = await client.reviewRoomDimensions({
        roomId: room.id,
        roomName: room.roomName,
        cropDataUrl: room.cropDataUrl,
        candidates: entries.map((entry) => toAiCandidateInput(entry, room)),
        deterministicPrimaryHorizontalId: deterministicHorizontalId,
        deterministicPrimaryVerticalId: deterministicVerticalId,
      });

      const byId = new Map(entries.map((entry) => [entry.candidateId, entry.evidence]));
      const horizontalEntry = aiResult.review.dimensions.find((entry) => entry.role === "primaryHorizontal");
      const verticalEntry = aiResult.review.dimensions.find((entry) => entry.role === "primaryVertical");
      const geminiHorizontal = horizontalEntry ? byId.get(horizontalEntry.candidateId) ?? null : null;
      const geminiVertical = verticalEntry ? byId.get(verticalEntry.candidateId) ?? null : null;

      const rejectedDeterministicHorizontal = deterministicHorizontalId
        ? aiResult.review.dimensions.some((entry) => entry.candidateId === deterministicHorizontalId && entry.role === "rejected")
        : false;
      const rejectedDeterministicVertical = deterministicVerticalId
        ? aiResult.review.dimensions.some((entry) => entry.candidateId === deterministicVerticalId && entry.role === "rejected")
        : false;

      const horizontalResolution = resolveAxis(room.dimensionAssociation.primaryHorizontal, geminiHorizontal, rejectedDeterministicHorizontal);
      const verticalResolution = resolveAxis(room.dimensionAssociation.primaryVertical, geminiVertical, rejectedDeterministicVertical);

      const disagreementReasons: string[] = [];
      if (geminiHorizontal && room.dimensionAssociation.primaryHorizontal && geminiHorizontal !== room.dimensionAssociation.primaryHorizontal) {
        disagreementReasons.push(
          `Gemini selected a different primary horizontal dimension ("${geminiHorizontal.candidate.originalText}") than the deterministic pick ("${room.dimensionAssociation.primaryHorizontal.candidate.originalText}").`,
        );
      }
      if (geminiVertical && room.dimensionAssociation.primaryVertical && geminiVertical !== room.dimensionAssociation.primaryVertical) {
        disagreementReasons.push(
          `Gemini selected a different primary vertical dimension ("${geminiVertical.candidate.originalText}") than the deterministic pick ("${room.dimensionAssociation.primaryVertical.candidate.originalText}").`,
        );
      }
      if (rejectedDeterministicHorizontal) {
        disagreementReasons.push(
          `Gemini rejected the deterministic primary horizontal dimension ("${room.dimensionAssociation.primaryHorizontal?.candidate.originalText}") as not belonging to this room.`,
        );
      }
      if (rejectedDeterministicVertical) {
        disagreementReasons.push(
          `Gemini rejected the deterministic primary vertical dimension ("${room.dimensionAssociation.primaryVertical?.candidate.originalText}") as not belonging to this room.`,
        );
      }

      outcomes.set(room.id, {
        roomId: room.id,
        status: "reviewed",
        provider: aiResult.provider,
        aiReview: aiResult.review,
        recommendation: {
          primaryHorizontal: horizontalResolution.value,
          primaryVertical: verticalResolution.value,
          horizontalSource: horizontalResolution.source,
          verticalSource: verticalResolution.source,
        },
        disagreement: disagreementReasons.length > 0,
        disagreementReasons,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      warnings.push(`Room "${room.roomName}" (page ${room.pageNumber}): Gemini dimension review failed, keeping deterministic association (${message}).`);
      outcomes.set(room.id, {
        roomId: room.id,
        status: "failed",
        reason: message,
        recommendation: deterministicRecommendation,
        disagreement: false,
        disagreementReasons: [],
      });
    }
  }

  return { outcomes, warnings };
}
