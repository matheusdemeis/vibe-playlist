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

type SpotifyMeResponse = {
  id: string;
  display_name?: string | null;
};

type SpotifyPlaylistResponse = {
  owner: {
    id: string;
  };
  collaborative: boolean;
  public: boolean | null;
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
  visibilityWarning?: string;
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

  try {
    const { snapshotId, tracksAddedCount } = await addTracksInBatches(
      sharedAccessToken,
      playlist.id,
      trackUris,
      SPOTIFY_TRACKS_BATCH_SIZE,
    );

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
      warning: playlist.visibilityWarning,
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
      warning: playlist.visibilityWarning,
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
  let me: SpotifyMeResponse;
  let playlist: SpotifyPlaylistResponse;
  try {
    me = await spotifyJson<SpotifyMeResponse>({
      method: "GET",
      path: "/me",
      accessToken,
    });
    playlist = await spotifyJson<SpotifyPlaylistResponse>({
      method: "GET",
      path: `/playlists/${playlistId}`,
      accessToken,
    });
  } catch (error) {
    if (error instanceof SpotifyClientError) {
      throw new PlaylistSaveError(
        formatSpotifyApiErrorMessage(error.status, error.bodyText, error.responseHeaders),
        error.status,
        "spotify_add_tracks_failed",
        { endpoint: error.path, body: error.bodyText },
      );
    }
    throw error;
  }

  traceSaveLibrary("spotify_add_tracks_identity_check", {
    meId: me.id,
    meDisplayName: me.display_name ?? null,
    playlistOwnerId: playlist.owner.id,
    playlistCollaborative: playlist.collaborative,
    playlistPublic: playlist.public,
    ownerMatchesMe: playlist.owner.id === me.id,
  });
  if (playlist.owner.id !== me.id) {
    throw new PlaylistSaveError(
      "Connected Spotify account does not own this playlist. Reconnect and try again.",
      403,
      "playlist_owner_mismatch",
      { endpoint: `/playlists/${playlistId}` },
    );
  }
  for (const uris of batches) {
    let batchAdded = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        const payload = { uris };
        const data = await spotifyJson<{ snapshot_id?: string }>({
          method: "POST",
          path: endpoint,
          accessToken,
          json: payload,
        });
        addedCount += uris.length;
        latestSnapshotId =
          typeof data.snapshot_id === "string" ? data.snapshot_id : latestSnapshotId;
        batchAdded = true;
        break;
      } catch (error) {
        if (error instanceof SpotifyClientError) {
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
  const me = await spotifyJson<SpotifyMeResponse>({
    method: "GET",
    path: "/me",
    accessToken,
  });

  const payload = {
    name: input.name,
    description: input.description,
    public: finalPublic,
    collaborative: false,
  };
  let createdPlaylist: SpotifyCreatePlaylistResponse;
  try {
    createdPlaylist = await createPlaylistWithFallback(accessToken, me.id, payload);
  } catch (error) {
    if (error instanceof SpotifyClientError) {
      throw new PlaylistSaveError(
        formatSpotifyApiErrorMessage(error.status, error.bodyText, error.responseHeaders),
        error.status,
        "spotify_save_failed",
        { endpoint: "/me/playlists", body: error.bodyText },
      );
    }
    throw error;
  }
  const createdPlaylistMeta = await spotifyJson<SpotifyPlaylistResponse>({
    method: "GET",
    path: `/playlists/${createdPlaylist.id}`,
    accessToken,
  });
  traceSaveLibrary("spotify_create_playlist_response_meta", {
    playlistId: createdPlaylist.id,
    requestedPublic: finalPublic,
    playlistPublic: createdPlaylistMeta.public,
    playlistOwnerId: createdPlaylistMeta.owner.id,
    playlistCollaborative: createdPlaylistMeta.collaborative,
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
  traceSaveLibrary("spotify_create_playlist_raw_public", {
    source: "fetch_response",
    playlistId: createdPlaylist.id,
    publicValue: createdPlaylistMeta.public,
    publicType: typeof createdPlaylistMeta.public,
    pick: {
      id: createdPlaylist.id,
      public: createdPlaylistMeta.public,
      collaborative: createdPlaylistMeta.collaborative,
      owner: { id: createdPlaylistMeta.owner.id },
      external_urls: createdPlaylist.external_urls ?? null,
    },
  });
  const { finalPublic: enforcedPublic, warning: visibilityWarning } =
    await enforcePlaylistVisibility(accessToken, createdPlaylist.id, finalPublic);
  const playlistAfterUpdate = await fetchPlaylistVisibility(accessToken, createdPlaylist.id);
  traceSaveLibrary("spotify_playlist_visibility_after_put", {
    playlistId: createdPlaylist.id,
    requestedPublic: finalPublic,
    finalPublic: playlistAfterUpdate.public,
    finalPublicAfterEnforce: enforcedPublic,
  });

  return {
    id: createdPlaylist.id,
    url: createdPlaylist.external_urls.spotify,
    requestedPublic: finalPublic,
    finalPublic: playlistAfterUpdate.public,
    visibilityWarning,
  };
}

async function createPlaylistWithFallback(
  accessToken: string,
  userId: string,
  payload: { name: string; description: string; public: boolean; collaborative: boolean },
): Promise<SpotifyCreatePlaylistResponse> {
  try {
    return await spotifyJson<SpotifyCreatePlaylistResponse>({
      method: "POST",
      path: `/users/${userId}/playlists`,
      accessToken,
      json: payload,
    });
  } catch (error) {
    if (!(error instanceof SpotifyClientError) || error.status !== 403) {
      throw error;
    }

    traceSaveLibrary("spotify_create_playlist_fallback", {
      from: `/users/${userId}/playlists`,
      to: "/me/playlists",
      status: error.status,
      bodyExcerpt: summarizeBodyForClient(error.bodyText),
    });
    return spotifyJson<SpotifyCreatePlaylistResponse>({
      method: "POST",
      path: "/me/playlists",
      accessToken,
      json: payload,
    });
  }
}

async function fetchPlaylistVisibility(
  accessToken: string,
  playlistId: string,
): Promise<SpotifyPlaylistResponse> {
  return spotifyJson<SpotifyPlaylistResponse>({
    method: "GET",
    path: `/playlists/${playlistId}`,
    accessToken,
  });
}

async function enforcePlaylistVisibility(
  accessToken: string,
  playlistId: string,
  requestedPublic: boolean,
): Promise<{ finalPublic: boolean | null; warning?: string }> {
  const changePayload = { public: requestedPublic, collaborative: false };
  traceSaveLibrary("spotify_change_playlist_visibility", {
    method: "PUT",
    path: `/playlists/${playlistId}`,
    bodyPreview: JSON.stringify(changePayload).slice(0, 200),
  });

  try {
    await spotifyJson({
      method: "PUT",
      path: `/playlists/${playlistId}`,
      accessToken,
      json: changePayload,
    });
  } catch (error) {
    if (error instanceof SpotifyClientError) {
      return {
        finalPublic: null,
        warning: formatSpotifyApiErrorMessage(
          error.status,
          error.bodyText,
          error.responseHeaders,
        ),
      };
    }
    throw error;
  }

  let observedPublic: boolean | null = null;
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    const visibility = await fetchPlaylistVisibility(accessToken, playlistId);
    observedPublic = visibility.public;
    traceSaveLibrary("spotify_change_playlist_visibility_check", {
      playlistId,
      attempt,
      requestedPublic,
      observedPublic,
    });
    if (observedPublic === requestedPublic) {
      return { finalPublic: observedPublic };
    }
    await wait(250 * attempt);
  }

  return {
    finalPublic: observedPublic,
    warning: `Visibility check mismatch after retries (requested: ${String(requestedPublic)}, observed: ${String(observedPublic)}).`,
  };
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
