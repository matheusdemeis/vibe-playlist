import type { TempoOption } from "@/lib/vibe-builder";

const TEMPO_TARGETS: Record<TempoOption, number> = {
  Slow: 80,
  Medium: 115,
  Fast: 140,
};

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

function normalizePercent(value: number): number {
  return clamp(value, 0, 100) / 100;
}

function uniqueNonEmpty(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
