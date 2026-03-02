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

  const { accessToken } = await getSpotifySession();
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

  const spotifyResponse = await fetch(`${SPOTIFY_API_BASE}/playlists/${playlistId}/tracks`, {
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
      status: spotifyResponse.status,
      body: responseBody,
      headers: {
        wwwAuthenticate: spotifyResponse.headers.get("www-authenticate"),
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
