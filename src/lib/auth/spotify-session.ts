import { cookies } from "next/headers";

export const SPOTIFY_ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
export const SPOTIFY_GRANTED_SCOPES_COOKIE_NAME = "spotify_access_scopes";
export const REQUIRED_PLAYLIST_SCOPES = [
  "playlist-modify-private",
  "playlist-modify-public",
] as const;
export type PlaylistModifyScope = (typeof REQUIRED_PLAYLIST_SCOPES)[number];

export type SpotifySession = {
  accessToken: string | null;
  grantedScopes: string[];
};

export async function getSpotifySession(): Promise<SpotifySession> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(SPOTIFY_ACCESS_TOKEN_COOKIE_NAME)?.value ?? null;
  const scopeValue = cookieStore.get(SPOTIFY_GRANTED_SCOPES_COOKIE_NAME)?.value ?? "";
  const grantedScopes = parseGrantedScopes(scopeValue);

  return { accessToken, grantedScopes };
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

  if (value.startsWith("[")) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .filter((scope): scope is string => typeof scope === "string")
        .map((scope) => scope.trim())
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  return value
    .split(" ")
    .map((scope) => scope.trim())
    .filter(Boolean);
}
