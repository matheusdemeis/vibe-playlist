import { NextRequest, NextResponse } from "next/server";
import { formatSpotifyApiErrorMessage } from "@/lib/spotify/error";

const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
const DEFAULT_TRACK_LIMIT = 25;

type SearchTracksRequestBody = {
  query?: string;
};

type SpotifyTrackSearchResponse = {
  tracks: {
    items: Array<{
      id: string;
      name: string;
      uri: string;
      artists: Array<{ name: string }>;
    }>;
  };
};

export async function POST(request: NextRequest) {
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  if (!accessToken) {
    return NextResponse.json(
      { error: "You are not connected to Spotify. Please log in first." },
      { status: 401 },
    );
  }

  const body = (await request.json()) as SearchTracksRequestBody;
  const query = body.query?.trim();
  if (!query) {
    return NextResponse.json({ error: "Query is required." }, { status: 400 });
  }

  const params = new URLSearchParams({
    q: query,
    type: "track",
    limit: `${DEFAULT_TRACK_LIMIT}`,
  });
  const url = `${SPOTIFY_API_BASE_URL}/search?${params.toString()}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    return NextResponse.json(
      { error: formatSpotifyApiErrorMessage(response.status, errorText, response.headers) },
      { status: response.status === 401 ? 401 : 502 },
    );
  }

  const data = (await response.json()) as SpotifyTrackSearchResponse;
  return NextResponse.json({
    tracks: data.tracks.items.map((track) => ({
      id: track.id,
      name: track.name,
      uri: track.uri,
      artists: track.artists.map((artist) => artist.name),
    })),
  });
}
