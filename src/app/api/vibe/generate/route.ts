import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  generatePlaylistTracks,
  PlaylistGenerationError,
  type PlaylistGenerationResponse,
  type GeneratePlaylistTracksInput,
} from "@/lib/playlist/generate";
import { TEMPO_OPTIONS, type TempoOption } from "@/lib/vibe-builder";

const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";

type GenerateVibeApiError = {
  error: string;
  code: string;
};

type GenerateVibeApiResponse = PlaylistGenerationResponse | GenerateVibeApiError;

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;

  if (!accessToken) {
    return NextResponse.json<GenerateVibeApiResponse>(
      {
        error: "You are not connected to Spotify. Please log in first.",
        code: "not_authenticated",
      },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json<GenerateVibeApiResponse>(
      { error: "Invalid JSON payload.", code: "invalid_json" },
      { status: 400 },
    );
  }

  const parseResult = parseGeneratePayload(body);
  if (!parseResult.ok) {
    return NextResponse.json<GenerateVibeApiResponse>(
      { error: parseResult.error, code: "invalid_request" },
      { status: 400 },
    );
  }

  try {
    const result = await generatePlaylistTracks(accessToken, parseResult.value);
    return NextResponse.json<GenerateVibeApiResponse>(result);
  } catch (error) {
    if (error instanceof PlaylistGenerationError) {
      return NextResponse.json<GenerateVibeApiResponse>(
        { error: error.message, code: error.code },
        { status: error.status },
      );
    }

    return NextResponse.json<GenerateVibeApiResponse>(
      {
        error: "Could not generate playlist recommendations right now.",
        code: "generation_failed",
      },
      { status: 502 },
    );
  }
}

function parseGeneratePayload(payload: unknown):
  | { ok: true; value: GeneratePlaylistTracksInput }
  | { ok: false; error: string } {
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const body = payload as Record<string, unknown>;
  const seedGenres = parseStringArray(body.seedGenres);
  const referenceTrackIds = parseStringArray(body.referenceTrackIds);
  const targetEnergy = Number(body.targetEnergy);
  const targetValence = Number(body.targetValence);
  const trackCount = Number(body.trackCount);

  if (!Number.isFinite(targetEnergy) || !Number.isFinite(targetValence)) {
    return { ok: false, error: "targetEnergy and targetValence must be numbers." };
  }

  if (!Number.isFinite(trackCount)) {
    return { ok: false, error: "trackCount must be a number." };
  }

  if (seedGenres.length === 0 && referenceTrackIds.length === 0) {
    return { ok: false, error: "At least one seed genre or reference track is required." };
  }

  const tempo = isTempoOption(body.tempo) ? body.tempo : undefined;

  const preferPreviews = Boolean(body.preferPreviews);
  const maxTracksPerArtist =
    body.maxTracksPerArtist === undefined ? undefined : Number(body.maxTracksPerArtist);
  if (maxTracksPerArtist !== undefined && !Number.isFinite(maxTracksPerArtist)) {
    return { ok: false, error: "maxTracksPerArtist must be a number when provided." };
  }

  return {
    ok: true,
    value: {
      seedGenres,
      referenceTrackIds,
      targetEnergy,
      targetValence,
      trackCount,
      tempo,
      preferPreviews,
      maxTracksPerArtist,
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

function isTempoOption(value: unknown): value is TempoOption {
  return typeof value === "string" && TEMPO_OPTIONS.includes(value as TempoOption);
}
