"use client";

import { useEffect, useMemo, useState } from "react";

const VIBE_PRESETS = ["Chill", "Gym", "Focus", "Party", "Sad", "Happy"] as const;
const TEMPO_OPTIONS = ["Slow", "Medium", "Fast"] as const;
const TRACK_COUNT_OPTIONS = [20, 30, 50] as const;
const CURATED_GENRES = [
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

type TempoOption = (typeof TEMPO_OPTIONS)[number];

type VibeFormState = {
  vibes: string[];
  energy: number;
  valence: number;
  tempo: TempoOption;
  genres: string[];
  trackCount: number;
  explicit: boolean;
};

const DEFAULT_STATE: VibeFormState = {
  vibes: [],
  energy: 50,
  valence: 50,
  tempo: "Medium",
  genres: [],
  trackCount: 20,
  explicit: true,
};

function readStateFromQuery(): VibeFormState {
  if (typeof window === "undefined") {
    return DEFAULT_STATE;
  }

  const params = new URLSearchParams(window.location.search);
  const vibes = params.get("vibes")?.split(",").filter(Boolean) ?? [];
  const genres = params.get("genres")?.split(",").filter(Boolean) ?? [];
  const energy = Number(params.get("energy"));
  const valence = Number(params.get("valence"));
  const tempo = params.get("tempo");
  const trackCount = Number(params.get("trackCount"));
  const explicit = params.get("explicit");

  return {
    vibes,
    genres,
    energy: Number.isFinite(energy) ? energy : DEFAULT_STATE.energy,
    valence: Number.isFinite(valence) ? valence : DEFAULT_STATE.valence,
    tempo: TEMPO_OPTIONS.includes(tempo as TempoOption) ? (tempo as TempoOption) : DEFAULT_STATE.tempo,
    trackCount: TRACK_COUNT_OPTIONS.includes(trackCount as 20 | 30 | 50)
      ? (trackCount as 20 | 30 | 50)
      : DEFAULT_STATE.trackCount,
    explicit: explicit === null ? DEFAULT_STATE.explicit : explicit === "true",
  };
}

export default function VibePage() {
  const [state, setState] = useState<VibeFormState>(() => readStateFromQuery());

  useEffect(() => {
    const params = new URLSearchParams();

    if (state.vibes.length > 0) {
      params.set("vibes", state.vibes.join(","));
    }
    if (state.genres.length > 0) {
      params.set("genres", state.genres.join(","));
    }
    params.set("energy", String(state.energy));
    params.set("valence", String(state.valence));
    params.set("tempo", state.tempo);
    params.set("trackCount", String(state.trackCount));
    params.set("explicit", String(state.explicit));

    const query = params.toString();
    const url = query ? `/vibe?${query}` : "/vibe";
    window.history.replaceState(null, "", url);
  }, [state]);

  const toggleSelection = (values: string[], value: string) => {
    if (values.includes(value)) {
      return values.filter((item) => item !== value);
    }
    return [...values, value];
  };

  const resultQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("vibes", state.vibes.join(","));
    params.set("genres", state.genres.join(","));
    params.set("energy", String(state.energy));
    params.set("valence", String(state.valence));
    params.set("tempo", state.tempo);
    params.set("trackCount", String(state.trackCount));
    params.set("explicit", String(state.explicit));
    return params.toString();
  }, [state]);

  return (
    <main className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">Vibe Builder</h1>
        <p className="text-sm text-zinc-600 sm:text-base">
          Build your playlist intent and prepare a request for generation.
        </p>
      </header>

      <section className="space-y-6">
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-900">Vibe / Mood</h2>
          <div className="flex flex-wrap gap-2">
            {VIBE_PRESETS.map((vibe) => {
              const active = state.vibes.includes(vibe);
              return (
                <button
                  key={vibe}
                  type="button"
                  onClick={() =>
                    setState((prev) => ({ ...prev, vibes: toggleSelection(prev.vibes, vibe) }))
                  }
                  className={`rounded-full px-4 py-2 text-sm transition-colors ${
                    active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                >
                  {vibe}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-900">
            Energy: <span className="font-semibold">{state.energy}</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={state.energy}
            onChange={(event) =>
              setState((prev) => ({ ...prev, energy: Number(event.target.value) }))
            }
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-900">
            Valence: <span className="font-semibold">{state.valence}</span>
          </label>
          <input
            type="range"
            min={0}
            max={100}
            value={state.valence}
            onChange={(event) =>
              setState((prev) => ({ ...prev, valence: Number(event.target.value) }))
            }
            className="w-full"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-900">Tempo</label>
          <select
            value={state.tempo}
            onChange={(event) =>
              setState((prev) => ({ ...prev, tempo: event.target.value as TempoOption }))
            }
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            {TEMPO_OPTIONS.map((tempo) => (
              <option key={tempo} value={tempo}>
                {tempo}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-zinc-900">Genres</h2>
          <div className="flex flex-wrap gap-2">
            {CURATED_GENRES.map((genre) => {
              const active = state.genres.includes(genre);
              return (
                <button
                  key={genre}
                  type="button"
                  onClick={() =>
                    setState((prev) => ({ ...prev, genres: toggleSelection(prev.genres, genre) }))
                  }
                  className={`rounded-full px-3 py-2 text-sm transition-colors ${
                    active ? "bg-zinc-900 text-white" : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
                  }`}
                >
                  {genre}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-medium text-zinc-900">Track Count</label>
          <select
            value={state.trackCount}
            onChange={(event) =>
              setState((prev) => ({ ...prev, trackCount: Number(event.target.value) }))
            }
            className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900"
          >
            {TRACK_COUNT_OPTIONS.map((count) => (
              <option key={count} value={count}>
                {count}
              </option>
            ))}
          </select>
        </div>

        <label className="flex items-center gap-2 text-sm text-zinc-900">
          <input
            type="checkbox"
            checked={state.explicit}
            onChange={(event) => setState((prev) => ({ ...prev, explicit: event.target.checked }))}
          />
          Allow explicit tracks
        </label>

        <a
          href={`/vibe/results?${resultQuery}`}
          className="inline-flex w-full items-center justify-center rounded-full bg-zinc-900 px-5 py-3 text-sm font-medium text-white hover:bg-zinc-700 sm:w-auto"
        >
          Generate
        </a>
      </section>
    </main>
  );
}
