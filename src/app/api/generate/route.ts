import { NextRequest, NextResponse } from "next/server";
import { formatSpotifyApiErrorMessage } from "../../../lib/spotify/error";

const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
const DEFAULT_TRACK_SEARCH_LIMIT = 25;
const SPOTIFY_TRACKS_BATCH_SIZE = 100;

type GenerateRequestBody = {
  artistName?: string;
  dryRun?: boolean;
  limit?: number | string;
};

type SpotifyTrackSearchResponse = {
  tracks: {
    items: Array<{ uri: string }>;
  };
};

type SpotifyMeResponse = {
  id: string;
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
  const dryRun = body.dryRun === true;
  const limit = resolveLimit(body.limit);
  if (!artistName) {
    return NextResponse.json({ error: "Artist name is required." }, { status: 400 });
  }

  try {
    const resolvedUrls: string[] = [];

    const trackSearchParams = new URLSearchParams({
      q: artistName,
      type: "track",
      limit: String(limit),
    });
    resolvedUrls.push(`${SPOTIFY_API_BASE_URL}/search?${trackSearchParams.toString()}`);
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

    if (dryRun) {
      return NextResponse.json({
        dryRun: true,
        resolvedUrls,
        trackCount: trackUris.length,
      });
    }

    resolvedUrls.push(`${SPOTIFY_API_BASE_URL}/me`);
    const me = await spotifyRequest<SpotifyMeResponse>("/me", accessToken);
    resolvedUrls.push(`${SPOTIFY_API_BASE_URL}/users/${me.id}/playlists`);
    const createdPlaylist = await spotifyRequest<SpotifyCreatePlaylistResponse>(
      `/users/${me.id}/playlists`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          name: `Vibe Playlist - ${artistName}`,
          description: `Auto-generated from query: ${artistName}`,
          public: false,
        }),
      },
    );

    await addTracksInBatches(createdPlaylist.id, trackUris, accessToken);

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

function resolveLimit(value: number | string | undefined): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TRACK_SEARCH_LIMIT;
  }

  const integer = Math.trunc(parsed);
  return Math.min(50, Math.max(1, integer));
}

export async function addTracksInBatches(
  playlistId: string,
  trackUris: string[],
  accessToken: string,
): Promise<void> {
  for (let index = 0; index < trackUris.length; index += SPOTIFY_TRACKS_BATCH_SIZE) {
    const uris = trackUris.slice(index, index + SPOTIFY_TRACKS_BATCH_SIZE);
    await spotifyRequest<{ snapshot_id: string }>(
      `/playlists/${playlistId}/tracks`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ uris }),
      },
    );
  }
}

function traceGenerate(event: string, payload: Record<string, unknown>): void {
  if (process.env.DEBUG_GENERATE_TRACE !== "true") {
    return;
  }

  console.log(`[TRACE][generate] ${event}`, payload);
}
