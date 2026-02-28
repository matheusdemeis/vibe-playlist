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
  const [results, setResults] = useState<PlaylistGenerationResponse | null>(null);
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
        setResults(null);
        setErrorMessage(data.error ?? "Could not generate tracks right now.");
        return;
      }

      const data = (await response.json()) as PlaylistGenerationResponse;
      setResults(data);
    } catch {
      setResults(null);
      setErrorMessage("Could not generate tracks right now.");
    } finally {
      setIsLoading(false);
    }
  }, [requestParse.request]);

  useEffect(() => {
    if (!requestParse.request) {
      setResults(null);
      return;
    }

    void fetchResults();
  }, [fetchResults, requestParse.request]);

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

      {!requestParse.error && !isLoading && !errorMessage && results?.tracks.length === 0 ? (
        <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-600">
          No tracks found for this vibe. Try adjusting genres or mood settings and regenerate.
        </section>
      ) : null}

      {!requestParse.error && !isLoading && !errorMessage && results?.tracks.length ? (
        <section className="rounded-xl border border-zinc-200 bg-zinc-50 p-5 text-sm text-zinc-700">
          Generated {results.tracks.length} tracks.
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
