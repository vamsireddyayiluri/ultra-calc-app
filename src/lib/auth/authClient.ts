// src/lib/auth/authClient.ts
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  applyActionCode,
  confirmPasswordReset,
  signInWithPopup,
  GoogleAuthProvider,
  reauthenticateWithCredential,
  EmailAuthProvider,
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
  navigate: NavigateFunction,
  setError: (err: string) => void
) {
  const user = auth.currentUser;

  try {
    if (user) {
      await user.reload();

      // Unverified → store pending verification & redirect
      if (!user.emailVerified) {
        await updateVerification(payload);
        navigate(`/verify?email=${payload.email}`);
        return;
      }

      // Verified → check organization
    }

    // No user yet → create & sign in

    await createUserWithEmailAndPassword(auth, payload.email, payload.password);
    await signInWithEmailAndPassword(auth, payload.email, payload.password);
    payload.userId = auth.currentUser?.uid;

    await updateVerification(payload);
    navigate(`/verify?email=${payload.email}`);
  } catch (error: any) {
    if (error.code === "auth/email-already-in-use") {
      // Try to sign in and check verification status
      const { user } = await signInWithEmailAndPassword(
        auth,
        payload.email,
        payload.password
      );
      await user.reload();

      if (!user.emailVerified) {
        navigate(`/verify?email=${payload.email}`);
      } else {
        navigate("/dashboard"); // or wherever verified users go
      }
    }
  }
}

export async function updateVerification(payload: any) {
  try {
    const data = sessionStorage.getItem("selectedReservationData");
    if (data) {
      payload.reserveContainer = [JSON.parse(data).container];
    }

    await addDoc(collection(db, "users"), payload);

    if (typeof window !== "undefined" && (window as any)._cio) {
      (window as any)._cio.track("pendingVerification", payload);
    }
  } catch (error) {
    console.error("Verification error:", error);
    throw error;
  }
}

export async function send_email_verification() {
  try {
    const user = auth.currentUser;
    if (!user) throw new Error("No logged-in user found");

    await sendEmailVerification(user, {
      url: `http://localhost:5173/login`,
      handleCodeInApp: true,
    });
  } catch (err: any) {
    console.error("Failed to send verification email:", err);
    throw new Error(err.message || "Failed to send verification email");
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
    const emailVerified = user.emailVerified;

    if (!emailVerified) {
      navigate(`/verify?email=${email}`);
      showMessage("Please verify your email to continue.", "info");
      return;
    } else {
      navigate("/dashboard");
      showMessage("Login successful!", "success");
    }
  } catch (err: any) {
    // Throw error to be caught in handleLogin
    throw new Error(err.message || "Login failed");
  }
}
/** Login user with email/password */
// export async function loginUser(email: string, password: string) {
//   return await signInWithEmailAndPassword(auth, email, password);
// }

/** Logout current user */
export async function logoutUser() {
  return await signOut(auth);
}

/** Send password reset email */
export async function sendResetEmail(email: string) {
  return await sendPasswordResetEmail(auth, email);
}

/** Confirm password reset using oobCode */
export async function confirmPasswordResetAction(
  oobCode: string,
  newPassword: string
) {
  return await confirmPasswordReset(auth, oobCode, newPassword);
}

/** Verify email using oobCode from link */
export async function verifyEmailAction(oobCode: string) {
  return await applyActionCode(auth, oobCode);
}

/** Explicitly resend verification email to current user */
export async function sendEmailVerificationLink(user: User) {
  return await sendEmailVerification(user, {
    url: `${window.location.origin}/verify`,
    handleCodeInApp: true,
  });
}

/** Sign in with Google popup */
export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  return await signInWithPopup(auth, provider);
}

/** Reauthenticate user before sensitive actions */
export async function reauthenticateUser(user: User, password: string) {
  const credential = EmailAuthProvider.credential(user.email!, password);
  return await reauthenticateWithCredential(user, credential);
}

/** Observe auth state changes */
export function observeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, callback);
}
