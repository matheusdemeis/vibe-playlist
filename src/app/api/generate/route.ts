import { NextRequest, NextResponse } from "next/server";
import { formatSpotifyApiErrorMessage } from "../../../lib/spotify/error";

const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
const DEFAULT_TRACK_SEARCH_LIMIT = 25;
const SPOTIFY_TRACKS_BATCH_SIZE = 100;

type GenerateRequestBody = {
  query?: unknown;
  dryRun?: unknown;
  limit?: unknown;
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

type SpotifyRequestFailure = {
  status: number;
  message: string;
  details: Record<string, unknown> | null;
};

async function spotifyRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<{ ok: true; data: T } | { ok: false; error: SpotifyRequestFailure }> {
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

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    });
  } catch (error) {
    return {
      ok: false,
      error: {
        status: 500,
        message: "Failed to reach Spotify API.",
        details: { reason: error instanceof Error ? error.message : "Unknown fetch error" },
      },
    };
  }

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
    return {
      ok: false,
      error: {
        status: response.status,
        message,
        details: { url, method },
      },
    };
  }

  traceGenerate("spotify_request_success", { url, method, status: response.status });
  return { ok: true, data: (await response.json()) as T };
}

export async function POST(request: NextRequest) {
  traceGenerate("api_generate_incoming", {
    method: request.method,
    url: request.url,
  });
  const accessToken = request.cookies.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  if (!accessToken) {
    return jsonError(401, "You are not connected to Spotify. Please log in first.");
  }

  const body = (await request.json()) as GenerateRequestBody;
  const parsed = parseGenerateRequest(body);
  if (!parsed.ok) {
    return jsonError(400, parsed.message, parsed.details);
  }
  const query = parsed.value.query;
  const dryRun = parsed.value.dryRun;
  const limit = parsed.value.limit;

  try {
    const resolvedUrls: string[] = [];

    const trackSearchParams = new URLSearchParams({
      q: query,
      type: "track",
      limit: String(limit),
    });
    resolvedUrls.push(`${SPOTIFY_API_BASE_URL}/search?${trackSearchParams.toString()}`);
    const trackSearch = await spotifyRequest<SpotifyTrackSearchResponse>(
      `/search?${trackSearchParams.toString()}`,
      accessToken,
    );
    if (!trackSearch.ok) {
      return jsonError(trackSearch.error.status, trackSearch.error.message, trackSearch.error.details);
    }

    const trackUris = trackSearch.data.tracks.items.map((track) => track.uri);
    if (trackUris.length === 0) {
      return NextResponse.json(
        { error: "No tracks were returned for this query." },
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
    if (!me.ok) {
      return jsonError(me.error.status, me.error.message, me.error.details);
    }
    resolvedUrls.push(`${SPOTIFY_API_BASE_URL}/users/${me.data.id}/playlists`);
    const createdPlaylist = await spotifyRequest<SpotifyCreatePlaylistResponse>(
      `/users/${me.data.id}/playlists`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({
          name: `Vibe Playlist - ${query}`,
          description: `Auto-generated from query: ${query}`,
          public: false,
        }),
      },
    );
    if (!createdPlaylist.ok) {
      return jsonError(
        createdPlaylist.error.status,
        createdPlaylist.error.message,
        createdPlaylist.error.details,
      );
    }

    const addTracksError = await addTracksInBatches(createdPlaylist.data.id, trackUris, accessToken);
    if (addTracksError) {
      return jsonError(addTracksError.status, addTracksError.message, addTracksError.details);
    }

    return NextResponse.json({
      playlistUrl: createdPlaylist.data.external_urls.spotify,
      playlistId: createdPlaylist.data.id,
      trackCount: trackUris.length,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate playlist right now. Please try again.";
    console.error("Playlist generation failed", message);
    return jsonError(502, "Unexpected generate failure.", { message });
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

function parseGenerateRequest(body: GenerateRequestBody):
  | { ok: true; value: { query: string; limit: number; dryRun: boolean } }
  | { ok: false; message: string; details: Record<string, unknown> } {
  const query = typeof body.query === "string" ? body.query.trim() : "";
  if (query.length < 2) {
    return {
      ok: false,
      message: "Query is required and must be at least 2 characters.",
      details: { field: "query", minLength: 2 },
    };
  }

  return {
    ok: true,
    value: {
      query,
      limit: resolveLimit(body.limit as number | string | undefined),
      dryRun: body.dryRun === true,
    },
  };
}

function jsonError(status: number, message: string, details?: Record<string, unknown> | null) {
  return NextResponse.json(
    {
      error: {
        message,
        status,
        details: details ?? null,
      },
    },
    { status },
  );
}

export async function addTracksInBatches(
  playlistId: string,
  trackUris: string[],
  accessToken: string,
): Promise<SpotifyRequestFailure | null> {
  for (let index = 0; index < trackUris.length; index += SPOTIFY_TRACKS_BATCH_SIZE) {
    const uris = trackUris.slice(index, index + SPOTIFY_TRACKS_BATCH_SIZE);
    const added = await spotifyRequest<{ snapshot_id: string }>(
      `/playlists/${playlistId}/tracks`,
      accessToken,
      {
        method: "POST",
        body: JSON.stringify({ uris }),
      },
    );
    if (!added.ok) {
      return added.error;
    }
  }

  return null;
}

function traceGenerate(event: string, payload: Record<string, unknown>): void {
  if (process.env.DEBUG_GENERATE_TRACE !== "true") {
    return;
  }

  console.log(`[TRACE][generate] ${event}`, payload);
}
