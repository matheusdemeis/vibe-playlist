import { spotifyRequest } from "./client";

// Compatible with Spotify's reduced Development Mode Search page size.
export const CATALOG_PAGE_SIZE = 10;
const MAX_SEARCH_REQUESTS = 20;

export type CatalogTrack = {
  id: string;
  name: string;
  uri: string;
  artists: Array<{ id: string; name: string }>;
  album: { name: string; images: Array<{ url: string }> };
  preview_url: string | null;
  explicit: boolean;
  is_playable?: boolean;
  restrictions?: { reason?: string };
};

export class CatalogSearchError extends Error {
  constructor(
    message: string,
    public status = 502,
    public code = "invalid_spotify_response",
  ) {
    super(message);
    this.name = "CatalogSearchError";
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function quoteSearchValue(value: string): string {
  return `"${value.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim()}"`;
}

export function normalizeCatalogTrack(value: unknown): CatalogTrack | null {
  if (!isRecord(value) || typeof value.id !== "string" || !value.id ||
    typeof value.name !== "string" || typeof value.uri !== "string" ||
    !value.uri.startsWith("spotify:track:") || !Array.isArray(value.artists) ||
    !isRecord(value.album)) return null;

  const artists = value.artists.flatMap((artist) =>
    isRecord(artist) && typeof artist.id === "string" && typeof artist.name === "string"
      ? [{ id: artist.id, name: artist.name }] : [],
  );
  if (artists.length === 0) return null;
  const images = Array.isArray(value.album.images) ? value.album.images.flatMap((image) =>
    isRecord(image) && typeof image.url === "string" ? [{ url: image.url }] : [],
  ) : [];
  return {
    id: value.id,
    name: value.name,
    uri: value.uri,
    artists,
    album: { name: typeof value.album.name === "string" ? value.album.name : "", images },
    preview_url: typeof value.preview_url === "string" ? value.preview_url : null,
    explicit: value.explicit === true,
    is_playable: typeof value.is_playable === "boolean" ? value.is_playable : undefined,
    restrictions: isRecord(value.restrictions) ? {
      reason: typeof value.restrictions.reason === "string" ? value.restrictions.reason : undefined,
    } : undefined,
  };
}

export async function searchCatalogTracks(
  accessToken: string,
  options: {
    queries: string[];
    targetCount: number;
    includeExplicit?: boolean;
    requiredArtistId?: string;
    fetcher?: typeof fetch;
    maxRequests?: number;
  },
): Promise<CatalogTrack[]> {
  const sources = [...new Set(options.queries.map((query) => query.trim()).filter(Boolean))]
    .slice(0, 10).map((query) => ({ query, offset: 0, exhausted: false }));
  const tracks = new Map<string, CatalogTrack>();
  const seenUris = new Set<string>();
  const requestBudget = Math.min(MAX_SEARCH_REQUESTS, options.maxRequests ?? MAX_SEARCH_REQUESTS);
  let requests = 0;

  // Advance by the requested page size, not by the number surviving filters.
  // A round of each source also prevents one genre from consuming the whole budget.
  while (sources.some((source) => !source.exhausted) && requests < requestBudget) {
    for (const source of sources) {
      if (source.exhausted || requests >= requestBudget || tracks.size >= options.targetCount) continue;
      requests += 1;
      const data = await spotifyRequest<unknown>({
        path: "/search", accessToken, fetcher: options.fetcher,
        query: { q: source.query, type: "track", limit: CATALOG_PAGE_SIZE, offset: source.offset },
      });
      if (!isRecord(data) || !isRecord(data.tracks) || !Array.isArray(data.tracks.items)) {
        throw new CatalogSearchError("Spotify returned an unreadable track list. Please try again.");
      }
      source.offset += CATALOG_PAGE_SIZE;
      source.exhausted = data.tracks.next === null || data.tracks.items.length < CATALOG_PAGE_SIZE;
      for (const item of data.tracks.items) {
        const track = normalizeCatalogTrack(item);
        if (!track || track.is_playable === false || track.restrictions?.reason ||
          (options.includeExplicit === false && track.explicit) ||
          (options.requiredArtistId && !track.artists.some((artist) => artist.id === options.requiredArtistId)) ||
          tracks.has(track.id) || seenUris.has(track.uri)) continue;
        tracks.set(track.id, track);
        seenUris.add(track.uri);
        if (tracks.size >= options.targetCount) break;
      }
    }
    if (tracks.size >= options.targetCount) break;
  }
  return [...tracks.values()];
}

export async function resolveExactArtist(
  accessToken: string,
  query: string,
  artistId?: string,
): Promise<{ id: string; name: string } | null> {
  const data = await spotifyRequest<unknown>(artistId ? {
    path: `/artists/${encodeURIComponent(artistId)}`, accessToken,
  } : {
    path: "/search", accessToken,
    query: { q: query, type: "artist", limit: CATALOG_PAGE_SIZE },
  });
  if (artistId) {
    if (!isRecord(data) || data.id !== artistId || typeof data.name !== "string") {
      throw new CatalogSearchError("Spotify returned an unreadable artist. Please try again.");
    }
    return { id: artistId, name: data.name };
  }
  if (!isRecord(data) || !isRecord(data.artists) || !Array.isArray(data.artists.items)) {
    throw new CatalogSearchError("Spotify returned an unreadable artist list. Please try again.");
  }
  const normalize = (value: string) => value.trim().toLocaleLowerCase().normalize("NFKC");
  const match = data.artists.items.find((artist) => isRecord(artist) &&
    typeof artist.name === "string" && normalize(artist.name) === normalize(query));
  return isRecord(match) && typeof match.id === "string" && typeof match.name === "string"
    ? { id: match.id, name: match.name } : null;
}
