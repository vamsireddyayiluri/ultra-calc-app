// src/utils/friendlyError.ts
//
// Translates a caught error (often a Firebase/Firestore exception) into a
// short, user-safe message. The real error is always logged to the
// console for debugging -- callers should never forward err.message
// directly to a user-facing toast/snackbar.

import { ProjectRevisionConflictError } from "../services/firebaseHelpers";

const FIRESTORE_FRIENDLY_MESSAGES: Record<string, string> = {
  "permission-denied": "You don't have permission to do that.",
  unavailable: "Can't reach the server right now — check your connection and try again.",
  "resource-exhausted": "Too many requests right now — please try again shortly.",
  unauthenticated: "Your session has expired — please sign in again.",
  cancelled: "The request was cancelled.",
  "deadline-exceeded": "The request timed out — please try again.",
};

export function getFriendlySaveErrorMessage(err: unknown, fallback: string): string {
  console.error(err);
  // Its own message already explains exactly what happened and what to do
  // (reload before saving again) - a generic fallback here would hide that
  // and leave the user with no clue why their save just silently failed.
  if (err instanceof ProjectRevisionConflictError) {
    return err.message;
  }
  const code = (err as { code?: string } | null)?.code;
  if (code && FIRESTORE_FRIENDLY_MESSAGES[code]) {
    return FIRESTORE_FRIENDLY_MESSAGES[code];
  }
  return fallback;
}
