import { formatSpotifyApiErrorMessage } from "../spotify/error";
import { SpotifyClientError, spotifyJson } from "../spotify/client";
export const SPOTIFY_TRACKS_BATCH_SIZE = 100;

type SpotifyCreatePlaylistResponse = {
  id: string;
  public?: boolean | null;
  collaborative?: boolean;
  owner?: {
    id?: string;
  };
  external_urls: {
    spotify: string;
  };
};

type SpotifyMeProfileResponse = {
  explicit_content?: {
    filter_enabled?: boolean;
    filter_locked?: boolean;
  };
};

type SpotifyTracksResponse = {
  tracks: Array<{ id: string; explicit: boolean } | null>;
};

type SavePlaylistInput = {
  accessToken: string;
  grantedScopes: string[];
  name: string;
  description: string;
  isPublic: boolean;
  trackUris: string[];
};

type CreatedPlaylist = {
  id: string;
  url: string;
  requestedPublic: boolean;
  finalPublic: boolean | null;
};

export type SavePlaylistResult = {
  playlistId: string;
  playlistUrl: string;
  visibility: {
    requested: boolean;
    final: boolean | null;
  };
  snapshotId: string | null;
  tracksAddedCount: number;
  tracksAdded: boolean;
  warning?: string;
  error?: {
    message: string;
    status: number;
    endpoint?: string;
    spotifyBody?: string;
  };
};

export class PlaylistSaveError extends Error {
  status: number;
  code: string;
  endpoint?: string;
  body?: string;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    status = 500,
    code = "playlist_save_failed",
    details?: { endpoint?: string; body?: string; extra?: Record<string, unknown> },
  ) {
    super(message);
    this.name = "PlaylistSaveError";
    this.status = status;
    this.code = code;
    this.endpoint = details?.endpoint;
    this.body = details?.body;
    this.details = details?.extra;
  }
}

export async function savePlaylistToSpotify(input: SavePlaylistInput): Promise<SavePlaylistResult> {
  const sharedAccessToken = input.accessToken;

  const trackUris = buildTrackUris(input.trackUris);
  if (trackUris.length === 0) {
    throw new PlaylistSaveError(
      "At least one valid Spotify track URI is required.",
      400,
      "missing_tracks",
    );
  }

  const playlist = await createPlaylist(sharedAccessToken, {
    name: input.name,
    description: input.description,
    isPublic: input.isPublic,
  });
  const { playableUris, restrictionWarning } = await filterUrisByAccountRestrictions(
    sharedAccessToken,
    trackUris,
  );
  if (playableUris.length === 0) {
    return {
      playlistId: playlist.id,
      playlistUrl: playlist.url,
      visibility: {
        requested: playlist.requestedPublic,
        final: playlist.finalPublic,
      },
      snapshotId: null,
      tracksAddedCount: 0,
      tracksAdded: false,
      warning: restrictionWarning,
      error: {
        message: "Spotify account restrictions blocked all generated tracks.",
        status: 403,
      },
    };
  }

  try {
    const { snapshotId, tracksAddedCount } = await addTracksInBatches(
      sharedAccessToken,
      playlist.id,
      playableUris,
      SPOTIFY_TRACKS_BATCH_SIZE,
    );
    const warning =
      tracksAddedCount < playableUris.length
        ? `Added ${tracksAddedCount} of ${playableUris.length} tracks. Some tracks were skipped by Spotify.`
        : restrictionWarning;

    return {
      playlistId: playlist.id,
      playlistUrl: playlist.url,
      visibility: {
        requested: playlist.requestedPublic,
        final: playlist.finalPublic,
      },
      snapshotId,
      tracksAddedCount,
      tracksAdded: true,
      warning,
    };
  } catch (error) {
    const message =
      error instanceof PlaylistSaveError
        ? error.message
        : "Playlist was created, but tracks failed to add.";
    const status = error instanceof PlaylistSaveError ? error.status : 500;
    const partialTracksAddedCount =
      error instanceof PlaylistSaveError &&
      typeof error.details?.tracksAddedCount === "number"
        ? error.details.tracksAddedCount
        : 0;

    return {
      playlistId: playlist.id,
      playlistUrl: playlist.url,
      visibility: {
        requested: playlist.requestedPublic,
        final: playlist.finalPublic,
      },
      snapshotId: null,
      tracksAddedCount: partialTracksAddedCount,
      tracksAdded: false,
      error: {
        message,
        status,
        endpoint: error instanceof PlaylistSaveError ? error.endpoint : undefined,
        spotifyBody:
          error instanceof PlaylistSaveError
            ? summarizeBodyForClient(error.body)
            : undefined,
      },
    };
  }
}

export async function addTracksInBatches(
  accessToken: string,
  playlistId: string,
  trackUris: string[],
  batchSize = SPOTIFY_TRACKS_BATCH_SIZE,
): Promise<{ snapshotId: string | null; tracksAddedCount: number }> {
  const validatedTrackUris = validateTrackUris(trackUris);
  if (validatedTrackUris.length === 0) {
    throw new PlaylistSaveError(
      "At least one valid Spotify track URI is required.",
      400,
      "missing_tracks",
      { endpoint: `/playlists/${playlistId}/tracks`, body: '{"uris":[]}' },
    );
  }
  const batches = chunkTrackUris(
    validatedTrackUris,
    Math.min(100, Math.max(1, Math.trunc(batchSize))),
  );
  let latestSnapshotId: string | null = null;
  let addedCount = 0;
  const endpoint = `/playlists/${playlistId}/tracks`;
  for (const uris of batches) {
    let batchAdded = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const data = await addTrackBatch(
          accessToken,
          endpoint,
          uris,
          addedCount === 0,
        );
        addedCount += uris.length;
        latestSnapshotId =
          typeof data.snapshot_id === "string" ? data.snapshot_id : latestSnapshotId;
        batchAdded = true;
        break;
      } catch (error) {
        if (error instanceof SpotifyClientError) {
          if (error.status === 403 && uris.length > 1) {
            const fallbackResult = await addTracksIndividually(accessToken, endpoint, uris);
            if (fallbackResult.addedCount > 0) {
              addedCount += fallbackResult.addedCount;
              latestSnapshotId = fallbackResult.snapshotId ?? latestSnapshotId;
              batchAdded = true;
              break;
            }
          }
          const retriable = error.status === 403 && attempt < 3;
          traceSaveLibrary("spotify_add_tracks_batch_attempt_failed", {
            playlistId,
            attempt,
            status: error.status,
            retriable,
            bodyExcerpt: summarizeBodyForClient(error.bodyText),
          });
          if (retriable) {
            await wait(300 * attempt);
            continue;
          }
          throw new PlaylistSaveError(
            formatSpotifyApiErrorMessage(error.status, error.bodyText, error.responseHeaders),
            error.status,
            "spotify_add_tracks_failed",
            { endpoint, body: error.bodyText, extra: { tracksAddedCount: addedCount } },
          );
        }
        throw error;
      }
    }

    if (!batchAdded) {
      throw new PlaylistSaveError(
        "Failed to add playlist tracks after retries.",
        502,
        "spotify_add_tracks_failed",
        { endpoint, extra: { tracksAddedCount: addedCount } },
      );
    }
  }

  return {
    snapshotId: latestSnapshotId,
    tracksAddedCount: addedCount,
  };
}

async function addTracksIndividually(
  accessToken: string,
  endpoint: string,
  uris: string[],
): Promise<{ addedCount: number; snapshotId: string | null }> {
  let addedCount = 0;
  let latestSnapshotId: string | null = null;

  traceSaveLibrary("spotify_add_tracks_individual_fallback_start", {
    endpoint,
    uriCount: uris.length,
  });

  for (const uri of uris) {
    try {
      const data = await addTrackBatch(accessToken, endpoint, [uri], false);
      addedCount += 1;
      latestSnapshotId =
        typeof data.snapshot_id === "string" ? data.snapshot_id : latestSnapshotId;
    } catch (error) {
      if (error instanceof SpotifyClientError) {
        traceSaveLibrary("spotify_add_tracks_individual_item_failed", {
          endpoint,
          uri,
          status: error.status,
          bodyExcerpt: summarizeBodyForClient(error.bodyText),
        });
        continue;
      }
      throw error;
    }
  }

  return { addedCount, snapshotId: latestSnapshotId };
}

async function addTrackBatch(
  accessToken: string,
  endpoint: string,
  uris: string[],
  allowReplaceFallback: boolean,
): Promise<{ snapshot_id?: string }> {
  try {
    return await spotifyJson<{ snapshot_id?: string }>({
      method: "POST",
      path: endpoint,
      accessToken,
      json: { uris },
    });
  } catch (error) {
    if (!(error instanceof SpotifyClientError) || error.status !== 403) {
      throw error;
    }

    traceSaveLibrary("spotify_add_tracks_query_fallback", {
      endpoint,
      uriCount: uris.length,
      firstThreeUris: uris.slice(0, 3),
      originalStatus: error.status,
      originalBodyExcerpt: summarizeBodyForClient(error.bodyText),
    });
    try {
      return await spotifyJson<{ snapshot_id?: string }>({
        method: "POST",
        path: endpoint,
        accessToken,
        query: { uris: uris.join(",") },
      });
    } catch (fallbackError) {
      if (!(fallbackError instanceof SpotifyClientError) || !allowReplaceFallback) {
        throw fallbackError;
      }

      traceSaveLibrary("spotify_add_tracks_replace_fallback", {
        endpoint,
        uriCount: uris.length,
        firstThreeUris: uris.slice(0, 3),
        originalStatus: fallbackError.status,
        originalBodyExcerpt: summarizeBodyForClient(fallbackError.bodyText),
      });

      return spotifyJson<{ snapshot_id?: string }>({
        method: "PUT",
        path: endpoint,
        accessToken,
        json: { uris },
      });
    }
  }
}

export function chunkTrackUris(trackUris: string[], batchSize = SPOTIFY_TRACKS_BATCH_SIZE): string[][] {
  if (batchSize < 1) {
    return [trackUris];
  }

  const chunks: string[][] = [];
  for (let index = 0; index < trackUris.length; index += batchSize) {
    chunks.push(trackUris.slice(index, index + batchSize));
  }

  return chunks;
}

async function createPlaylist(
  accessToken: string,
  input: { name: string; description: string; isPublic: boolean },
): Promise<CreatedPlaylist> {
  const finalPublic = input.isPublic === true;
  const payload = {
    name: input.name,
    description: input.description,
    public: finalPublic,
  };
  let createdPlaylist: SpotifyCreatePlaylistResponse;
  try {
    createdPlaylist = await spotifyJson<SpotifyCreatePlaylistResponse>({
      method: "POST",
      path: "/me/playlists",
      accessToken,
      json: payload,
    });
  } catch (error) {
    if (error instanceof SpotifyClientError) {
      throw new PlaylistSaveError(
        formatSpotifyApiErrorMessage(error.status, error.bodyText, error.responseHeaders),
        error.status,
        "spotify_save_failed",
        { endpoint: error.path, body: error.bodyText },
      );
    }
    throw error;
  }
  traceSaveLibrary("spotify_create_playlist_response_meta", {
    playlistId: createdPlaylist.id,
    requestedPublic: finalPublic,
    playlistPublic: createdPlaylist.public ?? null,
    playlistOwnerId: createdPlaylist.owner?.id ?? null,
    playlistCollaborative: createdPlaylist.collaborative ?? null,
  });
  traceSaveLibrary("spotify_create_playlist_raw_public", {
    source: "create_response",
    playlistId: createdPlaylist.id,
    publicValue: createdPlaylist.public ?? null,
    publicType: typeof createdPlaylist.public,
    pick: {
      id: createdPlaylist.id,
      public: createdPlaylist.public ?? null,
      collaborative: createdPlaylist.collaborative ?? null,
      owner: { id: createdPlaylist.owner?.id ?? null },
      external_urls: createdPlaylist.external_urls ?? null,
    },
  });
  return {
    id: createdPlaylist.id,
    url: createdPlaylist.external_urls.spotify,
    requestedPublic: finalPublic,
    finalPublic: createdPlaylist.public ?? finalPublic,
  };
}

async function filterUrisByAccountRestrictions(
  accessToken: string,
  trackUris: string[],
): Promise<{ playableUris: string[]; restrictionWarning?: string }> {
  try {
    const me = await spotifyJson<SpotifyMeProfileResponse>({
      method: "GET",
      path: "/me",
      accessToken,
    });
    const explicitFilterEnabled = me.explicit_content?.filter_enabled === true;
    if (!explicitFilterEnabled) {
      return { playableUris: trackUris };
    }

    const explicitMap = await fetchTrackExplicitMap(accessToken, trackUris);
    const playableUris = trackUris.filter((uri) => {
      const trackId = extractTrackIdFromUri(uri);
      if (!trackId) {
        return true;
      }
      return explicitMap.get(trackId) !== true;
    });
    const skippedCount = trackUris.length - playableUris.length;
    traceSaveLibrary("spotify_explicit_filter_applied", {
      inputCount: trackUris.length,
      playableCount: playableUris.length,
      skippedCount,
    });
    return {
      playableUris,
      restrictionWarning:
        skippedCount > 0
          ? `Skipped ${skippedCount} explicit tracks due to Spotify account content settings.`
          : undefined,
    };
  } catch (error) {
    if (error instanceof SpotifyClientError) {
      traceSaveLibrary("spotify_explicit_filter_check_failed", {
        status: error.status,
        bodyExcerpt: summarizeBodyForClient(error.bodyText),
      });
      return { playableUris: trackUris };
    }
    throw error;
  }
}

async function fetchTrackExplicitMap(
  accessToken: string,
  trackUris: string[],
): Promise<Map<string, boolean>> {
  const trackIds = trackUris
    .map(extractTrackIdFromUri)
    .filter((id): id is string => Boolean(id));
  const chunks = chunkTrackUris(trackIds, 50);
  const explicitById = new Map<string, boolean>();
  for (const idChunk of chunks) {
    const response = await spotifyJson<SpotifyTracksResponse>({
      method: "GET",
      path: "/tracks",
      accessToken,
      query: { ids: idChunk.join(",") },
    });
    for (const track of response.tracks) {
      if (!track?.id) {
        continue;
      }
      explicitById.set(track.id, track.explicit === true);
    }
  }
  return explicitById;
}

function extractTrackIdFromUri(uri: string): string | null {
  const match = uri.match(/^spotify:track:([A-Za-z0-9]{22})$/);
  return match?.[1] ?? null;
}

export function buildTrackUris(trackIdentifiers: string[]): string[] {
  const normalized = trackIdentifiers
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (/^spotify:track:[A-Za-z0-9]{22}$/.test(value)) {
        return value;
      }

      if (/^[A-Za-z0-9]{22}$/.test(value)) {
        return `spotify:track:${value}`;
      }

      return null;
    })
    .filter((value): value is string => value !== null);

  return Array.from(new Set(normalized));
}

export const normalizeTrackUris = buildTrackUris;
export function validateTrackUris(trackUris: string[]): string[] {
  const normalized = buildTrackUris(trackUris);
  if (normalized.length === 0) {
    return [];
  }

  return normalized.filter((uri) => uri.startsWith("spotify:track:"));
}

function traceSaveLibrary(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV !== "development") {
    return;
  }

  console.log(`[TRACE][save-lib] ${event}`, payload);
}

function summarizeBodyForClient(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  return value.length > 300 ? `${value.slice(0, 297)}...` : value;
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
