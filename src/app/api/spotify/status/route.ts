import { NextResponse } from "next/server";
import { clearSpotifySession, getSpotifySession, REQUIRED_PLAYLIST_SCOPES } from "../../../../lib/auth/spotify-session";
import { spotifyJson } from "../../../../lib/spotify/client";
import { getSpotifyFailure } from "../../../../lib/spotify/error";
import { privateHeaders } from "../../../../lib/server/request";

function disconnected() {
  return NextResponse.json({ connected: false, grantedScopes: [], requiredScopes: REQUIRED_PLAYLIST_SCOPES,
    hasRequiredPlaylistScopes: false, missingRequiredScopes: REQUIRED_PLAYLIST_SCOPES, account: null }, { headers: privateHeaders() });
}

export async function GET() {
  try {
    const { accessToken, grantedScopes } = await getSpotifySession();
    if (!accessToken) return disconnected();
    const account = await spotifyJson<{ id?: string; display_name?: string | null }>({ path: "/me", accessToken });
    if (!account.id) throw new Error("Invalid profile response.");
    const missingRequiredScopes = REQUIRED_PLAYLIST_SCOPES.filter((scope) => !grantedScopes.includes(scope));
    return NextResponse.json({ connected: true, grantedScopes, requiredScopes: REQUIRED_PLAYLIST_SCOPES,
      hasRequiredPlaylistScopes: missingRequiredScopes.length === 0, missingRequiredScopes,
      account: { id: account.id, displayName: account.display_name ?? null } }, { headers: privateHeaders() });
  } catch (error) {
    const failure = getSpotifyFailure(error);
    if (failure.status === 401) { await clearSpotifySession(); return disconnected(); }
    return NextResponse.json({ error: failure.message, code: failure.code, retryAfterSeconds: failure.retryAfterSeconds },
      { status: failure.status, headers: privateHeaders(failure.retryAfterSeconds) });
  }
}
