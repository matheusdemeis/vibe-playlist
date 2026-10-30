import { selectCatalogTracks } from "./catalog-selection";
import type { TempoOption } from "@/lib/vibe-builder";
import { spotifyRequest } from "../spotify/client";
import {
  CatalogSearchError, normalizeCatalogTrack, quoteSearchValue, searchCatalogTracks,
  type CatalogTrack,
} from "../spotify/catalog";
import { VIBE_CONFIG } from "../vibes";

const TEMPO_TARGETS: Record<TempoOption, number> = {
  Slow: 80,
  Medium: 115,
  Fast: 140,
};
const DEFAULT_MAX_TRACKS_PER_ARTIST = 2;

export const CATALOG_MOOD_GENRES: Record<string, readonly string[]> = {
  ...Object.fromEntries(Object.entries(VIBE_CONFIG).map(([mood, config]) => [mood, config.seedGenres])),
  focus: ["ambient", "classical", "jazz"],
  sad: ["acoustic", "indie", "singer-songwriter"],
  happy: ["pop", "dance", "soul"],
};

export type VibeRecommendationInput = {
  seedGenres: string[];
  targetEnergy: number;
  targetValence: number;
  tempo?: TempoOption;
  trackCount: number;
  referenceTrackIds?: string[];
  vibes?: string[];
  includeExplicit?: boolean;
};

export type SpotifyRecommendationParams = {
  limit: number;
  seed_genres: string[];
  seed_tracks?: string[];
  target_energy: number;
  target_valence: number;
  target_tempo?: number;
};

export type SpotifyTrack = {
  id: string;
  artists: Array<{ id: string; name: string }>;
};

export type SpotifyRecommendationTrack = SpotifyTrack & {
  name: string;
  uri: string;
  preview_url: string | null;
  explicit: boolean;
  album: {
    name: string;
    images: Array<{ url: string }>;
  };
};

export type RankedTrack = {
  id: string;
  name: string;
  artists: string[];
  album: string;
  image: string | null;
  uri: string;
  preview_url: string | null;
  explicit: boolean;
};

export type PlaylistGenerationResponse = {
  tracks: RankedTrack[];
  warning?: string;
  metadata: {
    strategy: "catalog_search";
    queries: string[];
    usedSeeds: {
      seed_genres: string[];
      seed_tracks: string[];
    };
    params: SpotifyRecommendationParams;
    generatedAt: string;
  };
};

export type GeneratePlaylistTracksInput = VibeRecommendationInput & {
  preferPreviews?: boolean;
  maxTracksPerArtist?: number;
};

export class PlaylistGenerationError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 500, code = "generation_failed") {
    super(message);
    this.name = "PlaylistGenerationError";
    this.status = status;
    this.code = code;
  }
}

export function mapVibeToRecommendationParams(
  input: VibeRecommendationInput,
): SpotifyRecommendationParams {
  const seedGenres = uniqueNonEmpty(input.seedGenres).slice(0, 5);
  const seedTracks = uniqueNonEmpty(input.referenceTrackIds ?? []).slice(0, 5);

  const params: SpotifyRecommendationParams = {
    limit: clamp(Math.round(input.trackCount), 1, 100),
    seed_genres: seedGenres,
    target_energy: normalizePercent(input.targetEnergy),
    target_valence: normalizePercent(input.targetValence),
  };

  if (seedTracks.length > 0) {
    params.seed_tracks = seedTracks;
  }

  if (input.tempo) {
    params.target_tempo = TEMPO_TARGETS[input.tempo];
  }

  return params;
}

export function dedupeTracksById<T extends SpotifyTrack>(tracks: T[]): T[] {
  const seenIds = new Set<string>();
  const deduped: T[] = [];

  for (const track of tracks) {
    if (seenIds.has(track.id)) {
      continue;
    }

    seenIds.add(track.id);
    deduped.push(track);
  }

  return deduped;
}

export function limitTracksPerArtist<T extends SpotifyTrack>(
  tracks: T[],
  maxPerArtist: number,
  targetCount: number,
): T[];
export function limitTracksPerArtist<T extends SpotifyTrack>(
  tracks: T[],
  maxPerArtist: number,
  targetCount: number,
): T[] {
  if (maxPerArtist < 1) {
    return tracks.slice(0, targetCount);
  }

  const selected: T[] = [];
  const overflow: T[] = [];
  const artistCounts = new Map<string, number>();

  for (const track of tracks) {
    const primaryArtistId = track.artists[0]?.id ?? track.id;
    const currentCount = artistCounts.get(primaryArtistId) ?? 0;

    if (currentCount < maxPerArtist) {
      selected.push(track);
      artistCounts.set(primaryArtistId, currentCount + 1);
      continue;
    }

    overflow.push(track);
  }

  if (selected.length >= targetCount) {
    return selected.slice(0, targetCount);
  }

  return [...selected, ...overflow].slice(0, targetCount);
}

export async function generatePlaylistTracks(
  accessToken: string,
  input: GeneratePlaylistTracksInput,
  fetcher: typeof fetch = fetch,
): Promise<PlaylistGenerationResponse> {
  const params = mapVibeToRecommendationParams(input);
  const moodGenres = (input.vibes ?? []).flatMap((mood) => {
    const key = mood.toLowerCase().replace(/\s+/g, "");
    return Object.prototype.hasOwnProperty.call(CATALOG_MOOD_GENRES, key) ? CATALOG_MOOD_GENRES[key] : [];
  });
  // Give explicit genre choices and mood presets space within the query budget.
  const genreChoices = uniqueNonEmpty(input.seedGenres);
  const genres = uniqueNonEmpty(Array.from({ length: Math.max(genreChoices.length, moodGenres.length) }, (_, index) =>
    [genreChoices[index], moodGenres[index]].filter((genre): genre is string => Boolean(genre))).flat()).slice(0, 10);
  const references: CatalogTrack[] = [];
  for (const id of params.seed_tracks ?? []) {
    const data = await spotifyRequest<unknown>({ path: "/tracks/" + encodeURIComponent(id), accessToken, fetcher });
    const track = normalizeCatalogTrack(data);
    if (!track) throw new CatalogSearchError("Spotify returned an unreadable reference track. Please try again.");
    references.push(track);
  }
  const artists = [...new Map(references.flatMap((track) => track.artists).map((artist) => [artist.id, artist])).values()].slice(0, 5);
  // Rotate artists within each genre so a ten-query budget represents every
  // reference artist, rather than exhausting it on the first artist's genres.
  const queries = (artists.length
    ? (genres.length ? genres : [null]).flatMap((genre) => artists.map((artist) =>
      "artist:" + quoteSearchValue(artist.name) + (genre ? " genre:" + quoteSearchValue(genre) : "")))
    : genres.map((genre) => "genre:" + quoteSearchValue(genre))).slice(0, 10);
  const requiredArtistIdsByQuery = Object.fromEntries(queries.map((query) => [query,
    artists.filter((artist) => query.startsWith("artist:" + quoteSearchValue(artist.name))).map((artist) => artist.id)]));
  if (queries.length === 0) {
    throw new PlaylistGenerationError("Select at least one mood, genre, or reference track.", 400, "missing_seeds");
  }
  const catalogTracks = await searchCatalogTracks(accessToken, {
    queries, requiredArtistIdsByQuery, targetCount: Math.min(200, params.limit * 2), includeExplicit: input.includeExplicit, fetcher,
  });
  const sortedTracks = input.preferPreviews
    ? [...catalogTracks].sort((left, right) => Number(Boolean(right.preview_url)) - Number(Boolean(left.preview_url)))
    : catalogTracks;
  const tracks = selectCatalogTracks(
    sortedTracks, params.limit, input.maxTracksPerArtist ?? DEFAULT_MAX_TRACKS_PER_ARTIST,
  ).map(formatRankedTrack);
  const countWarning = tracks.length === 0
    ? "No catalog matches found. Try different moods, genres, or reference tracks. "
    : tracks.length < params.limit ? "Found " + tracks.length + " matching tracks; broaden your preferences for more. " : "";
  return {
    tracks,
    warning: countWarning + "Moods use genre presets in Spotify catalog search. Energy, happiness, and tempo targets are unavailable and are not applied.",
    metadata: {
      strategy: "catalog_search",
      queries: queries.slice(0, 10),
      usedSeeds: { seed_genres: genres.filter((genre) => queries.some((query) => query.endsWith("genre:" + quoteSearchValue(genre)))), seed_tracks: params.seed_tracks ?? [] },
      params,
      generatedAt: new Date().toISOString(),
    },
  };
}

function formatRankedTrack(track: CatalogTrack): RankedTrack {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists.map((artist) => artist.name),
    album: track.album.name,
    image: track.album.images[0]?.url ?? null,
    uri: track.uri,
    preview_url: track.preview_url,
    explicit: track.explicit,
  };
}

function normalizePercent(value: number): number {
  return clamp(value, 0, 100) / 100;
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
