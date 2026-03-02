import { formatSpotifyApiErrorMessage } from "../spotify/error";
import { getRequiredPlaylistModifyScope, hasGrantedScopes } from "../auth/spotify-session";
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

export type SavePlaylistResult = {
  playlistId: string;
  playlistUrl: string;
  snapshotId: string | null;
  tracksAddedCount: number;
  tracksAdded: boolean;
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
      input.grantedScopes,
    );

    return {
      playlistId: playlist.id,
      playlistUrl: playlist.external_urls.spotify,
      snapshotId,
      tracksAddedCount,
      tracksAdded: true,
    };
  } catch (error) {
    const message =
      error instanceof PlaylistSaveError
        ? error.message
        : "Playlist was created, but tracks failed to add.";
    const status = error instanceof PlaylistSaveError ? error.status : 500;

    return {
      playlistId: playlist.id,
      playlistUrl: playlist.external_urls.spotify,
      snapshotId: null,
      tracksAddedCount: 0,
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
  grantedScopes: string[] = [],
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
  const requiredScope = getRequiredPlaylistModifyScope(playlist.public);
  const hasRequiredScope = hasGrantedScopes(grantedScopes, [requiredScope]);
  traceSaveLibrary("spotify_add_tracks_scope_check", {
    playlistPublic: playlist.public,
    requiredScope,
    grantedScopes,
    hasRequiredScope,
  });
  if (!hasRequiredScope) {
    throw new PlaylistSaveError(
      "Reconnect to grant playlist permissions",
      403,
      "missing_scopes",
      { endpoint: `/playlists/${playlistId}` },
    );
  }

  for (const uris of batches) {
    const addTracksHeaders = {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    };

    traceSaveLibrary("spotify_add_tracks_request", {
      method: "POST",
      endpoint,
      playlistId,
      attemptedTrackCount: uris.length,
      hasAuthorizationHeader: Boolean(addTracksHeaders.Authorization),
      authTokenLength: accessToken.length,
      hasContentTypeHeader: addTracksHeaders["Content-Type"] === "application/json",
    });

    try {
      const payload = { uris };
      traceSaveLibrary("spotify_add_tracks_json", {
        method: "POST",
        path: endpoint,
        bodyPreview: JSON.stringify(payload).slice(0, 200),
      });
      const data = await spotifyJson<{ snapshot_id?: string }>({
        method: "POST",
        path: endpoint,
        accessToken,
        json: payload,
      });
      latestSnapshotId = typeof data.snapshot_id === "string" ? data.snapshot_id : latestSnapshotId;
    } catch (error) {
      if (error instanceof SpotifyClientError) {
        throw new PlaylistSaveError(
          formatSpotifyApiErrorMessage(error.status, error.bodyText, error.responseHeaders),
          error.status,
          "spotify_add_tracks_failed",
          { endpoint, body: error.bodyText },
        );
      }
      throw error;
    }
  }

  return {
    snapshotId: latestSnapshotId,
    tracksAddedCount: validatedTrackUris.length,
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
): Promise<SpotifyCreatePlaylistResponse> {
  const finalPublic = input.isPublic === true;
  traceSaveLibrary("final_public_sent_to_spotify", {
    receivedIsPublic: input.isPublic,
    finalPublic,
  });

  const payload = {
    name: input.name,
    description: input.description,
    public: finalPublic,
  };
  traceSaveLibrary("spotify_create_playlist_request", {
    method: "POST",
    endpoint: "/me/playlists",
    public: payload.public,
  });
  let createdPlaylist: SpotifyCreatePlaylistResponse;
  try {
    traceSaveLibrary("spotify_create_playlist_json", {
      method: "POST",
      path: "/me/playlists",
      bodyPreview: JSON.stringify(payload).slice(0, 200),
    });
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
  if ((createdPlaylistMeta.public === true) !== finalPublic) {
    throw new PlaylistSaveError(
      `Spotify created playlist with unexpected visibility (requested public=${String(finalPublic)}, actual public=${String(createdPlaylistMeta.public)}).`,
      422,
      "spotify_playlist_visibility_mismatch",
      {
        endpoint: `/playlists/${createdPlaylist.id}`,
        extra: {
          requestedPublic: finalPublic,
          actualPublic: createdPlaylistMeta.public,
        },
      },
    );
  }

  return createdPlaylist;
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
