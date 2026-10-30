import { spotifyJson, SpotifyClientError } from "../spotify/client";
import { getSpotifyFailure } from "../spotify/error";
import { createSaveReceipt, fingerprintPlaylist, getSaveSigningKey, readSaveReceipt } from "./save-receipt";
import { runSaveOperation, SaveOperationConflict } from "./save-operations";

export const SPOTIFY_TRACKS_BATCH_SIZE = 100;
export type PlaylistRecovery = { playlistId: string; playlistUrl: string; recoveryToken: string };
type SavePlaylistInput = {
  accessToken: string; grantedScopes: string[]; name: string; description: string;
  isPublic: boolean; trackUris: string[]; draftId?: string; recoveryToken?: string;
};
export type SavePlaylistResult = {
  playlistName: string; playlistId: string; playlistUrl: string;
  isPublic: boolean | null; tracksAddedCount: number;
};
type PlaylistMetadata = { id?: string; public?: boolean | null; owner?: { id?: string }; snapshot_id?: string };

export class PlaylistSaveError extends Error {
  status: number;
  code: string;
  retrySafe = false;
  retryAfterSeconds?: number;
  recovery?: PlaylistRecovery;
  details?: Record<string, unknown>;
  constructor(message: string, status = 502, code = "playlist_save_failed", options?: {
    retrySafe?: boolean; retryAfterSeconds?: number; recovery?: PlaylistRecovery; extra?: Record<string, unknown>;
  }) {
    super(message);
    this.name = "PlaylistSaveError";
    this.status = status;
    this.code = code;
    Object.assign(this, options);
    this.details = options?.extra;
  }
}

export async function savePlaylistToSpotify(input: SavePlaylistInput): Promise<SavePlaylistResult> {
  const trackUris = buildTrackUris(input.trackUris);
  if (!trackUris.length || trackUris.length > 300) throw new PlaylistSaveError("Choose between 1 and 300 valid tracks.", 400, "invalid_tracks", { retrySafe: true });
  let key: Buffer;
  let ownerId: string;
  try {
    key = getSaveSigningKey(); // Check configuration before any Spotify mutation.
    const me = await spotifyJson<{ id?: string }>({ path: "/me", accessToken: input.accessToken });
    if (!me.id) throw new Error("Invalid Spotify profile.");
    ownerId = me.id;
  } catch (error) { throw asSaveError(error, true); }
  const fingerprint = fingerprintPlaylist({ ...input, trackUris });
  const receipt = input.recoveryToken ? readSaveReceipt(input.recoveryToken, ownerId, fingerprint, key) : null;
  if (input.recoveryToken && !receipt) {
    throw new PlaylistSaveError("This recovery link expired or belongs to another draft or Spotify account. Open the existing playlist in Spotify.", 409, "invalid_recovery");
  }
  const operationKey = `${ownerId}:${input.draftId ?? fingerprint}`;
  try {
    return await runSaveOperation(operationKey, fingerprint, Boolean(receipt), async () => {
      let playlistId = receipt?.playlistId;
      let visibility: boolean | null = null;
      if (!playlistId) {
        try {
          const created = await spotifyJson<PlaylistMetadata>({
            method: "POST", path: "/me/playlists", accessToken: input.accessToken,
            json: { name: input.name, description: input.description, public: input.isPublic },
          });
          if (!created.id || !/^[A-Za-z0-9]{22}$/.test(created.id)) {
            throw new PlaylistSaveError("Spotify may have created this playlist, but its response was incomplete. Check your Spotify library before saving again.", 502, "save_outcome_unknown");
          }
          playlistId = created.id;
          visibility = typeof created.public === "boolean" ? created.public : null;
        } catch (error) {
          if (error instanceof PlaylistSaveError) throw error;
          const rejected = error instanceof SpotifyClientError && [400, 401, 403, 404, 429].includes(error.status);
          const failure = asSaveError(error, rejected);
          if (!rejected) {
            failure.code = "save_outcome_unknown";
            failure.message = "Spotify may have created this playlist. Check your Spotify library before saving again.";
          }
          throw failure;
        }
      }
      const recovery: PlaylistRecovery = {
        playlistId, playlistUrl: `https://open.spotify.com/playlist/${playlistId}`,
        recoveryToken: createSaveReceipt({ playlistId, ownerId, fingerprint }, key),
      };
      try {
        let confirmedCount = 0;
        if (receipt) {
          const metadata = await spotifyJson<PlaylistMetadata>({ path: `/playlists/${playlistId}`, accessToken: input.accessToken });
          if (metadata.owner?.id !== ownerId) throw new PlaylistSaveError("The connected Spotify account does not own this playlist.", 403, "playlist_owner_mismatch");
          visibility = typeof metadata.public === "boolean" ? metadata.public : null;
          const existing = await readPlaylistUris(input.accessToken, playlistId);
          // Never overwrite external edits, or guess when unavailable/relinked tracks cannot be identified.
          if (existing.length > trackUris.length || existing.some((uri, i) => uri !== trackUris[i])) {
            throw new PlaylistSaveError("This playlist changed in Spotify. Open it there to review before making further changes.", 409, "playlist_changed");
          }
          confirmedCount = existing.length;
        }
        if (confirmedCount < trackUris.length) {
          await addTracksInBatches(input.accessToken, playlistId, trackUris.slice(confirmedCount));
        }
        return {
          playlistName: input.name, playlistId, playlistUrl: recovery.playlistUrl,
          isPublic: visibility, tracksAddedCount: trackUris.length,
        };
      } catch (error) {
        const failure = asSaveError(error, false);
        failure.recovery = recovery;
        failure.message = `Your playlist exists in Spotify. ${failure.message}`;
        throw failure;
      }
    });
  } catch (error) {
    if (error instanceof SaveOperationConflict) throw new PlaylistSaveError(error.message, 409, "save_conflict");
    throw error;
  }
}

// Reads the existing sequence before an explicit recovery. Never follow arbitrary upstream URLs.
async function readPlaylistUris(accessToken: string, playlistId: string): Promise<Array<string | null>> {
  const uris: Array<string | null> = [];
  for (let offset = 0; offset <= 300; offset += 50) {
    const page = await spotifyJson<{
      items?: Array<{ item?: { uri?: string; linked_from?: { uri?: string } } | null; track?: { uri?: string; linked_from?: { uri?: string } } | null }>;
      next?: string | null;
    }>({ path: `/playlists/${playlistId}/items`, accessToken, query: { limit: 50, offset } });
    if (!Array.isArray(page.items) || !(page.next === null || typeof page.next === "string")) throw new Error("Invalid Spotify playlist response.");
    for (const entry of page.items) {
      const track = entry.item ?? entry.track;
      uris.push(track?.linked_from?.uri ?? track?.uri ?? null);
    }
    if (!page.next) return uris;
  }
  throw new PlaylistSaveError("This playlist has changed. Review it in Spotify before continuing.", 409, "playlist_changed");
}

export async function addTracksInBatches(
  accessToken: string, playlistId: string, trackUris: string[], batchSize = SPOTIFY_TRACKS_BATCH_SIZE,
): Promise<{ snapshotId: string | null; tracksAddedCount: number }> {
  const uris = buildTrackUris(trackUris);
  if (!uris.length) throw new PlaylistSaveError("At least one valid track is required.", 400, "missing_tracks", { retrySafe: true });
  let snapshotId: string | null = null;
  let tracksAddedCount = 0;
  for (const batch of chunkTrackUris(uris, batchSize)) {
    try {
      const result = await spotifyJson<{ snapshot_id?: string }>({
        method: "POST", path: `/playlists/${playlistId}/items`, accessToken, json: { uris: batch },
      });
      if (typeof result.snapshot_id !== "string") throw new Error("Missing playlist snapshot.");
      snapshotId = result.snapshot_id;
      tracksAddedCount += batch.length;
    } catch (error) {
      const failure = asSaveError(error, false);
      failure.details = { tracksAddedCount };
      throw failure;
    }
  }
  return { snapshotId, tracksAddedCount };
}

function asSaveError(error: unknown, retrySafe: boolean): PlaylistSaveError {
  if (error instanceof PlaylistSaveError) return error;
  const failure = getSpotifyFailure(error);
  return new PlaylistSaveError(failure.message, failure.status, failure.code, {
    retrySafe, retryAfterSeconds: failure.retryAfterSeconds,
  });
}

export function chunkTrackUris(uris: string[], batchSize = SPOTIFY_TRACKS_BATCH_SIZE): string[][] {
  const size = Number.isFinite(batchSize) ? Math.min(100, Math.max(1, Math.trunc(batchSize))) : 100;
  const chunks: string[][] = [];
  for (let index = 0; index < uris.length; index += size) chunks.push(uris.slice(index, index + size));
  return chunks;
}
export function buildTrackUris(identifiers: string[]): string[] {
  return [...new Set(identifiers.map((value) => value.trim())
    .map((value) => /^[A-Za-z0-9]{22}$/.test(value) ? `spotify:track:${value}` : value)
    .filter((value) => /^spotify:track:[A-Za-z0-9]{22}$/.test(value)))];
}
export const normalizeTrackUris = buildTrackUris;
export const validateTrackUris = buildTrackUris;
