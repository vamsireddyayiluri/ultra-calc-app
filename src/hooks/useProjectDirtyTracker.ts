// src/hooks/useProjectDirtyTracker.ts
//
// Thin React wrapper around src/utils/projectDirtyTracker.ts. Owns *when*
// a "last saved" snapshot is taken (initially: the project as first
// received; thereafter: only when a future phase calls markSaved()) and
// exposes the current dirty/status facts as plain data for the UI.
//
// This hook does not save anything, does not touch Firestore or
// localStorage, and does not decide when to autosave — it only tracks
// state and exposes markSaved()/markSaving()/markSaveError() as the
// extension points future phases (autosave, manual Save, drafts) call
// into. None of this hook's internals need to change for those phases to
// be added.
import { useMemo, useState } from "react";
import {
  ProjectWithRooms,
  ProjectStatus,
  SaveState,
  diffProjects,
  deriveProjectStatus,
} from "../utils/projectDirtyTracker";
import { FieldStatus } from "../validations.ts/projectValidator";

export interface ProjectDirtyTracker {
  hasChanges: boolean;
  changedFields: string[];
  changedRooms: string[];
  lastSavedSnapshot: ProjectWithRooms | null;
  currentSnapshot: ProjectWithRooms;
  /** Epoch ms of the last markSaved() call, or null if this system has never recorded a save. */
  lastSavedAt: number | null;
  saveState: SaveState;
  projectStatus: ProjectStatus;
  /** Future save/autosave phases call this after a successful write. */
  markSaved: (snapshot?: ProjectWithRooms, at?: number) => void;
  /** Future save/autosave phases call this when a save begins. */
  markSaving: () => void;
  /** Future save/autosave phases call this if a save attempt fails. */
  markSaveError: () => void;
}

export function useProjectDirtyTracker(
  project: ProjectWithRooms,
  validationStatus: FieldStatus,
): ProjectDirtyTracker {
  const [trackedProjectId, setTrackedProjectId] = useState(project.id);
  const [lastSavedSnapshot, setLastSavedSnapshot] = useState<ProjectWithRooms | null>(
    () => project,
  );
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const [hasEverSaved, setHasEverSaved] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");

  // Navigating from one project to another without a full remount (e.g.
  // /project/A -> /project/B) is a *new subject*, not an edit to track —
  // reset the baseline. Adjusting state during render (rather than in a
  // useEffect) is the React-documented pattern for this: it avoids an
  // extra render showing a stale, misleading diff before an effect could
  // correct it.
  if (project.id !== trackedProjectId) {
    setTrackedProjectId(project.id);
    setLastSavedSnapshot(project);
    setLastSavedAt(null);
    setHasEverSaved(false);
    setSaveState("idle");
  }

  const { changedFields, changedRooms } = useMemo(
    () => diffProjects(lastSavedSnapshot, project),
    [lastSavedSnapshot, project],
  );

  const hasChanges = changedFields.length > 0 || changedRooms.length > 0;

  const projectStatus = useMemo(
    () =>
      deriveProjectStatus({
        hasChanges,
        hasEverSaved,
        validationStatus,
        saveState,
      }),
    [hasChanges, hasEverSaved, validationStatus, saveState],
  );

  const markSaved = (
    snapshot: ProjectWithRooms = project,
    at: number = Date.now(),
  ) => {
    setLastSavedSnapshot(snapshot);
    setLastSavedAt(at);
    setHasEverSaved(true);
    setSaveState("idle");
  };
  const markSaving = () => setSaveState("saving");
  const markSaveError = () => setSaveState("error");

  return {
    hasChanges,
    changedFields,
    changedRooms,
    lastSavedSnapshot,
    currentSnapshot: project,
    lastSavedAt,
    saveState,
    projectStatus,
    markSaved,
    markSaving,
    markSaveError,
  };
}
