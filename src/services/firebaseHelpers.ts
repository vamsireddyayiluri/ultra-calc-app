// src/utils/firebaseHelpers.ts
import db, { auth } from "../firebase/index";
import {
  collection,
  doc,
  addDoc,
  query,
  orderBy,
  where,
  getDocs,
  getDoc,
  deleteDoc,
  updateDoc,
  runTransaction,
} from "firebase/firestore";
import { PlanImportProjectMetadata, ProjectSettings, RoomInput } from "../models/projectTypes";
import { uid } from "../utils/uid";
import { normalizeRoomName } from "../plan-import/pipeline/detectExistingRoomDuplicates";
import { DEFAULT_HEATING_SYSTEM } from "../utils/heatingSystem";

export type RichProject = ProjectSettings & {
  rooms: RoomInput[];
  id?: string;
  userId?: string;
};

function withProjectDefaults(project: RichProject): RichProject {
  return {
    ...project,
    heatingSystem: project.heatingSystem ?? DEFAULT_HEATING_SYSTEM,
  };
}

/**
 * Recursively replaces `undefined` with `null` (objects and arrays).
 * Firestore's setDoc()/addDoc() throw on any `undefined` field value —
 * this app's display/normalize layer (utils/display.ts's fromDisplay*
 * functions) legitimately produces `undefined` for a cleared input, since
 * that's exactly what the validator's isBlank() check needs to see in
 * memory to classify a field as "incomplete" rather than "invalid". This
 * sanitization must stay right here, immediately before the write — never
 * upstream in updateRoom/updateProject/React state — or the validator
 * would lose the ability to tell "cleared" apart from "never touched".
 * Converting to `null` (not deleting the key) also matches this app's
 * `merge: true` semantics: an omitted key leaves Firestore's existing
 * value untouched, but an explicit `null` correctly overwrites it to
 * reflect the user having cleared the field.
 */
function sanitizeForFirestore<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((v) => (v === undefined ? null : sanitizeForFirestore(v))) as unknown as T;
  }
  if (value !== null && typeof value === "object" && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      out[key] = v === undefined ? null : sanitizeForFirestore(v);
    }
    return out as T;
  }
  return value;
}

/**
 * Thrown by saveProjectTodb() when the document's Firestore revision no
 * longer matches what the caller last loaded/saved - meaning another tab or
 * window has saved this same project in between. Callers already route
 * thrown save errors through getFriendlySaveErrorMessage() to the user
 * instead of silently overwriting the other tab's changes.
 */
export class ProjectRevisionConflictError extends Error {
  constructor() {
    super(
      "This project was changed in another tab or window. Reload the project before saving again to avoid overwriting those changes.",
    );
    this.name = "ProjectRevisionConflictError";
  }
}

export interface SaveProjectResult {
  id: string;
  revision: number;
}

/**
 * Save or update a project and associate it with the current user.
 *
 * Runs the update path as a Firestore transaction guarded by a monotonic
 * `revision` counter (see models/projectTypes.ts's ProjectSettings.revision):
 * the transaction re-reads the document's CURRENT revision and rejects the
 * write with ProjectRevisionConflictError when it no longer matches what
 * `project.revision` expected, instead of silently overwriting whatever
 * another tab/window already saved. A brand-new project (no `project.id`
 * yet) has nothing to conflict with and always succeeds.
 */
export async function saveProjectTodb(project: any, showMessage: any): Promise<SaveProjectResult> {
  try {
    const userId = auth.currentUser?.uid;
    project.userId = userId;

    if (project.id) {
      // Update existing project
      const docRef = doc(db, "projects", project.id);
      const newRevision = await runTransaction(db, async (transaction) => {
        const snapshot = await transaction.get(docRef);
        const serverRevision = snapshot.exists() ? ((snapshot.data().revision as number | undefined) ?? 0) : 0;
        // A missing/undefined project.revision (e.g. a legacy document loaded
        // before this field existed) is never treated as "nothing to check
        // against" - it means this tab expects revision 0, exactly like a
        // server document that has never been saved under revision tracking
        // would also report 0 via the `?? 0` above. That keeps the very
        // first save of a legacy project conflict-free while still catching
        // a real conflict if another tab already advanced it since.
        const expectedRevision = typeof project.revision === "number" ? project.revision : 0;
        if (snapshot.exists() && expectedRevision !== serverRevision) {
          throw new ProjectRevisionConflictError();
        }
        const nextRevision = serverRevision + 1;
        transaction.set(docRef, sanitizeForFirestore({ ...project, revision: nextRevision }), { merge: true });
        return nextRevision;
      });
      return { id: project.id, revision: newRevision };
    } else {
      // Add new project - nothing to conflict with yet.
      project.id = uid();
      const colRef = collection(db, "projects");
      const docRef = await addDoc(colRef, sanitizeForFirestore({ ...project, revision: 1 }));
      return { id: docRef.id, revision: 1 };
    }
  } catch (error) {
    console.error("Error saving project:", error);
    throw error;
  }
}

/**
 * Persist a project as a Draft — always succeeds regardless of
 * completeness/validity (drafts may be incomplete or contain invalid
 * fields; they must always be saveable so in-progress work is never
 * lost). Does not validate — callers decide when this is appropriate to
 * call; this function only sets the lifecycle field and delegates to the
 * existing, unmodified saveProjectTodb() write path.
 */
export async function saveDraftToDb(project: RichProject): Promise<SaveProjectResult> {
  return saveProjectTodb(
    { ...project, status: "draft", updatedAt: Date.now() },
    undefined,
  );
}

/**
 * Persist a project as Published. Callers are responsible for having
 * already run strict validation (validateProject().complete) before
 * calling this — this function deliberately does not import or run the
 * validator itself, keeping this file a pure Firestore persistence layer
 * with no business-rule knowledge (see AGENTS.md's separation between
 * the Validation and Firestore/persistence layers).
 */
export async function publishProjectToDb(project: RichProject): Promise<SaveProjectResult> {
  return saveProjectTodb(
    { ...project, status: "published", updatedAt: Date.now() },
    undefined,
  );
}

/**
 * Fetch all projects for a specific user
 */
export async function fetchAllProjects(): Promise<RichProject[]> {
  try {
    const userId = auth.currentUser?.uid;
    const colRef = collection(db, "projects");
    const q = query(
      colRef,
      where("userId", "==", userId),
      orderBy("name", "asc")
    );
    const snapshot = await getDocs(q);
    const projects: RichProject[] = snapshot.docs.map((doc) =>
      withProjectDefaults({
        ...(doc.data() as RichProject),
        id: doc.id,
      }),
    );
    return projects;
  } catch (error) {
    console.error("Error fetching projects:", error);
    return [];
  }
}

/**
 * Fetch a single project by ID, only if it belongs to the user
 */
export async function fetchProjectById(
  id: string
): Promise<RichProject | null> {
  try {
    const userId = auth.currentUser?.uid;
    const docRef = doc(db, "projects", id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    const project: RichProject = withProjectDefaults({
      ...(snapshot.data() as RichProject),
      id: snapshot.id,
    });
    if (project.userId !== userId) return null;
    return project;
  } catch (error) {
    console.error("Error fetching project:", error);
    return null;
  }
}

export type AppendRoomDecision = "add" | "replace" | "skip";

export interface AppendRoomDecisionInput {
  decision: AppendRoomDecision;
  /** The converted room from this import run (already has its own fresh id). */
  roomInput: RoomInput;
  /** Required when decision is "replace" - the existing room to update in place. */
  matchedExistingRoomId: string | null;
}

/**
 * Appends reviewed plan-import rooms to an EXISTING project without creating a
 * new project, replacing an existing project, or touching any room the
 * reviewer didn't explicitly decide on. Runs inside a Firestore transaction so
 * a concurrent edit to the SAME project (another tab, or a second append)
 * can never be silently lost - the transaction always reads the latest rooms
 * right before merging and Firestore retries automatically on conflict.
 *
 * "replace" only overwrites name/length_m/width_m on the matched existing
 * room; every other field (height, windows, floor cover, etc. - anything the
 * user may have already filled in by hand) is preserved untouched. A
 * "replace" whose matched room no longer exists (e.g. deleted by someone else
 * first) is treated as a no-op for that one room rather than failing the
 * whole append.
 */
export async function appendRoomsToProject(
  projectId: string,
  decisions: AppendRoomDecisionInput[],
  runMetadata: PlanImportProjectMetadata,
): Promise<RichProject> {
  const docRef = doc(db, "projects", projectId);
  const userId = auth.currentUser?.uid;
  const updated = await runTransaction(db, async (transaction) => {
    const snapshot = await transaction.get(docRef);
    if (!snapshot.exists()) {
      throw new Error("This project no longer exists.");
    }
    const current = withProjectDefaults({ ...(snapshot.data() as RichProject), id: snapshot.id });
    if (current.userId !== userId) {
      throw new Error("You don't have access to this project.");
    }
    let rooms = [...current.rooms];
    // Recomputed from THIS transaction's freshly-read rooms (re-read on every
    // automatic retry Firestore performs on conflict) rather than trusting
    // the possibly-stale matchedExistingRoomId computed earlier against
    // whatever snapshot the reviewer happened to load - a concurrent edit or
    // second append in another tab could have renamed or removed that exact
    // room in between, which must never silently overwrite an unrelated
    // room that now happens to occupy the same id.
    const freshRoomsByNormalizedName = new Map<string, RoomInput>();
    for (const room of rooms) {
      const key = normalizeRoomName(room.name);
      if (key && !freshRoomsByNormalizedName.has(key)) freshRoomsByNormalizedName.set(key, room);
    }
    for (const entry of decisions) {
      if (entry.decision === "skip") continue;
      if (entry.decision === "replace") {
        const normalizedIncomingName = normalizeRoomName(entry.roomInput.name);
        const matchStillValid = Boolean(
          entry.matchedExistingRoomId
            && rooms.some((room) => room.id === entry.matchedExistingRoomId && normalizeRoomName(room.name) === normalizedIncomingName),
        );
        const targetId = matchStillValid
          ? entry.matchedExistingRoomId
          : freshRoomsByNormalizedName.get(normalizedIncomingName)?.id ?? null;
        if (targetId) {
          rooms = rooms.map((room) =>
            room.id === targetId
              ? { ...room, name: entry.roomInput.name, length_m: entry.roomInput.length_m, width_m: entry.roomInput.width_m }
              : room,
          );
          continue;
        }
        // No still-valid duplicate match (renamed/removed since the reviewer
        // decided, and no equivalent room exists to replace instead) - keep
        // the reviewed room by adding it rather than silently dropping it.
        rooms = [...rooms, entry.roomInput];
        continue;
      }
      rooms = [...rooms, entry.roomInput];
    }
    // Legacy documents saved before this field existed have no revision at
    // all - treated as 0, so this append still correctly advances it to 1,
    // exactly like saveProjectTodb's own "missing means 0" handling above.
    // Every write must bump this counter (not just full-project saves),
    // otherwise another tab with this same project open (editing it directly
    // rather than appending) could still load a stale revision that matches
    // the server's unmoved counter and silently overwrite these newly
    // appended rooms on its own next autosave.
    const currentRevision = typeof current.revision === "number" ? current.revision : 0;
    const next: RichProject = {
      ...current,
      rooms,
      revision: currentRevision + 1,
      planImportHistory: [...(current.planImportHistory ?? []), runMetadata],
      updatedAt: Date.now(),
    };
    transaction.set(docRef, sanitizeForFirestore(next), { merge: true });
    return next;
  });
  return updated;
}
export async function deleteProjectFromDb(id: string, showMessage: any) {
  try {
    if (!id) return;
    const docRef = doc(db, "projects", id);

    await deleteDoc(docRef);

    showMessage("Project deleted successfully", "success");
    return true;
  } catch (error) {
    console.error("Error deleting project:", error);
    showMessage("Failed to delete project", "error");
    return false;
  }
}
export const getUserById = async (userId: string) => {
  try {
    const q = query(collection(db, "users"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.warn("No user found with userId:", userId);
      return null;
    }

    // assuming userId is unique → return the first match
    const docSnap = querySnapshot.docs[0];
    if (docSnap.exists()) {
      return docSnap.data();
    }
  } catch (error) {
    console.error("Error fetching user:", error);
    return null;
  }
};
export const updateUserById = async (userId: string, data: any) => {
  try {
    const q = query(collection(db, "users"), where("userId", "==", userId));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      console.warn("No user found with userId:", userId);
      return null;
    }

    // assuming userId is unique → update the first match
    const docRef = querySnapshot.docs[0].ref;
    await updateDoc(docRef, data);

    return true;
  } catch (error) {
    console.error("Error updating user:", error);
    return null;
  }
};
