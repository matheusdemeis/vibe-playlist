import { NextRequest, NextResponse } from "next/server";
import { generatePlaylistTracks, PlaylistGenerationError, CATALOG_MOOD_GENRES, type GeneratePlaylistTracksInput } from "../../../../lib/playlist/generate";
import { TEMPO_OPTIONS, type TempoOption } from "../../../../lib/vibe-builder";
import { clearSpotifySession, getSpotifySession } from "../../../../lib/auth/spotify-session";
import { getSpotifyFailure } from "../../../../lib/spotify/error";
import { CatalogSearchError, isRecord } from "../../../../lib/spotify/catalog";
import { privateHeaders } from "../../../../lib/server/request";

export async function POST(request: NextRequest) {
  try {
    const { accessToken } = await getSpotifySession();
    if (!accessToken) return NextResponse.json({ error: "Connect Spotify to generate a playlist.", code: "not_authenticated" }, { status: 401 });
    let body: unknown;
    try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON payload.", code: "invalid_json" }, { status: 400 }); }
    const parsed = parseGeneratePayload(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: "invalid_request" }, { status: 400 });
    return NextResponse.json(await generatePlaylistTracks(accessToken, parsed.value), { headers: privateHeaders() });
  } catch (error) {
    const failure = error instanceof PlaylistGenerationError || error instanceof CatalogSearchError ? error : getSpotifyFailure(error);
    if (failure.status === 401) await clearSpotifySession();
    const retryAfterSeconds = "retryAfterSeconds" in failure ? failure.retryAfterSeconds : undefined;
    return NextResponse.json({ error: failure.message, code: failure.code, retryAfterSeconds }, { status: failure.status, headers: privateHeaders(retryAfterSeconds) });
  }
}

export function parseGeneratePayload(payload: unknown): { ok: true; value: GeneratePlaylistTracksInput } | { ok: false; error: string } {
  if (!isRecord(payload)) return { ok: false, error: "Request body must be a JSON object." };
  const array = (value: unknown, max: number, pattern?: RegExp): string[] | null => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > max || !value.every((item) => typeof item === "string" && item.trim().length > 0 && item.length <= 50 && (!pattern || pattern.test(item)))) return null;
    return [...new Set(value.map((item: string) => item.trim()))];
  };
  const seedGenres = array(payload.seedGenres, 10);
  const vibes = array(payload.vibes, 6);
  const referenceTrackIds = array(payload.referenceTrackIds, 100, /^[A-Za-z0-9]{22}$/);
  if (!seedGenres || !vibes || !referenceTrackIds) return { ok: false, error: "Choose valid moods, genres, and reference tracks." };
  if (vibes.some((mood) => !Object.prototype.hasOwnProperty.call(CATALOG_MOOD_GENRES, mood.toLowerCase().replace(/\s+/g, "")))) return { ok: false, error: "Choose a valid mood." };
  if (!seedGenres.length && !vibes.length && !referenceTrackIds.length) return { ok: false, error: "Select at least one mood, genre, or reference track." };
  const trackCount = payload.trackCount ?? 20;
  if (typeof trackCount !== "number" || !Number.isInteger(trackCount) || trackCount < 10 || trackCount > 100) return { ok: false, error: "Track count must be a whole number between 10 and 100." };
  for (const key of ["includeExplicit", "preferPreviews"] as const) {
    if (payload[key] !== undefined && typeof payload[key] !== "boolean") return { ok: false, error: `${key} must be a boolean.` };
  }
  for (const key of ["targetEnergy", "targetValence"] as const) {
    if (payload[key] !== undefined && (typeof payload[key] !== "number" || !Number.isFinite(payload[key]) || payload[key] < 0 || payload[key] > 100)) return { ok: false, error: `${key} must be between 0 and 100.` };
  }
  if (payload.tempo !== undefined && !TEMPO_OPTIONS.includes(payload.tempo as TempoOption)) return { ok: false, error: "Choose a valid tempo." };
  if (payload.maxTracksPerArtist !== undefined && (typeof payload.maxTracksPerArtist !== "number" || !Number.isInteger(payload.maxTracksPerArtist) || payload.maxTracksPerArtist < 1 || payload.maxTracksPerArtist > 100)) return { ok: false, error: "Invalid artist limit." };
  return { ok: true, value: { seedGenres, vibes, referenceTrackIds, trackCount,
    targetEnergy: (payload.targetEnergy as number | undefined) ?? 50, targetValence: (payload.targetValence as number | undefined) ?? 50,
    tempo: payload.tempo as TempoOption | undefined, includeExplicit: payload.includeExplicit !== false,
    preferPreviews: payload.preferPreviews === true, maxTracksPerArtist: payload.maxTracksPerArtist as number | undefined } };
}
