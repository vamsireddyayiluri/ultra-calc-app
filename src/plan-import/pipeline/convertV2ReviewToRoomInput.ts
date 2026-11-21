import type {
  JoistSpacingOption,
  PlanImportV2ReviewMetadata,
  PlanImportV2RoomReviewMetadata,
  PlanImportV2SelectedDimension,
  RoomInput,
} from "../../models/projectTypes";
import { createEmptyRoom } from "../../utils/projectFactory";
import { validateRoom, type RoomValidationResult } from "../../validations.ts/projectValidator";
import type {
  V2ExtractionResult,
  V2ReviewAxisDraft,
  V2ReviewRoomDraft,
  V2ReviewValidation,
} from "../api/experimentalV2Client";
import { isEligibleV2Association } from "./v2Eligibility";

export type V2RoomReviewDecision = "pending" | "accepted" | "excluded";

export interface V2AxisReviewSelection {
  kind: "evidence" | "human_correction" | "missing";
  associationId: string;
  rawText: string;
  sourceAssociationId: string;
}

export interface V2RoomReviewSelection {
  reviewRoomId: string;
  sourceRoomId: string | null;
  sourcePageNumber: number;
  decision: V2RoomReviewDecision;
  name: string;
  duplicateOfReviewRoomId: string;
  length: V2AxisReviewSelection;
  width: V2AxisReviewSelection;
  // Phase B: reviewer dismissed the joined windows/exterior-doors area for
  // this room - never populate it into the created RoomInput when cleared.
  windowsAreaCleared?: boolean;
  doorsAreaCleared?: boolean;
}

export interface ConvertedV2RoomInput {
  sourceRoomId: string;
  reviewRoomId: string;
  pageNumber: number;
  roomInput: RoomInput;
  validation: RoomValidationResult;
  selectedLength: PlanImportV2SelectedDimension | null;
  selectedWidth: PlanImportV2SelectedDimension | null;
  reviewReasons: string[];
}

export interface PreparedV2ReviewedImport {
  review: PlanImportV2ReviewMetadata;
  convertedRooms: ConvertedV2RoomInput[];
  fileName: string;
  provider: string;
  warnings: string[];
}

function axisDraft(selection: V2AxisReviewSelection): V2ReviewAxisDraft {
  if (selection.kind === "evidence") {
    return { kind: "evidence", association_id: selection.associationId };
  }
  if (selection.kind === "human_correction") {
    return {
      kind: "human_correction",
      raw_text: selection.rawText,
      source_association_id: selection.sourceAssociationId || null,
    };
  }
  return { kind: "missing" };
}

export function buildV2ReviewDraftRooms(
  selections: Record<string, V2RoomReviewSelection>,
): V2ReviewRoomDraft[] {
  return Object.values(selections).map((selection) => ({
    review_room_id: selection.reviewRoomId,
    source_room_id: selection.sourceRoomId,
    source_page_number: selection.sourcePageNumber,
    decision: selection.decision,
    reviewed_name: selection.name,
    duplicate_of_review_room_id: selection.duplicateOfReviewRoomId || null,
    length: axisDraft(selection.length),
    width: axisDraft(selection.width),
  }));
}

function selectedDimension(
  axis: V2ReviewValidation["rooms"][number]["length"],
): PlanImportV2SelectedDimension | null {
  if (axis.kind === "missing" || axis.meters === null || axis.raw_text === null || axis.origin === null) return null;
  return {
    kind: axis.kind,
    origin: axis.origin,
    associationId: axis.association_id,
    dimensionId: axis.dimension_id,
    rawText: axis.raw_text,
    meters: axis.meters,
    evidenceIds: axis.evidence_ids,
  };
}

function assertionFailure(technicalMessage: string): never {
  console.error(`Plan import review validation mismatch: ${technicalMessage}`);
  throw new Error("This room's measurements didn't match what we expected. Please review it again before continuing.");
}

function assertValidatedAxis(
  result: V2ExtractionResult,
  sourceRoomId: string | null,
  axisName: "length" | "width",
  axis: V2ReviewValidation["rooms"][number]["length"],
): void {
  if (axis.kind === "missing") {
    if (axis.meters !== null || axis.raw_text !== null || axis.association_id !== null || axis.dimension_id !== null) {
      assertionFailure(`${axisName} missing selection contains unexpected dimension data.`);
    }
    return;
  }
  if (!axis.raw_text?.trim() || axis.meters === null || !Number.isFinite(axis.meters) || axis.meters <= 0) {
    assertionFailure(`${axisName} review value is not a positive parsed dimension.`);
  }
  if (axis.kind === "human_correction") {
    if (axis.origin !== "user_entered" || axis.dimension_id !== null) {
      assertionFailure(`${axisName} correction does not have user-entered provenance.`);
    }
    return;
  }
  if (!sourceRoomId || !axis.association_id || !axis.dimension_id || axis.origin !== "printed") {
    assertionFailure(`${axisName} evidence selection has incomplete printed provenance.`);
  }
  if (!isEligibleV2Association(result, sourceRoomId, axisName, axis.association_id)) {
    assertionFailure(`${axisName} selection was excluded from the final application mapping.`);
  }
  const association = result.associations.find((item) => item.association_id === axis.association_id);
  const dimension = result.dimensions.find((item) => item.dimension_id === axis.dimension_id);
  if (
    !association
    || association.dimension_id !== axis.dimension_id
    || !dimension?.parsed
    || Math.abs(dimension.parsed.meters - axis.meters) > 1e-9
    || dimension.raw_text !== axis.raw_text
  ) {
    assertionFailure(`${axisName} validated selection does not match immutable extraction evidence.`);
  }
}

export function prepareV2ReviewedImport(
  result: V2ExtractionResult,
  validation: V2ReviewValidation,
  roomReviews: Record<string, V2RoomReviewSelection> = {},
  reviewedAt = Date.now(),
): PreparedV2ReviewedImport {
  if (validation.evidence_run_id !== result.run.run_id) {
    throw new Error("This review no longer matches the latest scan. Please review your rooms again.");
  }
  const sourceRooms = new Map(result.rooms.map((room) => [room.room_id, room]));
  const associations = new Map(result.associations.map((item) => [item.association_id, item]));
  const dimensions = new Map(result.dimensions.map((item) => [item.dimension_id, item]));
  const observations = new Map(result.text_observations.map((item) => [item.observation_id, item]));
  const envelopeByRoomId = new Map((result.room_envelope ?? []).map((item) => [item.room_id, item]));
  const nameByReviewRoomId = new Map(validation.rooms.map((item) => [item.review_room_id, item.reviewed_name]));
  const reviewRooms: PlanImportV2RoomReviewMetadata[] = [];
  const convertedRooms: ConvertedV2RoomInput[] = [];
  const events: PlanImportV2ReviewMetadata["events"] = [];

  for (const room of validation.rooms) {
    assertValidatedAxis(result, room.source_room_id, "length", room.length);
    assertValidatedAxis(result, room.source_room_id, "width", room.width);
    const selectedLength = selectedDimension(room.length);
    const selectedWidth = selectedDimension(room.width);
    const evidenceIds = Array.from(new Set([
      ...(room.source_room_id ? sourceRooms.get(room.source_room_id)?.evidence_ids ?? [] : []),
      ...(selectedLength?.evidenceIds ?? []),
      ...(selectedWidth?.evidenceIds ?? []),
    ]));
    const reviewMetadata: PlanImportV2RoomReviewMetadata = {
      roomId: room.review_room_id,
      sourceRoomId: room.source_room_id,
      sourcePageNumber: room.source_page_number,
      decision: room.decision,
      reviewedName: room.reviewed_name,
      duplicateOfRoomId: room.duplicate_of_review_room_id,
      length: selectedLength,
      width: selectedWidth,
      evidenceIds,
      reviewReasons: [],
    };
    if (!room.source_room_id) {
      events.push({
        eventId: `${room.review_room_id}:room:added`, reviewedAt, reviewRoomId: room.review_room_id,
        sourceRoomId: null, field: "room", action: "added", originalValue: null,
        reviewedValue: room.reviewed_name, provenance: "human_review", evidenceIds: [],
      });
    } else {
      const source = sourceRooms.get(room.source_room_id);
      const originalName = source?.label_observation_ids
        .map((id) => observations.get(id)?.raw_text)
        .filter(Boolean)
        .join(" / ") ?? "";
      if (originalName && originalName !== room.reviewed_name) {
        events.push({
          eventId: `${room.review_room_id}:name:corrected`, reviewedAt, reviewRoomId: room.review_room_id,
          sourceRoomId: room.source_room_id, field: "name", action: "corrected", originalValue: originalName,
          reviewedValue: room.reviewed_name, provenance: "human_review", evidenceIds: source?.label_observation_ids ?? [],
        });
      }
    }
    for (const [field, selected] of [["length", selectedLength], ["width", selectedWidth]] as const) {
      if (selected?.kind === "human_correction") {
        const sourceAssociation = selected.associationId ? associations.get(selected.associationId) : undefined;
        const originalValue = sourceAssociation
          ? dimensions.get(sourceAssociation.dimension_id)?.raw_text ?? null
          : null;
        events.push({
          eventId: `${room.review_room_id}:${field}:corrected`, reviewedAt, reviewRoomId: room.review_room_id,
          sourceRoomId: room.source_room_id, field, action: "corrected", originalValue,
          reviewedValue: selected.rawText, provenance: "human_review", evidenceIds: selected.evidenceIds,
        });
      } else if (room.decision === "accepted" && !selected) {
        events.push({
          eventId: `${room.review_room_id}:${field}:missing`, reviewedAt, reviewRoomId: room.review_room_id,
          sourceRoomId: room.source_room_id, field, action: "left_missing", originalValue: null,
          reviewedValue: null, provenance: "human_review", evidenceIds: [],
        });
      }
    }
    if (room.decision === "excluded") {
      events.push({
        eventId: `${room.review_room_id}:room:${room.duplicate_of_review_room_id ? "duplicate" : "excluded"}`,
        reviewedAt, reviewRoomId: room.review_room_id, sourceRoomId: room.source_room_id, field: "room",
        action: room.duplicate_of_review_room_id ? "marked_duplicate" : "excluded", originalValue: room.source_room_id,
        reviewedValue: room.duplicate_of_review_room_id, provenance: "human_review", evidenceIds,
      });
    }
    if (room.decision !== "accepted") {
      reviewMetadata.reviewReasons.push(
        room.duplicate_of_review_room_id
          ? `Excluded as a duplicate of ${nameByReviewRoomId.get(room.duplicate_of_review_room_id) || "another room"}.`
          : room.decision === "excluded" ? "Excluded during review." : "Still needs review.",
      );
      reviewRooms.push(reviewMetadata);
      continue;
    }
    if (
      selectedLength?.kind === "evidence" && selectedWidth?.kind === "evidence" && (
        (selectedLength.associationId && selectedLength.associationId === selectedWidth.associationId)
        || (selectedLength.dimensionId && selectedLength.dimensionId === selectedWidth.dimensionId)
      )
    ) {
      throw new Error(`${room.reviewed_name || "This room"} can't use the same measurement for both length and width. Please choose a different value for one of them.`);
    }
    const envelope = room.source_room_id ? envelopeByRoomId.get(room.source_room_id) : undefined;
    const reviewSelection = roomReviews[room.review_room_id];
    const roomInput: RoomInput = {
      ...createEmptyRoom(room.reviewed_name),
      length_m: selectedLength?.meters ?? 0,
      width_m: selectedWidth?.meters ?? 0,
      // Never bake in createEmptyRoom's generic 21C default for an imported
      // room - the review workbench has no per-room setpoint field, so this
      // was never an explicit human override. Leaving it unset lets
      // calculateRoom() correctly fall back to the project's own indoor
      // design temperature (which may already reflect a value confidently
      // extracted from this plan's title block - see project_metadata.py)
      // instead of silently shadowing it with a one-size-fits-all default.
      setpointC: undefined,
      // Deterministic, zero-extra-vision-call Phase A envelope enrichment -
      // only overrides createEmptyRoom's defaults when confidently found.
      ...(envelope?.ceiling_height ? { height_m: envelope.ceiling_height.value } : {}),
      ...(envelope?.joist_spacing_in ? { joistSpacing: envelope.joist_spacing_in.value as JoistSpacingOption } : {}),
      ...(envelope?.floor_on_ground != null ? { floorOnGround: envelope.floor_on_ground } : {}),
      // Phase B: confirmed windows/exterior-doors area from the schedule join,
      // unless the reviewer explicitly cleared it in the workbench.
      ...(envelope?.windows_area_m2 && !reviewSelection?.windowsAreaCleared
        ? { windowArea_m2: envelope.windows_area_m2.value } : {}),
      ...(envelope?.doors_area_m2 && !reviewSelection?.doorsAreaCleared
        ? { doorArea_m2: envelope.doors_area_m2.value } : {}),
    };
    const roomValidation = validateRoom(roomInput);
    const reviewReasons = [
      ...(!selectedLength ? ["Length is missing and must be completed in the room editor."] : []),
      ...(!selectedWidth ? ["Width is missing and must be completed in the room editor."] : []),
      ...Object.values(roomValidation.errors),
      ...Object.values(roomValidation.incomplete),
    ];
    reviewMetadata.reviewReasons = reviewReasons;
    reviewRooms.push(reviewMetadata);
    convertedRooms.push({
      sourceRoomId: room.source_room_id ?? room.review_room_id,
      reviewRoomId: room.review_room_id,
      pageNumber: room.source_page_number,
      roomInput,
      validation: roomValidation,
      selectedLength,
      selectedWidth,
      reviewReasons,
    });
  }

  const providers = Array.from(new Set(result.run.provider_usage.map((item) => `${item.provider}:${item.model}`)));
  return {
    review: {
      schemaVersion: "plan-review/1.1",
      evidenceSchemaVersion: result.schema_version,
      pipelineVersion: result.pipeline_version,
      runId: result.run.run_id,
      documentId: result.document.document_id,
      reviewedAt,
      reviewerId: null,
      rooms: reviewRooms,
      events,
    },
    convertedRooms,
    fileName: result.document.filename,
    provider: providers.join(", ") || "experimental-v2",
    warnings: result.warnings.map((warning) => `${warning.code}: ${warning.message}`),
  };
}
