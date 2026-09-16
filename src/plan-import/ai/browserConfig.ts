export const GEMINI_BROWSER_MODEL = "gemini-3.6-flash";

export function getGeminiBrowserApiKey(): string | null {
  const key = import.meta.env.VITE_GEMINI_API_KEY;
  return typeof key === "string" && key.trim().length > 0 ? key.trim() : null;
}

export const GEMINI_BROWSER_KEY_WARNING =
  "A VITE_GEMINI_API_KEY is exposed in the browser bundle. Use only a restricted local experiment key with tight quotas; never use a production secret.";
