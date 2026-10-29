export const VIBE_PRESETS = ["Chill", "Gym", "Focus", "Party", "Sad", "Happy"] as const;
export const TEMPO_OPTIONS = ["Slow", "Medium", "Fast"] as const;
export const TRACK_COUNT_OPTIONS = [20, 30, 50] as const;
export const CURATED_GENRES = [
  "pop",
  "rock",
  "hip-hop",
  "electronic",
  "indie",
  "jazz",
  "classical",
  "r-n-b",
  "latin",
  "ambient",
] as const;

export type TempoOption = (typeof TEMPO_OPTIONS)[number];

export type VibeBuilderInput = {
  vibes: string[];
  energy: number;
  valence: number;
  tempo: TempoOption;
  genres: string[];
  trackCount: number;
  explicit: boolean;
};

export type VibeGeneratorRequest = {
  vibes: string[];
  seedGenres: string[];
  targetEnergy: number;
  targetValence: number;
  tempo: TempoOption;
  trackCount: number;
  includeExplicit: boolean;
};

type ValidationResult = {
  isValid: boolean;
  errors: string[];
};

export const DEFAULT_VIBE_INPUT: VibeBuilderInput = {
  vibes: [],
  energy: 50,
  valence: 50,
  tempo: "Medium",
  genres: [],
  trackCount: 20,
  explicit: true,
};

export function validateVibeBuilderInput(input: VibeBuilderInput): ValidationResult {
  const errors: string[] = [];

  if (input.vibes.length === 0 && input.genres.length === 0) {
    errors.push("Select at least one vibe or one genre.");
  }

  if (!Number.isInteger(input.trackCount) || input.trackCount < 10 || input.trackCount > 100) {
    errors.push("Track count must be between 10 and 100.");
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

export function buildVibeGeneratorRequest(input: VibeBuilderInput): VibeGeneratorRequest {
  const validation = validateVibeBuilderInput(input);
  if (!validation.isValid) {
    throw new Error(validation.errors.join(" "));
  }

  const vibes = Array.from(new Set(input.vibes.map((value) => value.trim()).filter(Boolean)));
  const seedGenres = Array.from(new Set(input.genres.map((value) => value.trim()).filter(Boolean)));

  return {
    vibes,
    seedGenres,
    targetEnergy: clamp(input.energy, 0, 100),
    targetValence: clamp(input.valence, 0, 100),
    tempo: input.tempo,
    trackCount: clamp(input.trackCount, 10, 100),
    includeExplicit: input.explicit,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function readVibeBuilderQuery(params: URLSearchParams): VibeBuilderInput {
  const numberOrDefault = (key: string, fallback: number) => {
    const raw = params.get(key);
    if (raw === null || raw.trim() === "") return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  };
  const tempo = params.get("tempo");
  return {
    vibes: params.get("vibes")?.split(",").filter(Boolean) ?? [],
    genres: params.get("genres")?.split(",").filter(Boolean) ?? [],
    energy: numberOrDefault("energy", DEFAULT_VIBE_INPUT.energy),
    valence: numberOrDefault("valence", DEFAULT_VIBE_INPUT.valence),
    tempo: TEMPO_OPTIONS.includes(tempo as TempoOption) ? tempo as TempoOption : DEFAULT_VIBE_INPUT.tempo,
    trackCount: numberOrDefault("trackCount", DEFAULT_VIBE_INPUT.trackCount),
    explicit: params.has("explicit") ? params.get("explicit") === "true" : DEFAULT_VIBE_INPUT.explicit,
  };
}
