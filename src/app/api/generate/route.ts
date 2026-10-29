import { NextRequest, NextResponse } from "next/server";
import { clearSpotifySession, getSpotifySession } from "../../../lib/auth/spotify-session";
import { getSpotifyFailure } from "../../../lib/spotify/error";
import {
  CatalogSearchError, isRecord, quoteSearchValue, resolveExactArtist, searchCatalogTracks,
} from "../../../lib/spotify/catalog";
import { normalizeVibeKey, VIBE_CONFIG } from "../../../lib/vibes";

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await getSpotifySession();
    if (!accessToken) return jsonError(401, "Connect to Spotify to create a playlist.", "not_authenticated");

    let body: unknown;
    try { body = await request.json(); } catch {
      return jsonError(400, "Invalid JSON payload.", "invalid_json");
    }
    if (!isRecord(body)) return jsonError(400, "Request body must be a JSON object.", "invalid_request");
    const query = typeof body.query === "string" ? body.query.trim().replace(/\s+/g, " ") : "";
    const vibe = normalizeVibeKey(body.vibe);
    if (body.vibe != null && (!vibe || !Object.prototype.hasOwnProperty.call(VIBE_CONFIG, vibe))) {
      return jsonError(400, "Choose a valid mood.", "invalid_request");
    }
    if (body.query !== undefined && typeof body.query !== "string") {
      return jsonError(400, "Artist or track preference must be text.", "invalid_request");
    }
    const artistId = typeof body.artistId === "string" ? body.artistId.trim() : undefined;
    if (body.artistId != null && (!artistId || !/^[a-zA-Z0-9]{22}$/.test(artistId))) {
      return jsonError(400, "Choose a valid Spotify artist.", "invalid_request");
    }
    if ((!vibe && !artistId && query.length < 2) || query.length > 150) {
      return jsonError(400, "Enter at least 2 characters or select a mood. Preferences must be at most 150 characters.", "invalid_request", { field: "query" });
    }
    const requestedCount = body.limit === undefined ? 25 : Number(body.limit);
    if ((body.limit !== undefined && typeof body.limit !== "number" && typeof body.limit !== "string") ||
      !Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 50) {
      return jsonError(400, "Playlist length must be a whole number between 1 and 50.", "invalid_request");
    }
    if (body.includeExplicit !== undefined && typeof body.includeExplicit !== "boolean") {
      return jsonError(400, "includeExplicit must be a boolean.", "invalid_request");
    }

    const artist = query || artistId ? await resolveExactArtist(accessToken, query, artistId) : null;
    const preference = artist ? `artist:${quoteSearchValue(artist.name)}` : query;
    const queries = vibe ? VIBE_CONFIG[vibe].seedGenres.map((genre) =>
      [preference, `genre:${quoteSearchValue(genre)}`].filter(Boolean).join(" "),
    ) : [preference];
    const tracks = await searchCatalogTracks(accessToken, {
      queries, targetCount: requestedCount, requiredArtistId: artist?.id,
      includeExplicit: body.includeExplicit !== false,
    });
    const warning = tracks.length === 0
      ? "No catalog matches were found for those preferences. Try a different mood or artist."
      : tracks.length < requestedCount
        ? `Found ${tracks.length} matching tracks. Try broader preferences for a longer playlist.` : undefined;

    return NextResponse.json({
      tracks: tracks.map((track) => ({
        id: track.id, name: track.name, artists: track.artists.map((artist) => artist.name),
        albumImage: track.album.images[0]?.url ?? null, uri: track.uri,
        preview_url: track.preview_url,
      })),
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    const failure = error instanceof CatalogSearchError ? error : getSpotifyFailure(error);
    if (failure.status === 401) await clearSpotifySession();
    const retryAfterSeconds = "retryAfterSeconds" in failure ? failure.retryAfterSeconds : undefined;
    return jsonError(failure.status, failure.message, failure.code, undefined, retryAfterSeconds);
  }
}

function jsonError(status: number, message: string, code: string, details?: Record<string, unknown>, retryAfterSeconds?: number) {
  return NextResponse.json({ error: { status, message, code, ...(details ? { details } : {}),
    ...(retryAfterSeconds !== undefined ? { retryAfterSeconds } : {}) } }, {
    status,
    headers: { "Cache-Control": "no-store", ...(retryAfterSeconds !== undefined ? { "Retry-After": String(retryAfterSeconds) } : {}) },
  });
}
