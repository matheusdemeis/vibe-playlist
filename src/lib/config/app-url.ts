const DEFAULT_APP_BASE_URL = "http://127.0.0.1:5000";

export function getAppBaseUrl(): string {
  const configured = process.env.APP_BASE_URL?.trim() || process.env.APP_URL?.trim();
  if (!configured && process.env.NODE_ENV === "production") {
    throw new Error("Set APP_BASE_URL to the application's public HTTPS origin.");
  }
  const url = validateWebUrl(configured || DEFAULT_APP_BASE_URL);
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("APP_BASE_URL must be an origin without a path, query, or fragment.");
  }
  return url.origin;
}

export function getSpotifyRedirectUri(): string {
  const appUrl = getAppBaseUrl();
  const url = validateWebUrl(process.env.SPOTIFY_REDIRECT_URI?.trim() || `${appUrl}/api/auth/callback`);
  if (url.origin !== appUrl || url.pathname !== "/api/auth/callback" || url.search || url.hash) {
    throw new Error("SPOTIFY_REDIRECT_URI must match APP_BASE_URL plus /api/auth/callback.");
  }
  return url.toString();
}

function validateWebUrl(value: string): URL {
  const url = new URL(value);
  const isLoopback = ["127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && isLoopback))) {
    throw new Error("Use HTTPS, or an explicit loopback IP for local Spotify authentication.");
  }
  return url;
}

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || value.length > 1500 || !value.startsWith("/") || value.startsWith("//") ||
    /[\\\u0000-\u001f\u007f]/.test(value)) return "/generate";
  try {
    const url = new URL(value, "https://vibeplay.invalid");
    // Only known application screens may receive auth redirects; exclude API endpoints.
    if (!["/", "/generate", "/vibe", "/vibe/results", "/vibe/history"].includes(url.pathname)) {
      return "/generate";
    }
    url.searchParams.delete("auth_error");
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/generate";
  }
}
