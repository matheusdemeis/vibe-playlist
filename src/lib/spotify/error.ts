import { SpotifyClientError } from "./client";

export type SpotifyFailure = {
  status: number;
  code: string;
  message: string;
  retryAfterSeconds?: number;
};

export function parseRetryAfter(value: string | null, now = Date.now()): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = /^\d+(?:\.\d+)?$/.test(value.trim())
    ? Number(value)
    : (Date.parse(value) - now) / 1000;
  return Number.isFinite(seconds) ? Math.max(0, Math.ceil(seconds)) : undefined;
}

export function getSpotifyFailure(error: unknown): SpotifyFailure {
  if (!(error instanceof SpotifyClientError)) {
    return { status: 502, code: "spotify_unavailable", message: "Could not reach Spotify. Please try again." };
  }
  const { status } = error;
  if (status === 401) return { status, code: "not_authenticated", message: "Your Spotify connection expired. Please reconnect." };
  if (status === 403) return { status, code: "spotify_forbidden", message: "Spotify did not allow this request. Check your app access and permissions. Development Mode accounts must be on the app's allowlist." };
  if (status === 429) {
    let quota = false;
    try { quota = JSON.parse(error.bodyText)?.error?.reason === "QUOTA_EXCEEDED"; } catch { /* A plain-text error is valid upstream. */ }
    const retryAfterSeconds = parseRetryAfter(error.responseHeaders.get("retry-after"));
    return {
      status, code: quota ? "spotify_quota_exceeded" : "spotify_rate_limited",
      message: quota
        ? "This app has reached Spotify's API quota. Please try again later."
        : retryAfterSeconds !== undefined
          ? `Spotify is busy. Try again in ${retryAfterSeconds} seconds.`
          : "Spotify is receiving too many requests. Please try again later.",
      ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}),
    };
  }
  if (status === 400) return { status, code: "spotify_bad_request", message: "Spotify could not accept this request. Check your selection and try again." };
  if (status === 404) return { status, code: "spotify_not_found", message: "This Spotify item is unavailable or no longer exists." };
  return {
    status: status >= 500 && status <= 599 ? status : 502,
    code: status === 504 ? "spotify_timeout" : "spotify_unavailable",
    message: status === 504 ? "Spotify took too long to respond. Please try again." : "Spotify is temporarily unavailable. Please try again later.",
  };
}

type SpotifyErrorBody = {
  error?: {
    message?: string;
  };
  message?: string;
};

export function formatSpotifyApiErrorMessage(
  status: number,
  bodyText: string,
  headers?: Headers,
): string {
  const detail = extractDetail(bodyText);
  const requestId = headers ? extractRequestId(headers) : null;

  let message = `Spotify API ${status}: ${detail}`;
  if (requestId) {
    message += ` (Request ID: ${requestId})`;
  }

  return message;
}

function extractDetail(bodyText: string): string {
  const trimmed = bodyText.trim();
  if (!trimmed) {
    return "No response body returned.";
  }

  try {
    const parsed = JSON.parse(trimmed) as SpotifyErrorBody;
    if (parsed.error?.message) {
      return parsed.error.message;
    }
    if (parsed.message) {
      return parsed.message;
    }
  } catch {
    return trimmed;
  }

  return trimmed;
}

function extractRequestId(headers: Headers): string | null {
  return (
    headers.get("spotify-request-id") ??
    headers.get("x-spotify-request-id") ??
    headers.get("x-request-id") ??
    null
  );
}
