// src/utils/firebaseHelpers.ts
import db, { auth } from "../firebase/index";
import {
  collection,
  doc,
  setDoc,
  addDoc,
  query,
  orderBy,
  where,
  getDocs,
  getDoc,
  deleteDoc,
  updateDoc,
} from "firebase/firestore";
import { ProjectSettings, RoomInput } from "../models/projectTypes";
import { uid } from "../utils/uid";

export type RichProject = ProjectSettings & {
  rooms: RoomInput[];
  id?: string;
  userId?: string;
};

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
 * Save or update a project and associate it with the current user
 */
export async function saveProjectTodb(project: any, showMessage: any) {
  try {
    const userId = auth.currentUser?.uid;
    project.userId = userId;

    if (project.id) {
      // Update existing project
      const docRef = doc(db, "projects", project.id);
      await setDoc(docRef, sanitizeForFirestore(project), { merge: true });
      return project.id;
    } else {
      // Add new project
      project.id = uid();
      const colRef = collection(db, "projects");
      const docRef = await addDoc(colRef, sanitizeForFirestore(project));
      return docRef.id;
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
export async function saveDraftToDb(project: RichProject): Promise<string> {
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
export async function publishProjectToDb(project: RichProject): Promise<string> {
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
    const projects: RichProject[] = snapshot.docs.map((doc) => ({
      ...(doc.data() as RichProject),
      id: doc.id,
    }));
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
    const project: RichProject = {
      ...(snapshot.data() as RichProject),
      id: snapshot.id,
    };
    if (project.userId !== userId) return null;
    return project;
  } catch (error) {
    console.error("Error fetching project:", error);
    return null;
  }
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
