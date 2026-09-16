// Deterministic conversion of user-Accepted Final Room Review entries into
// RoomInput objects, using this app's existing RoomInput conventions and
// validateRoom() (validations.ts/projectValidator.ts) - no new validation rules
// invented here. Never fabricates a value: fields with no evidence (e.g. height_m)
// are left at the same "not yet entered" placeholder the manual workflow already
// uses (0 / false / "DRILLING"), and validateRoom() is what flags them for review.
import { uid } from "../../utils/uid";
import { fromDisplayLength } from "../../utils/display";
import { validateRoom, type RoomValidationResult } from "../../validations.ts/projectValidator";
import type { RoomInput } from "../../models/projectTypes";
import type { FinalRoomCandidateWithDimensionReview } from "./reviewRoomDimensions";

// The locally-edited (browser-only) approval state for one room, supplied by the
// Final Room Review UI. Only rooms the caller has already marked "accepted" should
// ever be passed in here - this module does not know about pending/rejected state.
export interface ApprovedRoomEdit {
  roomId: string;
  name: string;
  horizontalText: string;
  verticalText: string;
}

export interface ParsedFeetInches {
  feet: number;
  inches: number;
  decimalFeet: number;
  meters: number;
}

export interface ConvertedRoomInputResult {
  sourceRoomId: string;
  pageNumber: number;
  roomInput: RoomInput;
  validation: RoomValidationResult;
  parsedHorizontal: ParsedFeetInches | null;
  parsedVertical: ParsedFeetInches | null;
  reviewRequired: boolean;
  reviewReasons: string[];
}

// Deliberately independent of core/dimensionCandidates.ts's OCR-facing parser -
// this parses user-edited text (which may differ from any OCR candidate text),
// not raw OCR output, and must not change existing OCR detection behavior.
function parseFeetInchesText(rawText: string): { feet: number; inches: number; decimalFeet: number } | null {
  const text = rawText
    .trim()
    .replace(/[""″]/g, '"')
    .replace(/['']/g, "'")
    .replace(/\s+/g, " ");
  if (text.length === 0) return null;

  const plainNumber = text.match(/^(\d{1,3}(?:\.\d+)?)$/);
  if (plainNumber) {
    const decimalFeet = Number(plainNumber[1]);
    if (!Number.isFinite(decimalFeet) || decimalFeet <= 0) return null;
    const feet = Math.floor(decimalFeet);
    const inches = Number(((decimalFeet - feet) * 12).toFixed(2));
    return { feet, inches, decimalFeet };
  }

  const match = text.match(/^(\d{1,3})'\s*-?\s*(\d{1,2}(?:\.\d+)?(?:\s+\d+\/\d+)?)?"?$/);
  if (!match) return null;

  const feet = Number(match[1]);
  let inches = 0;
  if (match[2]) {
    const inchText = match[2].trim();
    const fraction = inchText.match(/^(\d+)\s+(\d+)\/(\d+)$/);
    inches = fraction
      ? Number(fraction[1]) + Number(fraction[2]) / Number(fraction[3])
      : Number(inchText);
  }

  if (!Number.isFinite(feet) || !Number.isFinite(inches) || feet <= 0 || feet > 200 || inches < 0 || inches >= 12) {
    return null;
  }

  return { feet, inches: Number(inches.toFixed(2)), decimalFeet: Number((feet + inches / 12).toFixed(4)) };
}

function parseFeetInchesToMeters(rawText: string): ParsedFeetInches | null {
  const parsed = parseFeetInchesText(rawText);
  if (!parsed) return null;
  const meters = fromDisplayLength("US", parsed.decimalFeet);
  if (meters == null || !Number.isFinite(meters) || meters <= 0) return null;
  return { ...parsed, meters };
}

export function convertApprovedRoomsToRoomInputs(
  finalRooms: FinalRoomCandidateWithDimensionReview[],
  approvedEdits: ApprovedRoomEdit[],
): ConvertedRoomInputResult[] {
  const roomsById = new Map(finalRooms.map((room) => [room.id, room]));

  return approvedEdits.flatMap((edit) => {
    const sourceRoom = roomsById.get(edit.roomId);
    if (!sourceRoom) return [];

    const parsedHorizontal = parseFeetInchesToMeters(edit.horizontalText);
    const parsedVertical = parseFeetInchesToMeters(edit.verticalText);
    const trimmedName = edit.name.trim();

    // Same "not yet entered" placeholders used by ManualPlanEntryPage.tsx's
    // addRoom() for a brand-new room - height/exterior wall/window/door area have
    // no evidence in a 2D plan and are never fabricated here.
    const roomInput: RoomInput = {
      id: uid(),
      name: trimmedName,
      length_m: parsedHorizontal?.meters ?? 0,
      width_m: parsedVertical?.meters ?? 0,
      height_m: 0,
      exteriorLen_m: 0,
      windowArea_m2: 0,
      doorArea_m2: 0,
      ceilingExposed: false,
      floorExposed: false,
      setpointC: 21,
      joistSpacing: 16,
      floorCover: "tile_stone",
      installMethod: "DRILLING",
      floorOnGround: false,
    };

    const validation = validateRoom(roomInput);
    const reviewReasons: string[] = [
      ...Object.values(validation.errors),
      ...Object.values(validation.incomplete),
    ];
    if (!parsedHorizontal) reviewReasons.push(`Horizontal dimension "${edit.horizontalText || "(empty)"}" could not be parsed; length was left at 0.`);
    if (!parsedVertical) reviewReasons.push(`Vertical dimension "${edit.verticalText || "(empty)"}" could not be parsed; width was left at 0.`);

    return [{
      sourceRoomId: sourceRoom.id,
      pageNumber: sourceRoom.pageNumber,
      roomInput,
      validation,
      parsedHorizontal,
      parsedVertical,
      reviewRequired: !validation.isValid || !validation.isComplete || !parsedHorizontal || !parsedVertical,
      reviewReasons,
    }];
  });
}
