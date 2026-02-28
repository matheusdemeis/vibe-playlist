import { NextRequest, NextResponse } from "next/server";
import { formatSpotifyApiErrorMessage } from "@/lib/spotify/error";

const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
const DEFAULT_RECOMMENDATION_LIMIT = 20;

type GenerateRequestBody = {
  artistName?: string;
};

type SpotifyArtistSearchResponse = {
  artists: {
    items: Array<{ id: string; name: string }>;
  };
};

type SpotifyTrackSearchResponse = {
  tracks: {
    items: Array<{ uri: string }>;
  };
};

type SpotifyCreatePlaylistResponse = {
  id: string;
  external_urls: {
    spotify: string;
  };
};

async function spotifyRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const url = `${SPOTIFY_API_BASE_URL}${path}`;
  const method = init?.method ?? "GET";
  traceGenerate("spotify_request_start", {
    url,
    method,
    headers: {
      ...(init?.headers ?? {}),
      Authorization: accessToken ? "Bearer [REDACTED]" : undefined,
      "Content-Type": "application/json",
    },
  });

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    const message = formatSpotifyApiErrorMessage(response.status, errorText, response.headers);
    traceGenerate("spotify_request_error", {
      url,
      method,
      status: response.status,
      body: errorText,
      message,
    });
    throw new Error(message);
  }

  traceGenerate("spotify_request_success", { url, method, status: response.status });
  return (await response.json()) as T;
}

export async function POST(request: NextRequest) {
  traceGenerate("api_generate_incoming", {
    method: request.method,
    url: request.url,
  });
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  if (!accessToken) {
    return NextResponse.json(
      { error: "You are not connected to Spotify. Please log in first." },
      { status: 401 },
    );
  }

  const body = (await request.json()) as GenerateRequestBody;
  const artistName = body.artistName?.trim();
  if (!artistName) {
    return NextResponse.json({ error: "Artist name is required." }, { status: 400 });
  }

  try {
    const searchParams = new URLSearchParams({
      q: artistName,
      type: "artist",
      limit: "1",
    });
    const searchData = await spotifyRequest<SpotifyArtistSearchResponse>(
      `/search?${searchParams.toString()}`,
      accessToken,
    );

    const artist = searchData.artists.items[0];
    if (!artist) {
      return NextResponse.json({ error: `Artist "${artistName}" was not found.` }, { status: 404 });
    }

    const trackSearchParams = new URLSearchParams({
      q: `artist:"${artist.name}"`,
      type: "track",
      limit: `${DEFAULT_RECOMMENDATION_LIMIT}`,
    });
    const trackSearch = await spotifyRequest<SpotifyTrackSearchResponse>(
      `/search?${trackSearchParams.toString()}`,
      accessToken,
    );

    const trackUris = trackSearch.tracks.items.map((track) => track.uri);
    if (trackUris.length === 0) {
      return NextResponse.json(
        { error: "No recommendation tracks were returned for this artist." },
        { status: 404 },
      );
    }

    const createdPlaylist = await spotifyRequest<SpotifyCreatePlaylistResponse>(
      "/me/playlists",
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          name: `Vibe Playlist - ${artist.name}`,
          description: `Auto-generated from artist seed: ${artist.name}`,
          public: false,
        }),
      },
    );

    await spotifyRequest<{ snapshot_id: string }>(
      `/playlists/${createdPlaylist.id}/tracks`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ uris: trackUris }),
      },
    );

    return NextResponse.json({
      playlistUrl: createdPlaylist.external_urls.spotify,
      playlistId: createdPlaylist.id,
      trackCount: trackUris.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate playlist right now. Please try again.";
    console.error("Playlist generation failed", message);
    return NextResponse.json(
      { error: message },
      { status: 502 },
    );
  }
}

function traceGenerate(event: string, payload: Record<string, unknown>): void {
  if (process.env.DEBUG_GENERATE_TRACE !== "true") {
    return;
  }

  console.log(`[TRACE][generate] ${event}`, payload);
}
