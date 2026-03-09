export const VIBE_CONFIG = {
  chill: {
    seedGenres: ["indie", "alt-rock", "acoustic"],
    targetEnergy: 0.3,
    targetDanceability: 0.4,
  },
  gym: {
    seedGenres: ["edm", "hip-hop", "dance"],
    targetEnergy: 0.9,
    targetDanceability: 0.8,
  },
  beach: {
    seedGenres: ["pop", "reggae", "latin"],
    targetEnergy: 0.6,
    targetDanceability: 0.7,
  },
  nightdrive: {
    seedGenres: ["synth-pop", "electronic", "house"],
    targetEnergy: 0.5,
  },
  party: {
    seedGenres: ["dance", "pop", "electronic"],
    targetEnergy: 0.85,
    targetDanceability: 0.9,
  },
  snowboarding: {
    seedGenres: ["edm", "electronic", "rock"],
    targetEnergy: 0.8,
  },
} as const;

export type VibeKey = keyof typeof VIBE_CONFIG;

export const VIBE_OPTIONS: Array<{ value: VibeKey; label: string }> = [
  { value: "chill", label: "Chill" },
  { value: "gym", label: "Gym" },
  { value: "beach", label: "Beach" },
  { value: "nightdrive", label: "Night Drive" },
  { value: "party", label: "Party" },
  { value: "snowboarding", label: "Snowboarding" },
];

export const VIBE_SEARCH_TERMS: Record<VibeKey, string> = {
  chill: "indie acoustic mellow",
  gym: "edm hip-hop workout",
  beach: "summer pop reggae",
  nightdrive: "synthwave electronic night",
  party: "dance pop club",
  snowboarding: "edm electronic adrenaline",
};

export function normalizeVibeKey(value: unknown): VibeKey | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.toLowerCase().replace(/\s+/g, "");
  return normalized in VIBE_CONFIG ? (normalized as VibeKey) : null;
}
