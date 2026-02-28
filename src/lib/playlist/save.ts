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
  addedTrackCount: number;
};

export class PlaylistSaveError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "playlist_save_failed") {
    super(message);
    this.name = "PlaylistSaveError";
    this.status = status;
    this.code = code;
  }
}

export async function savePlaylistToSpotify(input: SavePlaylistInput): Promise<SavePlaylistResult> {
  const trackUris = dedupeNonEmptyUris(input.trackUris);
  if (trackUris.length === 0) {
    throw new PlaylistSaveError("At least one track URI is required.", 400, "missing_tracks");
  }

  const playlist = await createPlaylist(input.accessToken, {
    name: input.name,
    description: input.description,
    isPublic: input.isPublic,
  });

  await addTracksInBatches(input.accessToken, playlist.id, trackUris);

  return {
    playlistId: playlist.id,
    playlistUrl: playlist.external_urls.spotify,
    addedTrackCount: trackUris.length,
  };
}

export async function addTracksInBatches(
  accessToken: string,
  playlistId: string,
  trackUris: string[],
  batchSize = SPOTIFY_TRACKS_BATCH_SIZE,
): Promise<void> {
  const batches = chunkTrackUris(trackUris, batchSize);

  for (const uris of batches) {
    await spotifyRequest(`/playlists/${playlistId}/tracks`, accessToken, {
      method: "POST",
      body: JSON.stringify({ uris }),
    });
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
): Promise<SpotifyCreatePlaylistResponse> {
  const payload = {
    name: input.name,
    description: input.description,
    public: input.isPublic,
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

function dedupeNonEmptyUris(trackUris: string[]): string[] {
  return Array.from(new Set(trackUris.map((uri) => uri.trim()).filter(Boolean)));
}
