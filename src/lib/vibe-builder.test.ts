import { describe, expect, it } from "vitest";
import {
  DEFAULT_VIBE_INPUT,
  buildVibeGeneratorRequest,
  validateVibeBuilderInput,
} from "./vibe-builder";

describe("validateVibeBuilderInput", () => {
  it("fails when neither vibe nor genre is selected", () => {
    const result = validateVibeBuilderInput({
      ...DEFAULT_VIBE_INPUT,
      vibes: [],
      genres: [],
      trackCount: 20,
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Select at least one vibe or one genre.");
  });

  it("fails when track count is outside 10-100", () => {
    const result = validateVibeBuilderInput({
      ...DEFAULT_VIBE_INPUT,
      vibes: ["Chill"],
      trackCount: 101,
    });

    expect(result.isValid).toBe(false);
    expect(result.errors).toContain("Track count must be between 10 and 100.");
  });

  it("builds a normalized request when valid", () => {
    const request = buildVibeGeneratorRequest({
      ...DEFAULT_VIBE_INPUT,
      vibes: ["Chill", "Chill"],
      genres: ["pop", "pop"],
      energy: 120,
      valence: -10,
      trackCount: 30,
      explicit: false,
    });

    expect(request.vibes).toEqual(["Chill"]);
    expect(request.seedGenres).toEqual(["pop"]);
    expect(request.targetEnergy).toBe(100);
    expect(request.targetValence).toBe(0);
    expect(request.includeExplicit).toBe(false);
  });
});
