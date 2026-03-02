import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  PlaylistSaveError,
  savePlaylistToSpotify,
  type SavePlaylistResult,
} from "@/lib/playlist/save";

const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";

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
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;

  if (!accessToken) {
    return NextResponse.json<SavePlaylistApiResponse>(
      { error: "You are not connected to Spotify. Please log in first.", code: "not_authenticated" },
      { status: 401 },
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

  const parseResult = parseSavePayload(body);
  if (!parseResult.ok) {
    return NextResponse.json<SavePlaylistApiResponse>(
      { error: parseResult.error, code: "invalid_request" },
      { status: 400 },
    );
  }

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
      return NextResponse.json<SavePlaylistApiResponse>(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    return NextResponse.json<SavePlaylistApiResponse>(
      { error: "Could not save playlist right now.", code: "playlist_save_failed" },
      { status: 502 },
    );
  }
}

function parseSavePayload(payload: SavePlaylistRequestBody):
  | { ok: true; value: { name: string; description: string; isPublic: boolean; trackUris: string[] } }
  | { ok: false; error: string } {
  const name = typeof payload.name === "string" ? payload.name.trim() : "";
  const description = typeof payload.description === "string" ? payload.description.trim() : "";
  const isPublic = Boolean(payload.isPublic);
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
