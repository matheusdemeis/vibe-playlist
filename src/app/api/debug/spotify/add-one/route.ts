import { NextRequest, NextResponse } from "next/server";
import { getSpotifySession } from "@/lib/auth/spotify-session";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

type AddOneBody = {
  playlistId?: unknown;
  uri?: unknown;
};

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const headerToken = request.headers.get("x-spotify-access-token")?.trim() ?? "";
  const { accessToken: sessionToken } = await getSpotifySession();
  const accessToken = headerToken || sessionToken;
  if (!accessToken) {
    return NextResponse.json(
      {
        hasAccessToken: false,
        status: 401,
        error: "No Spotify access token in session.",
      },
      { status: 401 },
    );
  }

  let payload: AddOneBody;
  try {
    payload = (await request.json()) as AddOneBody;
  } catch {
    return NextResponse.json(
      { status: 400, error: "Invalid JSON payload." },
      { status: 400 },
    );
  }

  const playlistId = typeof payload.playlistId === "string" ? payload.playlistId.trim() : "";
  const uri = typeof payload.uri === "string" ? payload.uri.trim() : "";

  if (!playlistId || !uri) {
    return NextResponse.json(
      { status: 400, error: "playlistId and uri are required." },
      { status: 400 },
    );
  }

  const meResponse = await fetch(`${SPOTIFY_API_BASE}/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });
  const meText = await meResponse.text();

  const spotifyResponse = await fetch(`${SPOTIFY_API_BASE}/playlists/${playlistId}/items`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ uris: [uri] }),
    cache: "no-store",
  });

  const responseText = await spotifyResponse.text();
  const responseBody = parseBody(responseText);

  return NextResponse.json(
    {
      tokenSource: headerToken ? "x-spotify-access-token" : "session",
      meStatus: meResponse.status,
      meBody: parseBody(meText),
      addTracksStatus: spotifyResponse.status,
      addTracksBody: responseBody,
      headers: {
        wwwAuthenticate: spotifyResponse.headers.get("www-authenticate"),
        spotifyRequestId:
          spotifyResponse.headers.get("spotify-request-id") ??
          spotifyResponse.headers.get("x-spotify-request-id") ??
          spotifyResponse.headers.get("x-request-id"),
      },
    },
    { status: 200 },
  );
}

function parseBody(value: string): unknown {
  if (!value.trim()) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value.slice(0, 500);
  }
}
