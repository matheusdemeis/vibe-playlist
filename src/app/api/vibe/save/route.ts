import { NextRequest, NextResponse } from "next/server";
import { PlaylistSaveError, savePlaylistToSpotify, buildTrackUris } from "../../../../lib/playlist/save";
import { clearSpotifySession, getRequiredPlaylistModifyScope, getSpotifySession, hasGrantedScopes } from "../../../../lib/auth/spotify-session";
import { getSpotifyFailure } from "../../../../lib/spotify/error";
import { privateHeaders, rejectCrossOrigin } from "../../../../lib/server/request";

type ValidSavePayload = { name: string; description: string; isPublic: boolean; trackUris: string[]; draftId?: string; recoveryToken?: string };

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  let savingStarted = false;
  try {
    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ error: "Invalid JSON payload.", code: "invalid_json", retrySafe: true }, { status: 400 });
    }
    const parsed = validateSavePayload(body);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error, code: "invalid_request", retrySafe: true }, { status: 400 });
    const { accessToken, grantedScopes } = await getSpotifySession();
    if (!accessToken) return NextResponse.json({ error: "Connect Spotify before saving.", code: "not_authenticated", retrySafe: true }, { status: 401 });
    const scopes = [getRequiredPlaylistModifyScope(parsed.value.isPublic), "playlist-read-private"];
    if (!hasGrantedScopes(grantedScopes, scopes)) {
      return NextResponse.json({ error: "Reconnect Spotify to grant playlist permissions.", code: "missing_scopes", retrySafe: true }, { status: 403 });
    }
    savingStarted = true;
    const result = await savePlaylistToSpotify({ ...parsed.value, accessToken, grantedScopes });
    return NextResponse.json({ ...result, tracksAdded: result.tracksAddedCount > 0,
      visibility: { requested: parsed.value.isPublic, final: result.isPublic } }, { headers: privateHeaders() });
  } catch (error) {
    const failure = error instanceof PlaylistSaveError ? error : getSpotifyFailure(error);
    if (failure.status === 401) await clearSpotifySession();
    return NextResponse.json({ error: failure.message, code: failure.code,
      retryAfterSeconds: failure.retryAfterSeconds,
      retrySafe: error instanceof PlaylistSaveError ? error.retrySafe : !savingStarted,
      ...(error instanceof PlaylistSaveError && error.recovery ? { recovery: error.recovery } : {}) },
    { status: failure.status, headers: privateHeaders(failure.retryAfterSeconds) });
  }
}

export function validateSavePayload(payload: unknown): { ok: true; value: ValidSavePayload } | { ok: false; error: string } {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { ok: false, error: "Request body must be a JSON object." };
  const body = payload as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name || name.length > 100) return { ok: false, error: "Playlist name is required and must be at most 100 characters." };
  if (body.description !== undefined && typeof body.description !== "string") return { ok: false, error: "Description must be text." };
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description.length > 300) return { ok: false, error: "Description must be at most 300 characters." };
  if (body.isPublic !== undefined && typeof body.isPublic !== "boolean") return { ok: false, error: "Playlist visibility must be a boolean." };
  if (!Array.isArray(body.trackUris) || body.trackUris.length < 1 || body.trackUris.length > 300) return { ok: false, error: "Track URIs must contain between 1 and 300 items." };
  if (!body.trackUris.every((uri) => typeof uri === "string" && /^spotify:track:[A-Za-z0-9]{22}$/.test(uri))) return { ok: false, error: "Every track must have a valid Spotify track URI." };
  if (body.draftId !== undefined && (typeof body.draftId !== "string" || !/^[a-f0-9-]{36}$/i.test(body.draftId))) return { ok: false, error: "Invalid playlist draft." };
  if (body.recoveryToken !== undefined && (typeof body.recoveryToken !== "string" || body.recoveryToken.length > 2000 || !body.recoveryToken)) return { ok: false, error: "Invalid playlist recovery token." };
  return { ok: true, value: { name, description, isPublic: body.isPublic === true, trackUris: buildTrackUris(body.trackUris as string[]),
    draftId: body.draftId as string | undefined, recoveryToken: body.recoveryToken as string | undefined } };
}
