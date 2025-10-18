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
} from "firebase/firestore";
import { ProjectHeader, Room } from "../models/projectTypes";
import { uid } from "../utils/uid";

export type RichProject = ProjectHeader & {
  rooms: Room[];
  id?: string;
  userId?: string;
};

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
      await setDoc(docRef, project, { merge: true });
      showMessage("Project updated successfully");
      return project.id;
    } else {
      // Add new project
      project.id = uid();
      const colRef = collection(db, "projects");
      const docRef = await addDoc(colRef, project);
      showMessage("Project saved successfully");
      return docRef.id;
    }
  } catch (error) {
    console.error("Error saving project:", error);
    throw error;
  }
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

    // (optional) security layer — could verify owner if needed
    await deleteDoc(docRef);

    showMessage("Project deleted successfully");
    return true;
  } catch (error) {
    console.error("Error deleting project:", error);
    showMessage("Failed to delete project");
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
