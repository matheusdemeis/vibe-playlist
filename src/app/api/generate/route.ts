import { NextRequest, NextResponse } from "next/server";
import { formatSpotifyApiErrorMessage } from "../../../lib/spotify/error";
import { SpotifyClientError, spotifyRequest as spotifyHttpRequest } from "../../../lib/spotify/client";

const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
const DEFAULT_TRACK_SEARCH_LIMIT = 25;

type GenerateRequestBody = {
  query?: unknown;
  limit?: unknown;
};

type SpotifyTrackSearchResponse = {
  tracks: {
    items: Array<{
      id: string;
      name: string;
      uri: string;
      preview_url: string | null;
      is_playable?: boolean;
      restrictions?: {
        reason?: string;
      };
      artists: Array<{ name: string }>;
      album: {
        images: Array<{ url: string }>;
      };
    }>;
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
  const method = init?.method ?? "GET";
  traceGenerate("spotify_request_start", {
    path,
    method,
  });

  try {
    const data = await spotifyHttpRequest<T>({
      method,
      path,
      accessToken,
      headers: init?.headers,
    });
    traceGenerate("spotify_request_success", { path, method, status: 200 });
    return { ok: true, data };
  } catch (error) {
    if (error instanceof SpotifyClientError) {
      const message = formatSpotifyApiErrorMessage(
        error.status,
        error.bodyText,
        error.responseHeaders,
      );
      traceGenerate("spotify_request_error", {
        path,
        method,
        status: error.status,
        body: error.bodyText,
        message,
      });
      return {
        ok: false,
        error: {
          status: error.status,
          message,
          details: { path, method },
        },
      };
    }

    return {
      ok: false,
      error: {
        status: 500,
        message: "Failed to reach Spotify API.",
        details: { reason: error instanceof Error ? error.message : "Unknown fetch error" },
      },
    };
  }
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
  const limit = parsed.value.limit;

  try {
    const trackSearchParams = new URLSearchParams();
    trackSearchParams.set("q", query);
    trackSearchParams.set("type", "track");
    trackSearchParams.set("limit", String(limit));
    trackSearchParams.set("market", "from_token");
    const finalQueryString = trackSearchParams.toString();
    traceGenerate("spotify_search_query", {
      normalizedLimit: limit,
      queryString: finalQueryString,
    });
    const trackSearch = await spotifyRequest<SpotifyTrackSearchResponse>(
      `/search?${finalQueryString}`,
      accessToken,
    );
    if (!trackSearch.ok) {
      return jsonError(trackSearch.error.status, trackSearch.error.message, trackSearch.error.details);
    }

    return NextResponse.json({
      tracks: trackSearch.data.tracks.items
        .filter((track) => track.is_playable !== false)
        .filter((track) => !track.restrictions?.reason)
        .map((track) => ({
          id: track.id,
          name: track.name,
          artists: track.artists.map((artist) => artist.name),
          albumImage: track.album.images[0]?.url ?? null,
          uri: track.uri,
          preview_url: track.preview_url,
        })),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not generate playlist right now. Please try again.";
    console.error("Playlist generation failed", message);
    return jsonError(502, "Unexpected generate failure.", { message });
  }
}

function resolveLimit(value: unknown): number {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (Number.isNaN(parsed)) {
    return DEFAULT_TRACK_SEARCH_LIMIT;
  }

  return Math.min(50, Math.max(1, parsed));
}

function parseGenerateRequest(body: GenerateRequestBody):
  | { ok: true; value: { query: string; limit: number } }
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
      limit: resolveLimit(body.limit),
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

function traceGenerate(event: string, payload: Record<string, unknown>): void {
  if (process.env.DEBUG_GENERATE_TRACE !== "true") {
    return;
  }

  console.log(`[TRACE][generate] ${event}`, payload);
}
