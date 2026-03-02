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
  };
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
    try {
      const data = await spotifyJson<{ snapshot_id?: string }>({
        method: "POST",
        path: endpoint,
        accessToken,
        json: { uris },
      });
      addedCount += uris.length;
      latestSnapshotId =
        typeof data.snapshot_id === "string" ? data.snapshot_id : latestSnapshotId;
    } catch (error) {
      if (error instanceof SpotifyClientError) {
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
