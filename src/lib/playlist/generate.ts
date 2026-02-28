import type { TempoOption } from "@/lib/vibe-builder";

const TEMPO_TARGETS: Record<TempoOption, number> = {
  Slow: 80,
  Medium: 115,
  Fast: 140,
};
const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
const DEFAULT_MAX_TRACKS_PER_ARTIST = 2;

export type VibeRecommendationInput = {
  seedGenres: string[];
  targetEnergy: number;
  targetValence: number;
  tempo?: TempoOption;
  trackCount: number;
  referenceTrackIds?: string[];
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
  album: {
    name: string;
    images: Array<{ url: string }>;
  };
};

type SpotifyRecommendationsResponse = {
  tracks: SpotifyRecommendationTrack[];
};

type SpotifyAudioFeature = {
  id: string;
  energy: number | null;
  valence: number | null;
};

type SpotifyAudioFeaturesResponse = {
  audio_features: Array<SpotifyAudioFeature | null>;
};

export type RankedTrack = {
  id: string;
  name: string;
  artists: string[];
  album: string;
  image: string | null;
  uri: string;
  preview_url: string | null;
};

export type PlaylistGenerationResponse = {
  tracks: RankedTrack[];
  metadata: {
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

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

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
  fetcher: FetchLike = fetch,
): Promise<PlaylistGenerationResponse> {
  const params = mapVibeToRecommendationParams(input);
  const recommendationTracks = await fetchRecommendations(accessToken, params, fetcher);

  const dedupedTracks = dedupeTracksById(recommendationTracks);
  const sortedTracks = await sortTracksByPreference(
    dedupedTracks,
    params,
    Boolean(input.preferPreviews),
    accessToken,
    fetcher,
  );
  const limitedTracks = limitTracksPerArtist(
    sortedTracks,
    input.maxTracksPerArtist ?? DEFAULT_MAX_TRACKS_PER_ARTIST,
    params.limit,
  );

  return {
    tracks: limitedTracks.map(formatRankedTrack),
    metadata: {
      usedSeeds: {
        seed_genres: params.seed_genres,
        seed_tracks: params.seed_tracks ?? [],
      },
      params,
      generatedAt: new Date().toISOString(),
    },
  };
}

async function fetchRecommendations(
  accessToken: string,
  params: SpotifyRecommendationParams,
  fetcher: FetchLike,
): Promise<SpotifyRecommendationTrack[]> {
  const queryParams = new URLSearchParams({
    limit: String(params.limit),
    seed_genres: params.seed_genres.join(","),
    target_energy: String(params.target_energy),
    target_valence: String(params.target_valence),
  });

  if (params.seed_tracks && params.seed_tracks.length > 0) {
    queryParams.set("seed_tracks", params.seed_tracks.join(","));
  }

  if (params.target_tempo !== undefined) {
    queryParams.set("target_tempo", String(params.target_tempo));
  }

  const response = await fetcher(`${SPOTIFY_API_BASE_URL}/recommendations?${queryParams.toString()}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(`Spotify recommendations request failed (${response.status})`);
  }

  const data = (await response.json()) as SpotifyRecommendationsResponse;
  return data.tracks;
}

async function sortTracksByPreference(
  tracks: SpotifyRecommendationTrack[],
  params: SpotifyRecommendationParams,
  preferPreviews: boolean,
  accessToken: string,
  fetcher: FetchLike,
): Promise<SpotifyRecommendationTrack[]> {
  const features = await fetchAudioFeatures(accessToken, tracks, fetcher);
  const hasScoringData = features.size > 0;

  if (!preferPreviews && !hasScoringData) {
    return tracks;
  }

  const decorated = tracks.map((track, index) => {
    const feature = features.get(track.id);
    const score = feature
      ? Math.abs((feature.energy ?? params.target_energy) - params.target_energy) +
        Math.abs((feature.valence ?? params.target_valence) - params.target_valence)
      : Number.POSITIVE_INFINITY;

    return {
      track,
      index,
      hasPreview: Boolean(track.preview_url),
      score,
    };
  });

  decorated.sort((left, right) => {
    if (preferPreviews && left.hasPreview !== right.hasPreview) {
      return left.hasPreview ? -1 : 1;
    }

    if (hasScoringData && left.score !== right.score) {
      return left.score - right.score;
    }

    return left.index - right.index;
  });

  return decorated.map((item) => item.track);
}

async function fetchAudioFeatures(
  accessToken: string,
  tracks: SpotifyRecommendationTrack[],
  fetcher: FetchLike,
): Promise<Map<string, SpotifyAudioFeature>> {
  if (tracks.length === 0) {
    return new Map<string, SpotifyAudioFeature>();
  }

  const ids = tracks.map((track) => track.id).join(",");
  const response = await fetcher(`${SPOTIFY_API_BASE_URL}/audio-features?ids=${ids}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    return new Map<string, SpotifyAudioFeature>();
  }

  const data = (await response.json()) as SpotifyAudioFeaturesResponse;
  const result = new Map<string, SpotifyAudioFeature>();

  for (const feature of data.audio_features) {
    if (!feature?.id) {
      continue;
    }

    if (feature.energy === null || feature.valence === null) {
      continue;
    }

    result.set(feature.id, feature);
  }

  return result;
}

function formatRankedTrack(track: SpotifyRecommendationTrack): RankedTrack {
  return {
    id: track.id,
    name: track.name,
    artists: track.artists.map((artist) => artist.name),
    album: track.album.name,
    image: track.album.images[0]?.url ?? null,
    uri: track.uri,
    preview_url: track.preview_url,
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
