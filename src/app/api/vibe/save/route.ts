import { NextRequest, NextResponse } from "next/server";
import {
  PlaylistSaveError,
  savePlaylistToSpotify,
  type SavePlaylistResult,
} from "../../../../lib/playlist/save";
import {
  getSpotifySession,
  hasRequiredPlaylistScopes,
  REQUIRED_PLAYLIST_SCOPES,
} from "@/lib/auth/spotify-session";

type SavePlaylistRequestBody = {
  name?: unknown;
  description?: unknown;
  isPublic?: unknown;
  trackUris?: unknown;
};

type SavePlaylistApiError = {
  error: string;
  code: string;
};

type SavePlaylistApiResponse = SavePlaylistResult | SavePlaylistApiError;

export async function POST(request: NextRequest) {
  const { accessToken, scopes } = await getSpotifySession();

  if (!accessToken) {
    return NextResponse.json<SavePlaylistApiResponse>(
      { error: "You are not connected to Spotify. Please log in first.", code: "not_authenticated" },
      { status: 401 },
    );
  }
  traceSave("playlist_scope_check", {
    scopes,
    hasRequiredScopes: hasRequiredPlaylistScopes(scopes),
    requiredScopes: REQUIRED_PLAYLIST_SCOPES,
  });
  if (!hasRequiredPlaylistScopes(scopes)) {
    return NextResponse.json<SavePlaylistApiResponse>(
      {
        error: "Reconnect Spotify to grant playlist permissions",
        code: "missing_scopes",
      },
      { status: 403 },
    );
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

  try {
    const result = await savePlaylistToSpotify({
      accessToken,
      name: parseResult.value.name,
      description: parseResult.value.description,
      isPublic: parseResult.value.isPublic,
      trackUris: parseResult.value.trackUris,
    });
    return NextResponse.json<SavePlaylistApiResponse>(result);
  } catch (error) {
    if (error instanceof PlaylistSaveError) {
      const shouldReconnect = error.status === 403;
      return NextResponse.json<SavePlaylistApiResponse>(
        {
          error: shouldReconnect
            ? "Reconnect Spotify to grant playlist permissions"
            : error.message,
          code: shouldReconnect ? "missing_scopes" : error.code,
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
  const isPublic = payload.isPublic === true;
  const trackUris = parseStringArray(payload.trackUris);

  if (!name) {
    return { ok: false, error: "Playlist name is required." };
  }

  if (trackUris.length < 1 || trackUris.length > 100) {
    return { ok: false, error: "Track URIs must contain between 1 and 100 items." };
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
