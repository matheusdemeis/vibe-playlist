import { describe, expect, it } from "vitest";
import { mapVibeToRecommendationParams } from "./generate";

describe("mapVibeToRecommendationParams", () => {
  it("maps vibe request values into Spotify recommendation params", () => {
    const params = mapVibeToRecommendationParams({
      seedGenres: ["pop", "electronic"],
      targetEnergy: 65,
      targetValence: 45,
      tempo: "Fast",
      trackCount: 30,
    });

    expect(params).toEqual({
      limit: 30,
      seed_genres: ["pop", "electronic"],
      target_energy: 0.65,
      target_valence: 0.45,
      target_tempo: 140,
    });
  });

  it("limits and dedupes seeds and clamps numeric fields", () => {
    const params = mapVibeToRecommendationParams({
      seedGenres: ["pop", "pop", "rock", "hip-hop", "jazz", "indie", "latin"],
      referenceTrackIds: ["1", "2", "2", "3", "4", "5", "6"],
      targetEnergy: 120,
      targetValence: -10,
      trackCount: 200,
    });

    expect(params.seed_genres).toEqual(["pop", "rock", "hip-hop", "jazz", "indie"]);
    expect(params.seed_tracks).toEqual(["1", "2", "3", "4", "5"]);
    expect(params.target_energy).toBe(1);
    expect(params.target_valence).toBe(0);
    expect(params.limit).toBe(100);
  });

  it("omits target_tempo when no tempo is provided", () => {
    const params = mapVibeToRecommendationParams({
      seedGenres: ["ambient"],
      targetEnergy: 30,
      targetValence: 20,
      trackCount: 20,
    });

    expect(params.target_tempo).toBeUndefined();
  });
});
