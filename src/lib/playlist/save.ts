import { formatSpotifyApiErrorMessage } from "../spotify/error";
import { SpotifyClientError, spotifyJson } from "../spotify/client";
export const SPOTIFY_TRACKS_BATCH_SIZE = 100;
const SPOTIFY_TRACK_DETAILS_CONCURRENCY = 8;

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
  explicit_content?: {
    filter_enabled?: boolean;
  };
};

type SpotifyPlaylistMetaResponse = {
  owner?: { id?: string };
  collaborative?: boolean;
  public?: boolean | null;
};

type SpotifyTrackDetailsResponse = {
  id?: string;
  explicit?: boolean;
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
  tracksAddedCount: number;
  visibilityUpdated: boolean;
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
  console.log("[save] starting save", {
    tokenTail: sharedAccessToken.slice(-6),
    grantedScopes: input.grantedScopes,
    isPublic: input.isPublic,
    trackCount: input.trackUris.length,
  });

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
    playlist.requestedPublic,
  );
  void snapshotId;
  // Visibility updates are best-effort and should not block add-tracks success.
  const visibilityUpdated = await enforceVisibilityAfterCreate(
    sharedAccessToken,
    playlist.id,
    playlist.requestedPublic,
  );
  return {
    playlistId: playlist.id,
    playlistUrl: playlist.url,
    tracksAddedCount,
    visibilityUpdated,
  };
}

export async function addTracksInBatches(
  accessToken: string,
  playlistId: string,
  trackUris: string[],
  batchSize = SPOTIFY_TRACKS_BATCH_SIZE,
  requestedPublic?: boolean,
): Promise<{ snapshotId: string | null; tracksAddedCount: number }> {
  const validatedTrackUris = validateTrackUris(trackUris);
  if (validatedTrackUris.length === 0) {
    throw new PlaylistSaveError(
      "At least one valid Spotify track URI is required.",
      400,
      "missing_tracks",
      { endpoint: `/playlists/${playlistId}/items`, body: '{"uris":[]}' },
    );
  }
  const batches = chunkTrackUris(
    validatedTrackUris,
    Math.min(100, Math.max(1, Math.trunc(batchSize))),
  );
  let latestSnapshotId: string | null = null;
  let addedCount = 0;
  const endpoint = `/playlists/${playlistId}/items`;
  // /me succeeds only for user tokens from Authorization Code flow.
  const me = await getCurrentSpotifyUser(accessToken);
  if (requestedPublic === false) {
    await enforcePrivateBeforeInsert(accessToken, playlistId);
  }
  for (const uris of batches) {
    let attemptedPrivateReenforceAfter403 = false;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
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
        break;
      } catch (error) {
        if (!(error instanceof SpotifyClientError)) {
          throw error;
        }

        if (error.status === 403) {
          if (requestedPublic === false && !attemptedPrivateReenforceAfter403) {
            attemptedPrivateReenforceAfter403 = true;
            await enforcePrivateBeforeInsert(accessToken, playlistId);
            traceSaveLibrary("spotify_add_tracks_403_private_retry", {
              playlistId,
              attempt,
            });
            continue;
          }
          // Spotify can reject a whole batch when it contains explicit/restricted tracks.
          const filteredUris = await dropExplicitUrisForFilteredAccounts(
            accessToken,
            uris,
          );
          if (filteredUris.length === 0 && uris.length > 0) {
            throw new PlaylistSaveError(
              "All generated tracks were rejected by Spotify for this account. Try generating a different set.",
              403,
              "spotify_add_tracks_failed",
              {
                endpoint,
                body: error.bodyText,
                extra: {
                  tracksAddedCount: addedCount,
                  rejectedCount: uris.length,
                },
              },
            );
          }
          if (filteredUris.length > 0 && filteredUris.length < uris.length) {
            const retryData = await spotifyJson<{ snapshot_id?: string }>({
              method: "POST",
              path: endpoint,
              accessToken,
              json: { uris: filteredUris },
            });
            addedCount += filteredUris.length;
            latestSnapshotId =
              typeof retryData.snapshot_id === "string"
                ? retryData.snapshot_id
                : latestSnapshotId;
            traceSaveLibrary("spotify_add_tracks_403_filtered_retry", {
              playlistId,
              originalCount: uris.length,
              filteredCount: filteredUris.length,
              explicitFilterEnabled: me.explicit_content?.filter_enabled === true,
            });
            break;
          }
          await logPlaylistOwnershipForForbidden(accessToken, playlistId, me.id);
          traceSaveLibrary("spotify_add_tracks_403", {
            playlistId,
            endpoint,
            bodyExcerpt: error.bodyText.slice(0, 240),
          });
          throw new PlaylistSaveError(
            formatSpotifyApiErrorMessage(error.status, error.bodyText, error.responseHeaders),
            error.status,
            "spotify_add_tracks_failed",
            { endpoint, body: error.bodyText, extra: { tracksAddedCount: addedCount } },
          );
        }

        const retriable =
          (error.status === 429 || (error.status >= 500 && error.status <= 599)) &&
          attempt < 3;
        if (retriable) {
          traceSaveLibrary("spotify_add_tracks_retry", {
            playlistId,
            status: error.status,
            attempt,
          });
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
    }
  }

  return {
    snapshotId: latestSnapshotId,
    tracksAddedCount: addedCount,
  };
}

async function enforcePrivateBeforeInsert(accessToken: string, playlistId: string): Promise<void> {
  try {
    await spotifyJson({
      method: "PUT",
      path: `/playlists/${playlistId}`,
      accessToken,
      json: { public: false },
    });
    await wait(500);
  } catch (error) {
    if (error instanceof SpotifyClientError) {
      traceSaveLibrary("spotify_pre_add_private_enforce_warning", {
        playlistId,
        status: error.status,
        endpoint: error.path,
      });
      return;
    }
    throw error;
  }
}

async function dropExplicitUrisForFilteredAccounts(
  accessToken: string,
  uris: string[],
): Promise<string[]> {
  const trackIds = Array.from(
    new Set(uris.map((uri) => extractTrackId(uri)).filter((id): id is string => Boolean(id))),
  );
  if (trackIds.length === 0) {
    return uris;
  }

  const explicitById = new Map<string, boolean>();
  const chunks = chunkTrackUris(trackIds, SPOTIFY_TRACK_DETAILS_CONCURRENCY);
  for (const chunk of chunks) {
    const chunkDetails = await Promise.all(
      chunk.map(async (trackId) => ({
        trackId,
        explicit: await lookupTrackExplicit(accessToken, trackId),
      })),
    );

    if (chunkDetails.some((item) => item.explicit === null)) {
      return uris;
    }

    for (const item of chunkDetails) {
      explicitById.set(item.trackId, item.explicit === true);
    }
  }

  return uris.filter((uri) => {
    const id = extractTrackId(uri);
    if (!id) {
      return true;
    }
    return explicitById.get(id) !== true;
  });
}

async function lookupTrackExplicit(
  accessToken: string,
  trackId: string,
): Promise<boolean | null> {
  try {
    const track = await spotifyJson<SpotifyTrackDetailsResponse>({
      method: "GET",
      path: `/tracks/${trackId}`,
      accessToken,
    });
    if (!track.id) {
      return null;
    }
    return track.explicit === true;
  } catch {
    return null;
  }
}

async function getCurrentSpotifyUser(accessToken: string): Promise<SpotifyMeResponse> {
  try {
    const me = await spotifyJson<SpotifyMeResponse>({
      method: "GET",
      path: "/me",
      accessToken,
    });
    console.log("[save] /me identity", { meId: me.id, tokenTail: accessToken.slice(-6) });
    return me;
  } catch (error) {
    if (error instanceof SpotifyClientError) {
      const isForbidden = error.status === 403;
      const message = isForbidden
        ? "Spotify returned 403 on /me. If your app is in Development Mode, add your account at developer.spotify.com/dashboard → App → User Management."
        : "Spotify user token is invalid for track operations. Reconnect Spotify.";
      console.error("[save] /me failed", {
        status: error.status,
        tokenTail: accessToken.slice(-6),
        body: error.bodyText,
      });
      throw new PlaylistSaveError(
        message,
        error.status,
        isForbidden ? "spotify_dev_mode_forbidden" : "spotify_me_failed",
        { endpoint: error.path, body: error.bodyText },
      );
    }
    throw error;
  }
}

async function logPlaylistOwnershipForForbidden(
  accessToken: string,
  playlistId: string,
  meId: string,
): Promise<void> {
  try {
    const playlist = await spotifyJson<SpotifyPlaylistMetaResponse>({
      method: "GET",
      path: `/playlists/${playlistId}`,
      accessToken,
    });
    const ownerMatchesMe = playlist.owner?.id === meId;
    console.error("[save] 403 ownership context", {
      meId,
      playlistId,
      playlistOwnerId: playlist.owner?.id ?? null,
      ownerMatchesMe,
      collaborative: playlist.collaborative ?? null,
      public: playlist.public ?? null,
      tokenTail: accessToken.slice(-6),
    });
    if (!ownerMatchesMe) {
      throw new PlaylistSaveError(
        "The connected Spotify account does not own this playlist.",
        403,
        "playlist_owner_mismatch",
        { endpoint: `/playlists/${playlistId}` },
      );
    }
  } catch (error) {
    if (error instanceof PlaylistSaveError) {
      throw error;
    }
    if (error instanceof SpotifyClientError) {
      console.error("[save] 403 ownership context fetch failed", {
        playlistId,
        status: error.status,
        endpoint: error.path,
        tokenTail: accessToken.slice(-6),
      });
      return;
    }
    throw error;
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

async function enforceVisibilityAfterCreate(
  accessToken: string,
  playlistId: string,
  requestedPublic: boolean,
): Promise<boolean> {
  try {
    await spotifyJson({
      method: "PUT",
      path: `/playlists/${playlistId}`,
      accessToken,
      json: { public: requestedPublic },
    });
    await wait(1500);
    const refreshedPlaylist = await spotifyJson<SpotifyCreatePlaylistResponse>({
      method: "GET",
      path: `/playlists/${playlistId}`,
      accessToken,
    });
    const confirmed = refreshedPlaylist.public === requestedPublic;
    traceSaveLibrary("spotify_visibility_post_create_check", {
      playlistId,
      requestedPublic,
      observedPublic: refreshedPlaylist.public ?? null,
      confirmed,
    });
    return confirmed;
  } catch (error) {
    if (error instanceof SpotifyClientError) {
      traceSaveLibrary("spotify_visibility_post_create_warning", {
        playlistId,
        requestedPublic,
        status: error.status,
        endpoint: error.path,
        bodyExcerpt: error.bodyText.slice(0, 200),
      });
      return false;
    }
    throw error;
  }
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
  if (process.env.SPOTIFY_DEBUG !== "1") {
    return;
  }
  console.log(`[TRACE][save-lib] ${event}`, payload);
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function excerpt(value: string): string {
  return value.length > 220 ? `${value.slice(0, 217)}...` : value;
}

function extractTrackId(trackUriOrId: string): string | null {
  const fromUri = trackUriOrId.match(/^spotify:track:([A-Za-z0-9]{22})$/)?.[1];
  if (fromUri) {
    return fromUri;
  }
  return /^[A-Za-z0-9]{22}$/.test(trackUriOrId) ? trackUriOrId : null;
}
