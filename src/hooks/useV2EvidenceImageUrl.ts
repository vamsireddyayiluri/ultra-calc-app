import { useCallback, useEffect, useState } from "react";
import { v2Fetch } from "../plan-import/api/experimentalV2Client";

/**
 * Fetches one V2 plan-evidence image with the user's Firebase auth header and
 * exposes it as a local `blob:` object URL for an `<img src>` - the backend no
 * longer serves these images to a plain unauthenticated `<img src>` request
 * (see app/experimental_v2/access.py), so every evidence image must be
 * retrieved through an authenticated `fetch()` instead.
 *
 * Returns `null` while loading or when `backendUrl`/`token`/`imageId` is
 * missing, and `"error"` once a fetch fails (including a 401/404 for an
 * expired or inaccessible artifact) - callers already treat a null/falsy src
 * as "show the existing failed-to-load state". Also exposes `retry()` so a
 * "Try again" button can re-run the fetch (e.g. after a transient network
 * blip or once a token/image that was briefly unavailable becomes valid)
 * without needing `backendUrl`/`token`/`imageId` to change.
 */
export function useV2EvidenceImageUrl(
  backendUrl: string,
  token: string | null | undefined,
  imageId: string | null | undefined,
): { src: string | null; failed: boolean; retry: () => void } {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const retry = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    setSrc(null);
    setFailed(false);
    if (!token || !imageId) return;

    let objectUrl: string | null = null;
    let cancelled = false;
    const url = `${backendUrl.replace(/\/$/, "")}/api/experimental/v2/artifacts/${encodeURIComponent(token)}/images/${encodeURIComponent(imageId)}`;

    void (async () => {
      try {
        const response = await v2Fetch(url);
        if (!response.ok) throw new Error(`image fetch failed (${response.status})`);
        const blob = await response.blob();
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backendUrl, token, imageId, attempt]);

  return { src, failed, retry };
}

