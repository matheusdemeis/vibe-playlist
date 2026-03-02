const DEFAULT_APP_BASE_URL = "http://127.0.0.1:5000";

export function getAppBaseUrl(): string {
  return (
    process.env.APP_BASE_URL ??
    process.env.APP_URL ??
    DEFAULT_APP_BASE_URL
  );
}

export function getSpotifyRedirectUri(): string {
  return process.env.SPOTIFY_REDIRECT_URI ?? `${getAppBaseUrl()}/api/auth/callback`;
}
