import { cookies } from "next/headers";

export const SPOTIFY_ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
export const SPOTIFY_TOKEN_SCOPE_RAW_COOKIE_NAME = "spotify_access_scope_raw";
export const REQUIRED_PLAYLIST_SCOPES = [
  "playlist-modify-private",
  "playlist-modify-public",
] as const;
export type PlaylistModifyScope = (typeof REQUIRED_PLAYLIST_SCOPES)[number];

export type SpotifySession = {
  accessToken: string | null;
  tokenResponseScopeRaw: string | null;
  grantedScopes: string[];
};

export async function getSpotifySession(): Promise<SpotifySession> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(SPOTIFY_ACCESS_TOKEN_COOKIE_NAME)?.value ?? null;
  const tokenResponseScopeRaw =
    cookieStore.get(SPOTIFY_TOKEN_SCOPE_RAW_COOKIE_NAME)?.value ?? null;
  const grantedScopes = parseGrantedScopes(tokenResponseScopeRaw ?? "");

  return { accessToken, tokenResponseScopeRaw, grantedScopes };
}

export async function getSpotifyAccessToken(): Promise<string | null> {
  const { accessToken } = await getSpotifySession();
  return accessToken;
}

export function hasGrantedScopes(grantedScopes: string[], requiredScopes: readonly string[]): boolean {
  return requiredScopes.every((scope) => grantedScopes.includes(scope));
}

export function getRequiredPlaylistModifyScope(isPublic: boolean | null): PlaylistModifyScope {
  return isPublic === true ? "playlist-modify-public" : "playlist-modify-private";
}

function parseGrantedScopes(value: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(" ")
    .map((scope) => scope.trim())
    .filter(Boolean);
}
