// src/utils/projectDirtyTracker.ts
//
// Framework-independent change-detection core for a project and its
// rooms. No React, no I/O, no mutation of its inputs — given two
// snapshots, it reports what differs, and given a small set of already-
// computed facts, it derives one headline ProjectStatus. The React-facing
// hook (src/hooks/useProjectDirtyTracker.ts) owns *when* snapshots are
// taken and *how* they're stored; this module only knows how to compare
// them and how to label the result.
//
// This module does not know how to save anything, does not touch
// Firestore/localStorage, and does not decide when a save should happen —
// that is deliberately left to future phases (autosave, manual save,
// drafts), which only need to call the hook's markSaved()/markSaving()/
// markSaveError() at the right moments. Nothing here needs to change for
// those phases to exist.

import { ProjectSettings, RoomInput } from "../models/projectTypes";
import { FieldStatus } from "../validations.ts/projectValidator";

export type ProjectWithRooms = ProjectSettings & { rooms: RoomInput[] };

/** Reserved for future save-wiring phases — this module never produces "saving"/"error" itself. */
export type SaveState = "idle" | "saving" | "error";

/**
 * One headline label combining persistence state (has this been saved,
 * is it dirty) with validation state (reused from the existing validator,
 * never re-derived here). See deriveProjectStatus() for the precedence
 * rules between these two axes.
 */
export type ProjectStatus =
  | "invalid" // validation reports at least one error — always takes priority
  | "draft" // never successfully saved through this system yet, or has pending edits that aren't yet valid+complete
  | "readyToSave" // has pending edits AND validation is complete+valid — nothing stopping a save right now
  | "incomplete" // matches the last saved snapshot (nothing pending), but validation still reports incomplete fields
  | "saved" // matches the last saved snapshot, fully valid and complete
  | "saving" // reserved: a save is in flight (set via markSaving() in a future phase)
  | "error"; // reserved: the last save attempt failed (set via markSaveError() in a future phase)

export interface ProjectDiff {
  changedFields: string[];
  changedRooms: string[];
}

const isSameValue = (a: unknown, b: unknown): boolean => Object.is(a, b);

/** Reads a field by name off an object typed with known keys, for generic key-set iteration. */
function getField(obj: object, key: string): unknown {
  return (obj as unknown as Record<string, unknown>)[key];
}

/**
 * Compares two project snapshots and reports which top-level project
 * fields and which room ids differ.
 *
 * Relies on this codebase's existing, documented convention of always
 * *replacing* (never mutating) RoomInput/ProjectSettings via spread (see
 * ../../CLAUDE.md §5/§7): an unchanged room keeps the exact same object
 * reference after an unrelated edit elsewhere in the project, so most
 * rooms are skipped with a single Object.is() check instead of a full
 * field-by-field comparison every render. Only a room whose reference
 * actually changed gets the (still shallow, not deep) per-field
 * comparison, to report *which* fields changed. This avoids doing a deep
 * comparison of the whole project on every render.
 *
 * If `previous` is null, everything in `next` is reported as changed —
 * "no known baseline" is treated as "everything is new".
 */
export function diffProjects(
  previous: ProjectWithRooms | null,
  next: ProjectWithRooms,
): ProjectDiff {
  if (!previous) {
    return {
      changedFields: Object.keys(next).filter((k) => k !== "rooms"),
      changedRooms: next.rooms.map((r) => r.id),
    };
  }

  const changedFields: string[] = [];
  const fieldKeys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  fieldKeys.delete("rooms");
  fieldKeys.delete("id"); // identity, not user-edited data
  for (const key of fieldKeys) {
    const a = getField(previous, key);
    const b = getField(next, key);
    if (!isSameValue(a, b)) changedFields.push(key);
  }

  const changedRooms: string[] = [];
  const previousById = new Map(previous.rooms.map((r) => [r.id, r]));
  const nextIds = new Set<string>();

  for (const room of next.rooms) {
    nextIds.add(room.id);
    const previousRoom = previousById.get(room.id);
    if (!previousRoom) {
      changedRooms.push(room.id); // newly added room
      continue;
    }
    if (isSameValue(previousRoom, room)) continue; // fast path: identical reference, definitely unchanged
    changedRooms.push(room.id); // reference differs — something in it changed
  }

  for (const room of previous.rooms) {
    if (!nextIds.has(room.id)) changedRooms.push(room.id); // removed room
  }

  return { changedFields, changedRooms };
}

/**
 * Which specific fields differ on one room. Only meant to be called for a
 * room diffProjects() already flagged as changed — not run for every room
 * on every render.
 */
export function diffRoomFields(previous: RoomInput, next: RoomInput): string[] {
  const changed: string[] = [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);
  keys.delete("id");
  for (const key of keys) {
    const a = getField(previous, key);
    const b = getField(next, key);
    if (!isSameValue(a, b)) changed.push(key);
  }
  return changed;
}

/**
 * Combines dirty state with the validator's own, already-computed
 * top-level status (ProjectValidationResult.status) into one headline
 * ProjectStatus. Deliberately takes `validationStatus` as an input rather
 * than importing/calling the validator itself — this function never
 * re-derives or duplicates validation rules, it only decides how dirty
 * state and validation state combine into one label.
 */
export function deriveProjectStatus(input: {
  hasChanges: boolean;
  hasEverSaved: boolean;
  validationStatus: FieldStatus;
  saveState: SaveState;
}): ProjectStatus {
  if (input.saveState === "error") return "error";
  if (input.saveState === "saving") return "saving";
  if (input.validationStatus === "invalid") return "invalid";
  if (input.hasChanges && input.validationStatus === "valid") return "readyToSave";
  if (!input.hasEverSaved) return "draft";
  if (input.hasChanges) return "draft";
  if (input.validationStatus === "incomplete") return "incomplete";
  return "saved";
}
