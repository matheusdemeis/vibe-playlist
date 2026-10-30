import { NextRequest, NextResponse } from "next/server";
import { getSpotifySession } from "../../../../../lib/auth/spotify-session";
import { spotifyJson } from "../../../../../lib/spotify/client";
import { getSpotifyFailure } from "../../../../../lib/spotify/error";
import { privateHeaders, rejectCrossOrigin } from "../../../../../lib/server/request";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") return NextResponse.json({ error: "Not found." }, { status: 404 });
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  try {
    const body: unknown = await request.json().catch(() => null);
    if (!body || typeof body !== "object" || !("playlistId" in body) || !("uri" in body) ||
      typeof body.playlistId !== "string" || !/^[A-Za-z0-9]{22}$/.test(body.playlistId) ||
      typeof body.uri !== "string" || !/^spotify:track:[A-Za-z0-9]{22}$/.test(body.uri)) {
      return NextResponse.json({ error: "A valid playlist ID and track URI are required." }, { status: 400 });
    }
    const { accessToken } = await getSpotifySession();
    if (!accessToken) return NextResponse.json({ error: "Connect Spotify first." }, { status: 401 });
    await spotifyJson({ path: `/playlists/${body.playlistId}/items`, method: "POST", accessToken, json: { uris: [body.uri] } });
    return NextResponse.json({ added: true }, { headers: privateHeaders() });
  } catch (error) {
    const failure = getSpotifyFailure(error);
    return NextResponse.json({ error: failure.message, code: failure.code }, { status: failure.status, headers: privateHeaders(failure.retryAfterSeconds) });
  }
}
