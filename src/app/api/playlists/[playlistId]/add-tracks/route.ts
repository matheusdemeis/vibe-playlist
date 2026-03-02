import { NextRequest, NextResponse } from "next/server";
import { addTracksInBatches, PlaylistSaveError } from "@/lib/playlist/save";
import {
  getSpotifySession,
  hasRequiredPlaylistScopes,
  REQUIRED_PLAYLIST_SCOPES,
} from "@/lib/auth/spotify-session";

type AddTracksBody = {
  trackUris?: unknown;
};

type AddTracksSuccess = {
  playlistId: string;
  snapshotId: string | null;
  tracksAdded: true;
};

type AddTracksError = {
  error: {
    message: string;
    status: number;
    endpoint?: string;
  };
};

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ playlistId: string }> },
) {
  const { accessToken, scopes } = await getSpotifySession();
  if (!accessToken) {
    return NextResponse.json<AddTracksError>(
      { error: { message: "You are not connected to Spotify.", status: 401 } },
      { status: 401 },
    );
  }
  traceAddTracks("playlist_scope_check", {
    scopes,
    hasRequiredScopes: hasRequiredPlaylistScopes(scopes),
    requiredScopes: REQUIRED_PLAYLIST_SCOPES,
  });

  const { playlistId } = await context.params;
  if (!playlistId) {
    return NextResponse.json<AddTracksError>(
      { error: { message: "Playlist ID is required.", status: 400 } },
      { status: 400 },
    );
  }

  let body: AddTracksBody;
  try {
    body = (await request.json()) as AddTracksBody;
  } catch {
    return NextResponse.json<AddTracksError>(
      { error: { message: "Invalid JSON payload.", status: 400 } },
      { status: 400 },
    );
  }

  const trackUris = parseTrackUris(body.trackUris);
  if (trackUris.length < 1) {
    return NextResponse.json<AddTracksError>(
      { error: { message: "At least one track URI is required.", status: 400 } },
      { status: 400 },
    );
  }

  try {
    const snapshotId = await addTracksInBatches(accessToken, playlistId, trackUris, 100);
    return NextResponse.json<AddTracksSuccess>({
      playlistId,
      snapshotId,
      tracksAdded: true,
    });
  } catch (error) {
    if (error instanceof PlaylistSaveError) {
      return NextResponse.json<AddTracksError>(
        {
          error: {
            message: error.message,
            status: error.status,
            endpoint: error.endpoint,
          },
        },
        { status: error.status },
      );
    }

    return NextResponse.json<AddTracksError>(
      { error: { message: "Could not add tracks right now.", status: 502 } },
      { status: 502 },
    );
  }
}

function parseTrackUris(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
}

function traceAddTracks(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.log(`[TRACE][add-tracks] ${event}`, payload);
}
