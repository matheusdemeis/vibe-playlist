"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  DEFAULT_VIBE_INPUT,
  TEMPO_OPTIONS,
  buildVibeGeneratorRequest,
  type TempoOption,
  type VibeBuilderInput,
} from "@/lib/vibe-builder";
import type { PlaylistGenerationResponse } from "@/lib/playlist/generate";

type GenerateVibeApiError = {
  error: string;
  code: string;
};

function readRequestInput(params: URLSearchParams): VibeBuilderInput {
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
    energy: Number.isFinite(energy) ? energy : DEFAULT_VIBE_INPUT.energy,
    valence: Number.isFinite(valence) ? valence : DEFAULT_VIBE_INPUT.valence,
    tempo:
      TEMPO_OPTIONS.includes(tempo as TempoOption)
        ? (tempo as TempoOption)
        : DEFAULT_VIBE_INPUT.tempo,
    trackCount: Number.isFinite(trackCount) ? trackCount : DEFAULT_VIBE_INPUT.trackCount,
    explicit: explicit === null ? DEFAULT_VIBE_INPUT.explicit : explicit === "true",
  };
}

export default function VibeResultsPage() {
  const searchParams = useSearchParams();
  const [tracks, setTracks] = useState<PlaylistGenerationResponse["tracks"]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const queryString = searchParams.toString();
  const requestParse = useMemo(() => {
    const input = readRequestInput(searchParams);

    try {
      const request = buildVibeGeneratorRequest(input);
      return { request, error: null as string | null };
    } catch (error) {
      return {
        request: null,
        error: error instanceof Error ? error.message : "Request validation failed.",
      };
    }
  }, [searchParams]);

  const fetchResults = useCallback(async () => {
    if (!requestParse.request) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await fetch("/api/vibe/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          seedGenres: requestParse.request.seedGenres,
          targetEnergy: requestParse.request.targetEnergy,
          targetValence: requestParse.request.targetValence,
          tempo: requestParse.request.tempo,
          trackCount: requestParse.request.trackCount,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as GenerateVibeApiError;
        setErrorMessage(data.error ?? "Could not generate tracks right now.");
        return;
      }

      const data = (await response.json()) as PlaylistGenerationResponse;
      setTracks(data.tracks);
    } catch {
      setTracks([]);
      setErrorMessage("Could not generate tracks right now.");
    } finally {
      setIsLoading(false);
    }
  }, [requestParse.request]);

  useEffect(() => {
    if (!requestParse.request) {
      setTracks([]);
      return;
    }

    void fetchResults();
  }, [fetchResults, requestParse.request]);

  const handleShuffle = () => {
    setTracks((previous) => {
      const next = [...previous];
      for (let index = next.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      }
      return next;
    });
  };

  const handleRemoveTrack = (trackId: string) => {
    setTracks((previous) => previous.filter((track) => track.id !== trackId));
  };

  return (
    <main className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">Vibe Results</h1>
        <p className="text-sm text-zinc-600 sm:text-base">
          Generated tracks from your current vibe settings.
        </p>
      </header>

      {requestParse.error ? (
        <section className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {requestParse.error}
        </section>
      ) : null}

      {!requestParse.error && isLoading ? (
        <section className="space-y-3">
          <div className="h-16 animate-pulse rounded-xl bg-zinc-100" />
          <div className="h-16 animate-pulse rounded-xl bg-zinc-100" />
          <div className="h-16 animate-pulse rounded-xl bg-zinc-100" />
        </section>
      ) : null}

      {!requestParse.error && !isLoading && errorMessage ? (
        <section className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => void fetchResults()}
            className="rounded-full bg-red-700 px-4 py-2 text-white hover:bg-red-600"
          >
            Retry
          </button>
        </section>
      ) : null}

      {!requestParse.error && !isLoading && !errorMessage && tracks.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600">
          No tracks found for this vibe. Try adjusting genres or mood settings and regenerate.
        </section>
      ) : null}

      {!requestParse.error && !isLoading && !errorMessage && tracks.length > 0 ? (
        <section className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-zinc-700">
              Generated {tracks.length} tracks.
            </p>
            <button
              type="button"
              onClick={handleShuffle}
              className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            >
              Shuffle Order
            </button>
          </div>

          <ul className="space-y-2">
            {tracks.map((track) => (
              <li
                key={track.id}
                className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3"
              >
                {track.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.image}
                    alt={`${track.album} cover`}
                    className="h-12 w-12 rounded-md object-cover"
                  />
                ) : (
                  <div className="h-12 w-12 rounded-md bg-zinc-100" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-900">{track.name}</p>
                  <p className="truncate text-xs text-zinc-600">{track.artists.join(", ")}</p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {track.explicit ? (
                      <span className="rounded-full bg-zinc-200 px-2 py-0.5 text-[10px] font-medium text-zinc-700">
                        Explicit
                      </span>
                    ) : null}
                    {track.preview_url ? (
                      <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        Has Preview
                      </span>
                    ) : null}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveTrack(track.id)}
                  className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100"
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="mt-5">
        <Link
          href={queryString ? `/vibe?${queryString}` : "/vibe"}
          className="inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Back to Builder
        </Link>
      </div>
    </main>
  );
}
