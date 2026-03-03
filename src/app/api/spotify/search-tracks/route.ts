import { NextRequest, NextResponse } from "next/server";
import { formatSpotifyApiErrorMessage } from "@/lib/spotify/error";
import { SpotifyClientError, spotifyRequest } from "@/lib/spotify/client";
import { getSpotifySession } from "@/lib/auth/spotify-session";

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
  const { accessToken } = await getSpotifySession();
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

  let data: SpotifyTrackSearchResponse;
  try {
    data = await spotifyRequest<SpotifyTrackSearchResponse>({
      method: "GET",
      path: "/search",
      accessToken,
      query: {
        q: query,
        type: "track",
        limit: DEFAULT_TRACK_LIMIT,
      },
    });
  } catch (error) {
    if (!(error instanceof SpotifyClientError)) {
      return NextResponse.json({ error: "Failed to reach Spotify API." }, { status: 502 });
    }
    return NextResponse.json(
      {
        error: formatSpotifyApiErrorMessage(
          error.status,
          error.bodyText,
          error.responseHeaders,
        ),
      },
      { status: error.status },
    );
  }

  return NextResponse.json({
    tracks: data.tracks.items.map((track) => ({
      id: track.id,
      name: track.name,
      uri: track.uri,
      artists: track.artists.map((artist) => artist.name),
    })),
  });
}
