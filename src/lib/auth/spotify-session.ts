import { cookies } from "next/headers";

export const SPOTIFY_ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
export const SPOTIFY_SCOPES_COOKIE_NAME = "spotify_access_scopes";
export const REQUIRED_PLAYLIST_SCOPES = [
  "playlist-modify-private",
  "playlist-modify-public",
] as const;

export type SpotifySession = {
  accessToken: string | null;
  scopes: string[];
};

export async function getSpotifySession(): Promise<SpotifySession> {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(SPOTIFY_ACCESS_TOKEN_COOKIE_NAME)?.value ?? null;
  const scopeValue = cookieStore.get(SPOTIFY_SCOPES_COOKIE_NAME)?.value ?? "";
  const scopes = scopeValue.split(" ").map((scope) => scope.trim()).filter(Boolean);

  return { accessToken, scopes };
}

export async function getSpotifyAccessToken(): Promise<string | null> {
  const { accessToken } = await getSpotifySession();
  return accessToken;
}

export function hasRequiredPlaylistScopes(scopes: string[]): boolean {
  return REQUIRED_PLAYLIST_SCOPES.every((scope) => scopes.includes(scope));
}
