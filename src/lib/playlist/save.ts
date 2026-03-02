import { formatSpotifyApiErrorMessage } from "../spotify/error";

const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
export const SPOTIFY_TRACKS_BATCH_SIZE = 100;

type SpotifyCreatePlaylistResponse = {
  id: string;
  external_urls: {
    spotify: string;
  };
};

type SavePlaylistInput = {
  accessToken: string;
  name: string;
  description: string;
  isPublic: boolean;
  trackUris: string[];
};

export type SavePlaylistResult = {
  playlistId: string;
  playlistUrl: string;
  snapshotId: string | null;
  tracksAdded: boolean;
  error?: {
    message: string;
    status: number;
  };
};

export class PlaylistSaveError extends Error {
  status: number;
  code: string;
  endpoint?: string;
  body?: string;

  constructor(
    message: string,
    status = 500,
    code = "playlist_save_failed",
    details?: { endpoint?: string; body?: string },
  ) {
    super(message);
    this.name = "PlaylistSaveError";
    this.status = status;
    this.code = code;
    this.endpoint = details?.endpoint;
    this.body = details?.body;
  }
}

export async function savePlaylistToSpotify(input: SavePlaylistInput): Promise<SavePlaylistResult> {
  const trackUris = normalizeTrackUris(input.trackUris);
  if (trackUris.length === 0) {
    throw new PlaylistSaveError(
      "At least one valid Spotify track URI is required.",
      400,
      "missing_tracks",
    );
  }

  const playlist = await createPlaylist(input.accessToken, {
    name: input.name,
    description: input.description,
    isPublic: input.isPublic,
  });

  try {
    const snapshotId = await addTracksInBatches(input.accessToken, playlist.id, trackUris);

    return {
      playlistId: playlist.id,
      playlistUrl: playlist.external_urls.spotify,
      snapshotId,
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
      tracksAdded: false,
      error: {
        message,
        status,
      },
    };
  }
}

export async function addTracksInBatches(
  accessToken: string,
  playlistId: string,
  trackUris: string[],
  batchSize = SPOTIFY_TRACKS_BATCH_SIZE,
): Promise<string | null> {
  const batches = chunkTrackUris(trackUris, Math.min(100, Math.max(1, Math.trunc(batchSize))));
  let latestSnapshotId: string | null = null;
  const endpoint = `/playlists/${playlistId}/tracks`;
  const fullUrl = `${SPOTIFY_API_BASE_URL}${endpoint}`;

  for (const uris of batches) {
    traceSaveLibrary("spotify_add_tracks_request", {
      playlistId,
      endpoint,
      url: fullUrl,
      attemptedTrackCount: uris.length,
      firstTrackUris: uris.slice(0, 3),
      redactedCount: Math.max(0, uris.length - 3),
    });

    const response = await fetch(fullUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uris }),
    });

    const rawBody = await response.text();
    const parsedBody = parseJsonSafely(rawBody);

    traceSaveLibrary("spotify_add_tracks_response", {
      endpoint,
      status: response.status,
      bodyText: rawBody,
      bodyJson: parsedBody,
    });

    if (!response.ok) {
      throw new PlaylistSaveError(
        formatSpotifyApiErrorMessage(response.status, rawBody, response.headers),
        response.status,
        "spotify_add_tracks_failed",
        { endpoint, body: rawBody },
      );
    }

    latestSnapshotId =
      typeof parsedBody === "object" && parsedBody !== null && "snapshot_id" in parsedBody
        ? String((parsedBody as { snapshot_id?: string }).snapshot_id ?? "")
        : null;
  }

  return latestSnapshotId;
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

  return spotifyRequest<SpotifyCreatePlaylistResponse>("/me/playlists", accessToken, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

async function spotifyRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${SPOTIFY_API_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new PlaylistSaveError(
      formatSpotifyApiErrorMessage(response.status, errorText, response.headers),
      response.status === 401 ? 401 : 502,
      "spotify_save_failed",
    );
  }

  return (await response.json()) as T;
}

export function normalizeTrackUris(trackUris: string[]): string[] {
  const normalized = trackUris
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => {
      if (value.startsWith("spotify:track:")) {
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

function traceSaveLibrary(event: string, payload: Record<string, unknown>): void {
  if (process.env.NODE_ENV === "production") {
    return;
  }

  console.log(`[TRACE][save-lib] ${event}`, payload);
}

function parseJsonSafely(value: string): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
