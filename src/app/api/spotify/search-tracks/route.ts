import { NextRequest, NextResponse } from "next/server";
import { clearSpotifySession, getSpotifySession } from "../../../../lib/auth/spotify-session";
import { CatalogSearchError, isRecord, searchCatalogTracks } from "../../../../lib/spotify/catalog";
import { getSpotifyFailure } from "../../../../lib/spotify/error";
import { privateHeaders } from "../../../../lib/server/request";

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await getSpotifySession();
    if (!accessToken) return NextResponse.json({ error: "Connect Spotify to search tracks.", code: "not_authenticated" }, { status: 401 });
    const body: unknown = await request.json().catch(() => null);
    if (!isRecord(body) || typeof body.query !== "string" || body.query.trim().length < 2 || body.query.length > 150) {
      return NextResponse.json({ error: "Enter between 2 and 150 characters to search.", code: "invalid_request" }, { status: 400 });
    }
    const tracks = await searchCatalogTracks(accessToken, { queries: [body.query.trim()], targetCount: 10, maxRequests: 1 });
    return NextResponse.json({ tracks: tracks.map((track) => ({ id: track.id, name: track.name, uri: track.uri, artists: track.artists.map((artist) => artist.name) })) }, { headers: privateHeaders() });
  } catch (error) {
    const failure = error instanceof CatalogSearchError ? error : getSpotifyFailure(error);
    if (failure.status === 401) await clearSpotifySession();
    const retryAfterSeconds = "retryAfterSeconds" in failure ? failure.retryAfterSeconds : undefined;
    return NextResponse.json({ error: failure.message, code: failure.code, retryAfterSeconds }, { status: failure.status, headers: privateHeaders(retryAfterSeconds) });
  }
}
