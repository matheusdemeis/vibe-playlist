import { NextRequest, NextResponse } from "next/server";
import {
  PlaylistSaveError,
  savePlaylistToSpotify,
  type SavePlaylistResult,
} from "../../../../lib/playlist/save";
import {
  getRequiredPlaylistModifyScope,
  getSpotifySession,
  hasGrantedScopes,
} from "../../../../lib/auth/spotify-session";
import { spotifyJson, SpotifyClientError } from "../../../../lib/spotify/client";

type SavePlaylistRequestBody = {
  name?: unknown;
  description?: unknown;
  isPublic?: unknown;
  trackUris?: unknown;
};

type SavePlaylistApiError = {
  error: string;
  code: string;
  details?: Record<string, unknown>;
};

type SavePlaylistApiResponse = SavePlaylistResult | SavePlaylistApiError;

export async function POST(request: NextRequest) {
  const { accessToken, grantedScopes } = await getSpotifySession();

  if (!accessToken) {
    return NextResponse.json<SavePlaylistApiResponse>(
      { error: "You are not connected to Spotify. Please log in first.", code: "not_authenticated" },
      { status: 401 },
    );
  }

  // Pre-flight: verify token is valid for this Spotify app before doing any playlist work.
  try {
    await spotifyJson<{ id: string }>({ method: "GET", path: "/me", accessToken });
  } catch (preflightError) {
    if (preflightError instanceof SpotifyClientError) {
      const isForbidden = preflightError.status === 403;
      console.error("[save-route] /me preflight failed", {
        status: preflightError.status,
        tokenTail: accessToken.slice(-6),
        body: preflightError.bodyText,
      });
      return NextResponse.json<SavePlaylistApiResponse>(
        {
          error: isForbidden
            ? "Spotify returned 403 on /me. If your Spotify app is in Development Mode, add your account at developer.spotify.com \u2192 App \u2192 User Management, then reconnect."
            : "Spotify token is invalid. Please reconnect.",
          code: isForbidden ? "spotify_dev_mode_forbidden" : "not_authenticated",
        },
        { status: preflightError.status },
      );
    }
    throw preflightError;
  }
  let body: SavePlaylistRequestBody;
  try {
    body = (await request.json()) as SavePlaylistRequestBody;
  } catch {
    return NextResponse.json<SavePlaylistApiResponse>(
      { error: "Invalid JSON payload.", code: "invalid_json" },
      { status: 400 },
    );
  }

  const parseResult = validateSavePayload(body);
  if (!parseResult.ok) {
    return NextResponse.json<SavePlaylistApiResponse>(
      { error: parseResult.error, code: "invalid_request" },
      { status: 400 },
    );
  }
  traceSave("received_public_flag", {
    raw: body.isPublic,
    normalized: parseResult.value.isPublic,
  });
  const requiredScope = getRequiredPlaylistModifyScope(parseResult.value.isPublic);
  const hasRequiredScope = hasGrantedScopes(grantedScopes, [requiredScope]);
  traceSave("playlist_scope_check", {
    grantedScopes,
    requiredScope,
    hasRequiredScope,
  });
  if (!hasRequiredScope) {
    return NextResponse.json<SavePlaylistApiResponse>(
      {
        error: "Reconnect to grant playlist permissions",
        code: "missing_scopes",
      },
      { status: 403 },
    );
  }

  try {
    const result = await savePlaylistToSpotify({
      accessToken,
      grantedScopes,
      name: parseResult.value.name,
      description: parseResult.value.description,
      isPublic: parseResult.value.isPublic,
      trackUris: parseResult.value.trackUris,
    });
    return NextResponse.json({
      playlistId: result.playlistId,
      playlistUrl: result.playlistUrl,
      snapshotId: null,
      tracksAddedCount: result.tracksAddedCount,
      tracksAdded: result.tracksAddedCount > 0,
      visibility: {
        requested: parseResult.value.isPublic,
        final: result.visibilityUpdated ? parseResult.value.isPublic : null,
      },
    });
  } catch (error) {
    if (error instanceof PlaylistSaveError) {
      const isOwnerMismatch = error.code === "playlist_owner_mismatch";
      const isAddTracksFailure = error.code === "spotify_add_tracks_failed";
      const isDevModeForbidden = error.code === "spotify_dev_mode_forbidden" || error.code === "spotify_me_failed";
      const shouldReconnect =
        error.status === 403 &&
        !isOwnerMismatch &&
        !isAddTracksFailure &&
        !isDevModeForbidden;
      return NextResponse.json<SavePlaylistApiResponse>(
        {
          error: isOwnerMismatch
            ? "Connected Spotify account does not own this playlist. Reconnect and try again."
            : isDevModeForbidden || !shouldReconnect
              ? error.message
              : "Reconnect to grant playlist permissions",
          code: isOwnerMismatch ? "playlist_owner_mismatch" : isDevModeForbidden ? error.code : shouldReconnect ? "missing_scopes" : error.code,
          details: isAddTracksFailure
            ? {
                ...error.details,
                endpoint: error.endpoint,
                spotifyBody: error.body,
              }
            : error.details,
        },
        { status: error.status },
      );
    }

    return NextResponse.json<SavePlaylistApiResponse>(
      { error: "Could not save playlist right now.", code: "playlist_save_failed" },
      { status: 502 },
    );
  }
}

export function validateSavePayload(payload: SavePlaylistRequestBody):
  | { ok: true; value: { name: string; description: string; isPublic: boolean; trackUris: string[] } }
  | { ok: false; error: string } {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const description = typeof payload.description === "string" ? payload.description.trim() : "";
  const isPublic = parsePublicFlag(payload.isPublic);
  const trackUris = parseStringArray(payload.trackUris);

  if (!name) {
    return { ok: false, error: "Playlist name is required." };
  }

  if (trackUris.length < 1 || trackUris.length > 300) {
    return { ok: false, error: "Track URIs must contain between 1 and 300 items." };
  }

  return {
    ok: true,
    value: {
      name,
      description,
      isPublic,
      trackUris,
    },
  };
}

function parsePublicFlag(value: unknown): boolean {
  return value === true;
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function traceSave(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log(`[TRACE][save] ${event}`, payload);
}
