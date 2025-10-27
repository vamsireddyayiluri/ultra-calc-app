// src/lib/auth/authClient.ts
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  onAuthStateChanged,
  User,
} from "firebase/auth";
import db, { auth } from "../../firebase/index";
import { NavigateFunction } from "react-router-dom";
import { addDoc, collection } from "firebase/firestore";

/** Register user and send verification email */
export async function registerAction(
  payload: any,
  showMessage: (msg: string, type: "success" | "error" | "info") => void,
  navigate: NavigateFunction
) {
  try {
    // 1️⃣ Try to create the user
    const userCredential = await createUserWithEmailAndPassword(
      auth,
      payload.email,
      payload.password
    );

    const user = userCredential.user;
    payload.userId = user.uid;

    // 2️⃣ Store user data in Firestore
    await addDoc(collection(db, "users"), payload);

    // 3️⃣ Optional tracking
    if (typeof window !== "undefined" && (window as any)._cio) {
      (window as any)._cio.track("userRegistered", payload);
    }

    // 4️⃣ Automatically navigate to dashboard
    navigate("/dashboard");
  } catch (error: any) {
    if (error.code === "auth/email-already-in-use") {
      try {
        // Try logging in with provided password
        await signInWithEmailAndPassword(auth, payload.email, payload.password);

        // Login succeeded → existing user with same password
        navigate("/dashboard");
      } catch (loginError: any) {
        // Password mismatch → show friendly message
        if (
          loginError.code === "auth/invalid-credential" ||
          loginError.code === "auth/wrong-password"
        ) {
          showMessage(
            "This email is already registered with a different password. Please try logging in instead.","error"
          );
          navigate("/login");
        } else {
          console.error("Login error:", loginError);
        }
      }
    } else {
      console.error("Registration error:", error);
      throw error;
    }
  }
}

export async function send_login_request(
  payload: { email: string; password: string },
  navigate: NavigateFunction,
  showMessage: (msg: string, type: "success" | "error" | "info") => void
) {
  const { email, password } = payload;

  try {
    // Replace with your Firebase or backend login logic
    const { user } = await signInWithEmailAndPassword(auth, email, password);
    if (user) {
      navigate("/dashboard");
      showMessage("Login successful!", "success");
    }
  } catch (err: any) {
    // Throw error to be caught in handleLogin
    throw new Error(err.message || "Login failed");
  }
}

/** Logout current user */
export async function logoutUser() {
  return await signOut(auth);
}

/** Send password reset email */
export async function sendResetEmail(email: string) {
  return await sendPasswordResetEmail(auth, email);
}
/** Observe auth state changes */
export function observeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
