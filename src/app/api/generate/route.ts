import { NextRequest, NextResponse } from "next/server";
import { formatSpotifyApiErrorMessage } from "../../../lib/spotify/error";
import { SpotifyClientError, spotifyRequest as spotifyHttpRequest } from "../../../lib/spotify/client";
import { getSpotifySession } from "../../../lib/auth/spotify-session";
import { normalizeVibeKey, VIBE_SEARCH_TERMS, type VibeKey } from "../../../lib/vibes";

const DEFAULT_TRACK_COUNT = 25;
const DEFAULT_SPOTIFY_SEARCH_LIMIT = 25;
const GENERIC_FALLBACK_QUERY = "popular hits";
const NO_TRACKS_WARNING = "We couldn't build that mix right now. Try another vibe or artist.";

type GenerateRequestBody = {
  query?: unknown;
  limit?: unknown;
  vibe?: unknown;
  artistId?: unknown;
};

type SpotifyTrack = {
  id: string;
  name: string;
  uri: string;
  preview_url: string | null;
  explicit?: boolean;
  is_playable?: boolean;
  restrictions?: {
    reason?: string;
  };
  artists: Array<{ id: string; name: string }>;
  album: {
    images: Array<{ url: string }>;
  };
};

type SpotifyTrackSearchResponse = {
  tracks: {
    items: SpotifyTrack[];
  };
};

type SpotifyArtistSearchResponse = {
  artists: {
    items: Array<{
      id: string;
      name: string;
    }>;
  };
};

type SpotifyRequestFailure = {
  status: number;
  message: string;
  details: Record<string, unknown> | null;
};

type SpotifyQueryParams = Record<string, string | number | boolean | undefined>;
type GeneratedTrack = {
  id: string;
  name: string;
  artists: string[];
  albumImage: string | null;
  uri: string;
  preview_url: string | null;
  artistIds: string[];
};

async function spotifyRequest<T>(
  options: {
    path: string;
    accessToken: string;
    method?: string;
    headers?: HeadersInit;
    query?: SpotifyQueryParams;
  },
): Promise<{ ok: true; data: T } | { ok: false; error: SpotifyRequestFailure }> {
  const method = options.method ?? "GET";
  traceGenerate("spotify_request_start", {
    path: options.path,
    method,
    query: options.query ?? null,
  });

  try {
    const data = await spotifyHttpRequest<T>({
      method,
      path: options.path,
      accessToken: options.accessToken,
      headers: options.headers,
      query: options.query,
    });
    traceGenerate("spotify_request_success", { path: options.path, method, status: 200 });
    return { ok: true, data };
  } catch (error) {
    if (error instanceof SpotifyClientError) {
      const message = formatSpotifyApiErrorMessage(
        error.status,
        error.bodyText,
        error.responseHeaders,
      );
      traceGenerate("spotify_request_error", {
        path: options.path,
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
          details: { path: options.path, method },
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

  const { accessToken } = await getSpotifySession();
  if (!accessToken) {
    return jsonError(401, "You are not connected to Spotify. Please log in first.");
  }

  const body = (await request.json()) as GenerateRequestBody;
  const parsed = parseGenerateRequest(body);
  if (!parsed.ok) {
    return jsonError(400, parsed.message, parsed.details);
  }

  const { query, requestedTrackCount, vibe, selectedArtistId } = parsed.value;

  try {
    const queryPlan = buildSearchQueries(query, vibe);
    const spotifySearchLimit = resolveSpotifySearchLimit(requestedTrackCount);
    const requiredArtistId =
      selectedArtistId || (query ? await resolveArtistId(query, accessToken) : null);
    const tracks = await generateFromSearchQueries(
      queryPlan,
      spotifySearchLimit,
      accessToken,
      requiredArtistId,
    );

    traceGenerate("search_generation_complete", {
      selectedVibe: vibe,
      plannedQueries: queryPlan,
      spotifySearchLimit,
      requiredArtistId,
      tracksReturned: tracks.length,
      requestedTrackCount,
    });

    if (tracks.length === 0) {
      return NextResponse.json({ tracks: [], warning: NO_TRACKS_WARNING });
    }

    return NextResponse.json({
      tracks: tracks.slice(0, requestedTrackCount).map((track) => ({
        id: track.id,
        name: track.name,
        artists: track.artists,
        albumImage: track.albumImage,
        uri: track.uri,
        preview_url: track.preview_url,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown generation failure.";
    console.error("Playlist generation failed", message);
    return NextResponse.json({ tracks: [], warning: NO_TRACKS_WARNING });
  }
}

function resolveRequestedTrackCount(value: unknown): number {
  const rawValue = typeof value === "number" || typeof value === "string" ? String(value) : "";
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_TRACK_COUNT;
  }

  return Math.min(50, Math.max(1, parsed));
}

function resolveSpotifySearchLimit(requestedTrackCount: number): number {
  const safeRequested = Number.isFinite(requestedTrackCount)
    ? Math.min(50, Math.max(1, Math.trunc(requestedTrackCount)))
    : DEFAULT_TRACK_COUNT;

  // Use a conservative search limit to avoid API edge cases from user-entered values.
  return Math.min(50, Math.max(20, safeRequested, DEFAULT_SPOTIFY_SEARCH_LIMIT));
}

function parseGenerateRequest(body: GenerateRequestBody):
  | {
      ok: true;
      value: {
        query: string;
        requestedTrackCount: number;
        vibe: VibeKey | null;
        selectedArtistId: string | null;
      };
    }
  | { ok: false; message: string; details: Record<string, unknown> } {
  const query = normalizeQuery(typeof body.query === "string" ? body.query : "");
  const vibe = normalizeVibeKey(body.vibe);
  const selectedArtistId = normalizeQuery(typeof body.artistId === "string" ? body.artistId : "");

  if (!vibe && query.length < 2) {
    return {
      ok: false,
      message: "Query is required and must be at least 2 characters when no vibe is selected.",
      details: { field: "query", minLength: 2, requiresQueryWhenVibeMissing: true },
    };
  }

  return {
    ok: true,
    value: {
      query,
      requestedTrackCount: resolveRequestedTrackCount(body.limit),
      vibe,
      selectedArtistId: selectedArtistId || null,
    },
  };
}

async function generateFromSearchQueries(
  queries: string[],
  spotifySearchLimit: number,
  accessToken: string,
  requiredArtistId: string | null,
): Promise<GeneratedTrack[]> {
  const tracksById = new Map<string, GeneratedTrack>();

  for (const query of queries) {
    const search = await searchTracks(query, spotifySearchLimit, accessToken);
    if (!search.ok) {
      traceGenerate("search_query_failed", {
        query,
        status: search.error.status,
      });
      continue;
    }

    const mapped = mapTracks(search.data.tracks.items);
    const filtered = requiredArtistId
      ? mapped.filter((track) => track.artistIds.includes(requiredArtistId))
      : mapped;
    for (const track of filtered) {
      if (!tracksById.has(track.id)) {
        tracksById.set(track.id, track);
      }
    }

    traceGenerate("search_query_result", {
      query,
      returned: mapped.length,
      returnedAfterArtistFilter: filtered.length,
      dedupedTotal: tracksById.size,
    });
  }

  return Array.from(tracksById.values());
}

async function resolveArtistId(query: string, accessToken: string): Promise<string | null> {
  const artistSearch = await spotifyRequest<SpotifyArtistSearchResponse>({
    path: "/search",
    accessToken,
    method: "GET",
    query: {
      q: query,
      type: "artist",
      limit: 5,
    },
  });

  if (!artistSearch.ok || artistSearch.data.artists.items.length === 0) {
    return null;
  }

  const normalizedQuery = normalizeForMatch(query);
  const exactMatch = artistSearch.data.artists.items.find(
    (artist) => normalizeForMatch(artist.name) === normalizedQuery,
  );

  return (exactMatch ?? artistSearch.data.artists.items[0])?.id ?? null;
}

async function searchTracks(query: string, limit: number, accessToken: string) {
  const sanitizedLimit = sanitizeSpotifyLimit(limit);
  const baseQuery = {
    q: query,
    type: "track",
    limit: sanitizedLimit,
  } as const;

  traceGenerate("spotify_search_query", {
    query,
    type: baseQuery.type,
    sanitizedLimit,
    market: null,
  });

  const firstAttempt = await spotifyRequest<SpotifyTrackSearchResponse>({
    path: "/search",
    accessToken,
    method: "GET",
    query: baseQuery,
  });
  if (
    firstAttempt.ok ||
    firstAttempt.error.status !== 400 ||
    !firstAttempt.error.message.toLowerCase().includes("invalid limit")
  ) {
    return firstAttempt;
  }

  const fallbackLimit = 10;
  traceGenerate("spotify_search_limit_retry", {
    query,
    attemptedLimit: sanitizedLimit,
    fallbackLimit,
  });

  return spotifyRequest<SpotifyTrackSearchResponse>({
    path: "/search",
    accessToken,
    method: "GET",
    query: {
      q: query,
      type: "track",
      limit: fallbackLimit,
    },
  });
}

function buildSearchQueries(query: string, vibe: VibeKey | null): string[] {
  const vibeQuery = vibe ? normalizeQuery(VIBE_SEARCH_TERMS[vibe]) : "";
  const normalizedArtistQuery = normalizeQuery(query);
  const queries: string[] = [];

  if (normalizedArtistQuery && vibeQuery) {
    queries.push(normalizeQuery(`${normalizedArtistQuery} ${vibeQuery}`));
  }
  if (normalizedArtistQuery) {
    queries.push(normalizedArtistQuery);
  }
  if (vibeQuery) {
    queries.push(vibeQuery);
  }
  queries.push(GENERIC_FALLBACK_QUERY);

  return Array.from(new Set(queries.filter((item) => item.length > 0)));
}

function mapTracks(tracks: SpotifyTrack[]) {
  return tracks
    .filter((track) => track.is_playable !== false)
    .filter((track) => !track.restrictions?.reason)
    .map((track) => ({
      id: track.id,
      name: track.name,
      artists: track.artists.map((artist) => artist.name),
      artistIds: track.artists.map((artist) => artist.id),
      albumImage: track.album.images[0]?.url ?? null,
      uri: track.uri,
      preview_url: track.preview_url,
    }));
}

function normalizeQuery(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeForMatch(value: string): string {
  return normalizeQuery(value).toLowerCase();
}

function sanitizeSpotifyLimit(value: unknown): number {
  const rawValue = typeof value === "number" || typeof value === "string" ? String(value) : "";
  const parsed = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsed)) {
    return 10;
  }

  return Math.min(50, Math.max(1, parsed));
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
