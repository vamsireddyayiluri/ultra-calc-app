// src/validations.ts/projectValidator.ts
//
// Framework-independent, deterministic validation layer for a project and
// its rooms. Wraps the existing `projectSchema`/`roomSchema` Zod schemas
// (this file does not redefine or duplicate their rules) and adds the
// incomplete/invalid/warning/valid classification described in
// docs/PROJECT_WORKFLOW.md §4b/§7 ("ProjectValidator").
//
// This module does not render UI, does not touch Firestore or
// localStorage, does not import React, and has no side effects — calling
// validateProject/validateRoom twice with the same input always produces
// the same result.

import { z } from "zod";
import { projectSchema } from "./projectSchema";
import { roomSchema } from "./roomSchema";
import { ProjectSettings, RoomInput } from "../models/projectTypes";

export type ProjectWithRooms = ProjectSettings & { rooms: RoomInput[] };

export type FieldStatus = "valid" | "incomplete" | "invalid";

export interface FieldValidation {
  status: FieldStatus;
  message?: string;
}

export interface RoomValidationResult {
  roomId: string;
  roomName: string;
  fields: Record<string, FieldValidation>;
  errors: Record<string, string>;
  incomplete: Record<string, string>;
  warnings: Record<string, string>;
  isValid: boolean;
  isComplete: boolean;
  status: FieldStatus;
}

export interface ProjectValidationResult {
  valid: boolean;
  complete: boolean;
  status: FieldStatus;

  projectErrors: Record<string, string>;
  projectIncomplete: Record<string, string>;
  projectWarnings: Record<string, string>;
  /** Mirrors RoomValidationResult.fields — one combined incomplete/invalid map for project-level fields. */
  projectFields: Record<string, FieldValidation>;

  roomErrors: Record<string, Record<string, string>>;
  roomIncomplete: Record<string, Record<string, string>>;
  roomWarnings: Record<string, Record<string, string>>;

  /** Convenience alias for projectWarnings — per-room warnings live under roomWarnings / rooms[id].warnings. */
  warnings: Record<string, string>;

  rooms: Record<string, RoomValidationResult>;

  summary: {
    totalErrors: number;
    totalIncomplete: number;
    totalWarnings: number;
    totalRooms: number;
    invalidRooms: number;
    incompleteRooms: number;
    completeRooms: number;
  };
}

/* ------------------------------------------------------------------------
   Field "emptiness" heuristics
   ------------------------------------------------------------------------
   The Zod schemas alone cannot distinguish "not yet filled in" from
   "filled in with a genuinely wrong value" for this app's actual data:
   ProjectPage.tsx's addRoom() / new-project initializer populate required
   numeric fields with concrete defaults (e.g. length_m: 0, name: "") rather
   than leaving them `undefined`, so a fresh room fails roomSchema's
   .positive() check the same way a user who deliberately typed "0" would.

   These maps encode, per field, what "still at its untouched default"
   looks like for THIS app — deliberately kept separate from (not a
   rewrite of) the Zod schemas' own pass/fail rules. A field only appears
   here if there's a safe, unambiguous way to tell "empty" apart from a
   legitimate value; fields where 0/false are themselves valid, complete
   answers (e.g. an interior room with no windows) are intentionally
   omitted so they're judged purely by the schema.
------------------------------------------------------------------------ */

const isBlank = (v: unknown): boolean =>
  v === undefined ||
  v === null ||
  (typeof v === "string" && v.trim() === "");

const ROOM_EMPTY_CHECKS: Partial<
  Record<keyof RoomInput, (room: RoomInput) => boolean>
> = {
  name: (r) => isBlank(r.name),
  // Exactly 0 is this app's own "not yet entered" sentinel for geometry
  // (see ProjectPage.tsx#addRoom()). A negative value is a different,
  // genuinely wrong state — deliberately left to fail as "invalid" via
  // roomSchema's .positive() check rather than being softened here.
  length_m: (r) => isBlank(r.length_m) || r.length_m === 0,
  width_m: (r) => isBlank(r.width_m) || r.width_m === 0,
  height_m: (r) => isBlank(r.height_m) || r.height_m === 0,
  setpointC: (r) => isBlank(r.setpointC),
  installMethod: (r) => isBlank(r.installMethod),
  // exteriorLen_m / windowArea_m2 / doorArea_m2 intentionally excluded:
  // 0 is a legitimate, complete value for these (e.g. a fully interior
  // room with no windows or doors), not "not yet entered".
};

// Human-readable labels for field keys — purely presentational, not a
// validation rule. Kept next to ROOM_EMPTY_CHECKS/PROJECT_EMPTY_CHECKS so
// this stays a single source of truth for "what does this field key
// mean" rather than each UI component inventing its own copy (which is
// exactly how a label could silently drift out of sync with the actual
// field key the validator reports).
export const ROOM_FIELD_LABELS: Partial<Record<keyof RoomInput, string>> = {
  name: "Room Name",
  setpointC: "Setpoint Temperature",
  length_m: "Length",
  width_m: "Width",
  height_m: "Height",
  exteriorLen_m: "Exterior Wall",
  windowArea_m2: "Windows",
  doorArea_m2: "Doors",
  installMethod: "Install Method",
};

export const PROJECT_FIELD_LABELS: Partial<Record<keyof ProjectSettings, string>> = {
  name: "Project Name",
  region: "Region",
  heatingSystem: "Heating System",
  address: "Address",
  standardsMode: "Standards Mode",
  insulationPeriod: "Insulation Period",
  indoorTempC: "Indoor Design Temperature",
  outdoorTempC: "Outdoor Design Temperature",
};

const PROJECT_EMPTY_CHECKS: Partial<
  Record<keyof ProjectSettings, (p: ProjectSettings) => boolean>
> = {
  name: (p) => isBlank(p.name),
  region: (p) => isBlank(p.region),
  address: (p) => isBlank(p.address),
  standardsMode: (p) => isBlank(p.standardsMode),
  insulationPeriod: (p) => isBlank(p.insulationPeriod),
  outdoorTempC: (p) => isBlank(p.outdoorTempC),
  // indoorTempC intentionally excluded: new projects default it to 21
  // (never left unset in practice), and 0°C is itself a plausible design
  // temperature in some climates, so there is no safe "0 means empty"
  // heuristic for this field the way there is for room dimensions.
};

function zodIssuesToMap(issues: z.ZodIssue[]): Record<string, string> {
  const map: Record<string, string> = {};
  for (const issue of issues) {
    const field = String(issue.path[0] ?? "_root");
    if (!(field in map)) map[field] = issue.message; // keep the first message per field
  }
  return map;
}

/**
 * Splits a raw Zod field->message error map into "invalid" (genuinely
 * wrong value) vs. "incomplete" (still at its not-yet-entered default),
 * using the emptiness heuristics above. A field that is empty is reported
 * as incomplete even if Zod also flagged it — e.g. a fresh room's
 * length_m: 0 fails roomSchema's .positive() check, but the honest
 * classification for a user is "not entered yet", not "entered wrong".
 */
function splitErrors<T>(
  rawErrors: Record<string, string>,
  data: T,
  emptyChecks: Partial<Record<string, (d: T) => boolean>>,
): { errors: Record<string, string>; incomplete: Record<string, string> } {
  const errors: Record<string, string> = {};
  const incomplete: Record<string, string> = {};

  for (const [field, message] of Object.entries(rawErrors)) {
    const isEmpty = emptyChecks[field]?.(data) ?? false;
    if (isEmpty) {
      incomplete[field] = message;
    } else {
      errors[field] = message;
    }
  }

  // A field the emptiness heuristic considers unset but that produced no
  // Zod issue at all (e.g. a field the schema doesn't cover yet, such as
  // joistSpacing/floorCover on RoomInput) is still surfaced as incomplete,
  // so future schema gaps don't silently hide missing data.
  for (const field of Object.keys(emptyChecks)) {
    if (field in rawErrors) continue;
    if (emptyChecks[field]?.(data)) {
      incomplete[field] = "This field is required.";
    }
  }

  return { errors, incomplete };
}

function rollupStatus(
  errors: Record<string, unknown>,
  incomplete: Record<string, unknown>,
): FieldStatus {
  if (Object.keys(errors).length > 0) return "invalid";
  if (Object.keys(incomplete).length > 0) return "incomplete";
  return "valid";
}

function buildFieldMap(
  errors: Record<string, string>,
  incomplete: Record<string, string>,
): Record<string, FieldValidation> {
  const fields: Record<string, FieldValidation> = {};
  for (const [field, message] of Object.entries(incomplete)) {
    fields[field] = { status: "incomplete", message };
  }
  for (const [field, message] of Object.entries(errors)) {
    fields[field] = { status: "invalid", message };
  }
  return fields;
}

/* ------------------------------------------------------------------------
   Room-level validation
------------------------------------------------------------------------ */

export function validateRoom(room: RoomInput): RoomValidationResult {
  const parsed = roomSchema.safeParse(room);
  const rawErrors = parsed.success ? {} : zodIssuesToMap(parsed.error.issues);
  const { errors, incomplete } = splitErrors(rawErrors, room, ROOM_EMPTY_CHECKS);

  // Room-level warning rules are intentionally left empty in this phase.
  // physics.ts already computes its own business warnings (e.g. "High
  // load — supplemental heat may be required") inside RoomResults — this
  // validator deliberately does not duplicate or re-derive those, per
  // BUSINESS_RULES.md's "never introduce duplicate logic" principle,
  // generalized beyond unit conversion to business rules in general. This
  // bucket exists so future, explicitly-approved room-level warning rules
  // (that are NOT already owned by physics.ts) have a place to plug in
  // without changing this function's shape.
  const warnings: Record<string, string> = {};

  return {
    roomId: room.id,
    roomName: room.name,
    fields: buildFieldMap(errors, incomplete),
    errors,
    incomplete,
    warnings,
    isValid: Object.keys(errors).length === 0,
    isComplete: Object.keys(incomplete).length === 0,
    status: rollupStatus(errors, incomplete),
  };
}

/* ------------------------------------------------------------------------
   Project-level validation (project fields only, no rooms)
------------------------------------------------------------------------ */

function validateProjectFields(project: ProjectSettings): {
  errors: Record<string, string>;
  incomplete: Record<string, string>;
  warnings: Record<string, string>;
} {
  const parsed = projectSchema.safeParse(project);
  const rawErrors = parsed.success ? {} : zodIssuesToMap(parsed.error.issues);
  const { errors, incomplete } = splitErrors(rawErrors, project, PROJECT_EMPTY_CHECKS);

  // One deliberately minimal, deterministic cross-field warning, kept as
  // the single example proving the "warning" category is wired up end to
  // end. Additional cross-field/business warnings should be added here
  // only once specifically approved — this is infrastructure, not a
  // place to unilaterally invent new business rules.
  const warnings: Record<string, string> = {};
  if (
    typeof project.indoorTempC === "number" &&
    typeof project.outdoorTempC === "number" &&
    project.outdoorTempC > project.indoorTempC
  ) {
    warnings.outdoorTempC =
      "Outdoor design temperature is higher than indoor design temperature — double-check these values.";
  }

  return { errors, incomplete, warnings };
}

/* ------------------------------------------------------------------------
   Full project (settings + rooms) validation — main entry point
------------------------------------------------------------------------ */

export function validateProject(project: ProjectWithRooms): ProjectValidationResult {
  const {
    errors: projectErrors,
    incomplete: projectIncomplete,
    warnings: projectWarnings,
  } = validateProjectFields(project);

  const rooms: Record<string, RoomValidationResult> = {};
  const roomErrors: Record<string, Record<string, string>> = {};
  const roomIncomplete: Record<string, Record<string, string>> = {};
  const roomWarnings: Record<string, Record<string, string>> = {};

  let invalidRooms = 0;
  let incompleteRooms = 0;
  let completeRooms = 0;
  let totalErrors = Object.keys(projectErrors).length;
  let totalIncomplete = Object.keys(projectIncomplete).length;
  let totalWarnings = Object.keys(projectWarnings).length;

  for (const room of project.rooms) {
    const result = validateRoom(room);
    rooms[room.id] = result;

    if (Object.keys(result.errors).length > 0) roomErrors[room.id] = result.errors;
    if (Object.keys(result.incomplete).length > 0) roomIncomplete[room.id] = result.incomplete;
    if (Object.keys(result.warnings).length > 0) roomWarnings[room.id] = result.warnings;

    totalErrors += Object.keys(result.errors).length;
    totalIncomplete += Object.keys(result.incomplete).length;
    totalWarnings += Object.keys(result.warnings).length;

    if (result.status === "invalid") invalidRooms++;
    else if (result.status === "incomplete") incompleteRooms++;
    else completeRooms++;
  }

  const valid = Object.keys(projectErrors).length === 0 && invalidRooms === 0;
  const complete =
    valid && Object.keys(projectIncomplete).length === 0 && incompleteRooms === 0;
  const status: FieldStatus = !valid ? "invalid" : !complete ? "incomplete" : "valid";

  return {
    valid,
    complete,
    status,
    projectErrors,
    projectIncomplete,
    projectWarnings,
    projectFields: buildFieldMap(projectErrors, projectIncomplete),
    roomErrors,
    roomIncomplete,
    roomWarnings,
    warnings: projectWarnings,
    rooms,
    summary: {
      totalErrors,
      totalIncomplete,
      totalWarnings,
      totalRooms: project.rooms.length,
      invalidRooms,
      incompleteRooms,
      completeRooms,
    },
  };
}
