import { cookies } from "next/headers";
import { SpotifyClientError } from "../spotify/client";
import { sealCookie, secureCookieOptions, unsealCookie } from "./sealed-cookie";

export const SPOTIFY_SESSION_COOKIE_NAME = "vibeplay_spotify_session";
export const SPOTIFY_ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
export const SPOTIFY_TOKEN_SCOPE_RAW_COOKIE_NAME = "spotify_access_scope_raw";
export const REQUIRED_PLAYLIST_SCOPES = [
  "playlist-modify-private", "playlist-modify-public", "playlist-read-private",
] as const;
export type PlaylistModifyScope = "playlist-modify-private" | "playlist-modify-public";
const SESSION_LIFETIME_SECONDS = 30 * 24 * 60 * 60;
const SESSION_PURPOSE = "spotify-session-v1";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";

export type SpotifySession = {
  accessToken: string | null;
  tokenResponseScopeRaw: string | null;
  grantedScopes: string[];
};

type StoredSession = {
  accessToken: string;
  refreshToken: string | null;
  scope: string;
  expiresAt: number;
  sessionExpiresAt: number;
};

export type SpotifyTokenResponse = {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

const pendingRefreshes = new Map<string, Promise<StoredSession | null>>();

function emptySession(): SpotifySession {
  return { accessToken: null, tokenResponseScopeRaw: null, grantedScopes: [] };
}

export async function clearSpotifySession(): Promise<void> {
  const store = await cookies();
  for (const name of [SPOTIFY_SESSION_COOKIE_NAME, SPOTIFY_ACCESS_TOKEN_COOKIE_NAME,
    SPOTIFY_TOKEN_SCOPE_RAW_COOKIE_NAME, "spotify_access_scopes"]) {
    store.set(name, "", secureCookieOptions(0));
  }
}

async function writeSession(session: StoredSession): Promise<void> {
  const store = await cookies();
  store.set(SPOTIFY_SESSION_COOKIE_NAME, sealCookie(session, SESSION_PURPOSE),
    secureCookieOptions(Math.max(0, Math.floor((session.sessionExpiresAt - Date.now()) / 1000))));
}

export async function saveSpotifySession(token: SpotifyTokenResponse): Promise<void> {
  const now = Date.now();
  const session: StoredSession = {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? null,
    scope: token.scope ?? "",
    expiresAt: now + token.expires_in * 1000,
    sessionExpiresAt: now + SESSION_LIFETIME_SECONDS * 1000,
  };
  // Seal before changing cookies so an oversized response preserves the old session.
  sealCookie(session, SESSION_PURPOSE);
  await clearSpotifySession();
  await writeSession(session);
}

export async function getSpotifySession(): Promise<SpotifySession> {
  const store = await cookies();
  const value = store.get(SPOTIFY_SESSION_COOKIE_NAME)?.value;
  if (!value) {
    // Old access-only cookies cannot be refreshed or authenticated as session data.
    if (store.get(SPOTIFY_ACCESS_TOKEN_COOKIE_NAME)) await clearSpotifySession();
    return emptySession();
  }
  const payload = unsealCookie(value, SESSION_PURPOSE);
  if (!isStoredSession(payload) || payload.sessionExpiresAt <= Date.now()) {
    await clearSpotifySession();
    return emptySession();
  }
  let session = payload;
  if (session.expiresAt <= Date.now() + 60_000) {
    if (!session.refreshToken) {
      await clearSpotifySession();
      return emptySession();
    }
    // Deduplicate parallel status/generation refreshes within this server instance.
    const key = session.refreshToken;
    let pending = pendingRefreshes.get(key);
    if (!pending) {
      pending = refreshSession(session).finally(() => pendingRefreshes.delete(key));
      pendingRefreshes.set(key, pending);
    }
    const refreshed = await pending;
    if (!refreshed) {
      await clearSpotifySession();
      return emptySession();
    }
    session = refreshed;
    await writeSession(session);
  }
  return {
    accessToken: session.accessToken,
    tokenResponseScopeRaw: session.scope,
    grantedScopes: parseGrantedScopes(session.scope),
  };
}

export async function getSpotifyAccessToken(): Promise<string | null> {
  return (await getSpotifySession()).accessToken;
}

async function refreshSession(session: StoredSession): Promise<StoredSession | null> {
  try {
    const token = await requestSpotifyToken(new URLSearchParams({
      grant_type: "refresh_token", refresh_token: session.refreshToken!,
    }));
    return {
      ...session,
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? session.refreshToken,
      scope: token.scope ?? session.scope,
      expiresAt: Date.now() + token.expires_in * 1000,
    };
  } catch (error) {
    if (error instanceof SpotifyClientError && error.bodyText === "invalid_grant") return null;
    // Transient errors and app configuration failures must not delete user sessions.
    throw error;
  }
}

export async function requestSpotifyToken(body: URLSearchParams): Promise<SpotifyTokenResponse> {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  if (!clientId) throw new Error("Spotify authentication is not configured.");
  body.set("client_id", clientId);
  let response: Response;
  try {
    response = await fetch(SPOTIFY_TOKEN_URL, {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body, cache: "no-store", signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw tokenError(503, "token_service_unavailable");
  }
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw tokenError(response.ok ? 502 : response.status, "invalid_token_response", response.headers);
  }
  if (!response.ok) {
    const code = isRecord(payload) && typeof payload.error === "string" ? payload.error : "token_request_failed";
    // Keep only the OAuth error code; never retain/log responses containing tokens.
    throw tokenError(response.status, code, response.headers);
  }
  if (!isRecord(payload) || typeof payload.access_token !== "string" || !payload.access_token ||
    (typeof payload.token_type !== "string" || payload.token_type.toLowerCase() !== "bearer") || typeof payload.expires_in !== "number" ||
    !Number.isFinite(payload.expires_in) || payload.expires_in <= 0 ||
    (payload.refresh_token !== undefined && (typeof payload.refresh_token !== "string" || !payload.refresh_token)) ||
    (payload.scope !== undefined && typeof payload.scope !== "string")) {
    throw tokenError(502, "invalid_token_response");
  }
  return payload as SpotifyTokenResponse;
}

function tokenError(status: number, code: string, headers = new Headers()): SpotifyClientError {
  return new SpotifyClientError({
    message: "Spotify authentication request failed.", status, path: "/api/token",
    url: SPOTIFY_TOKEN_URL, bodyText: code, responseHeaders: headers,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStoredSession(value: unknown): value is StoredSession {
  return isRecord(value) && typeof value.accessToken === "string" && value.accessToken.length > 0 &&
    (value.refreshToken === null || typeof value.refreshToken === "string") && typeof value.scope === "string" &&
    typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt) &&
    typeof value.sessionExpiresAt === "number" && Number.isFinite(value.sessionExpiresAt);
}

export function hasGrantedScopes(grantedScopes: string[], requiredScopes: readonly string[]): boolean {
  return requiredScopes.every((scope) => grantedScopes.includes(scope));
}

export function getRequiredPlaylistModifyScope(isPublic: boolean | null): PlaylistModifyScope {
  return isPublic === true ? "playlist-modify-public" : "playlist-modify-private";
}

function parseGrantedScopes(value: string): string[] {
  return [...new Set(value.split(/\s+/).filter(Boolean))];
}
