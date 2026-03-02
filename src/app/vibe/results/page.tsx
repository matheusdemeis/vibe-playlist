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
import { addHistoryItem, attachPlaylistToHistory } from "@/lib/storage/vibe-data";

type GenerateVibeApiError = {
  error: string;
  code: string;
};

type SavePlaylistApiError = {
  error: string;
  code: string;
};

type SavePlaylistApiSuccess = {
  playlistId: string;
  playlistUrl: string;
  snapshotId: string | null;
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
  const [lockedTrackIds, setLockedTrackIds] = useState<string[]>([]);
  const [lockedTrackCache, setLockedTrackCache] = useState<
    Record<string, PlaylistGenerationResponse["tracks"][number]>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [isPublicPlaylist, setIsPublicPlaylist] = useState(false);
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<SavePlaylistApiSuccess | null>(null);
  const [latestHistoryId, setLatestHistoryId] = useState<string | null>(null);

  const queryString = searchParams.toString();
  const requestParse = useMemo(() => {
    const input = readRequestInput(searchParams);

    try {
      const request = buildVibeGeneratorRequest(input);
      return { input, request, error: null as string | null };
    } catch (error) {
      return {
        input,
        request: null,
        error: error instanceof Error ? error.message : "Request validation failed.",
      };
    }
  }, [searchParams]);

  const defaultPlaylistName = useMemo(() => {
    if (!requestParse.request) {
      return "";
    }

    return buildDefaultPlaylistName(requestParse.request.vibes, requestParse.request.targetEnergy);
  }, [requestParse.request]);

  const defaultPlaylistDescription = useMemo(() => {
    if (!requestParse.request) {
      return "";
    }

    const vibeText =
      requestParse.request.vibes.length > 0
        ? requestParse.request.vibes.join(", ")
        : "custom vibe settings";
    return `Generated with Vibe Builder from ${vibeText}.`;
  }, [requestParse.request]);

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
          referenceTrackIds: lockedTrackIds,
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as GenerateVibeApiError;
        setErrorMessage(data.error ?? "Could not generate tracks right now.");
        return;
      }

      const data = (await response.json()) as PlaylistGenerationResponse;
      setTracks((currentTracks) => {
        const mergedTracks = mergeLockedTracks(
          data.tracks,
          lockedTrackIds,
          lockedTrackCache,
          requestParse.request.trackCount,
          currentTracks,
        );

        const historyItem = addHistoryItem({
          settings: requestParse.input,
          topTracks: mergedTracks.slice(0, 5).map((track) => ({
            id: track.id,
            name: track.name,
            artists: track.artists,
            image: track.image,
            uri: track.uri,
          })),
          playlist: null,
        });
        setLatestHistoryId(historyItem.id);

        return mergedTracks;
      });
    } catch {
      setTracks([]);
      setErrorMessage("Could not generate tracks right now.");
    } finally {
      setIsLoading(false);
    }
  }, [lockedTrackCache, lockedTrackIds, requestParse.input, requestParse.request]);

  useEffect(() => {
    if (!requestParse.request) {
      setTracks([]);
      return;
    }

    void fetchResults();
  }, [fetchResults, requestParse.request]);

  useEffect(() => {
    if (!requestParse.request) {
      setPlaylistName("");
      setPlaylistDescription("");
      return;
    }

    setPlaylistName(defaultPlaylistName);
    setPlaylistDescription(defaultPlaylistDescription);
    setIsPublicPlaylist(false);
  }, [defaultPlaylistDescription, defaultPlaylistName, requestParse.request]);

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
    setLockedTrackIds((previous) => previous.filter((id) => id !== trackId));
  };

  const handleToggleLock = (trackId: string) => {
    setLockedTrackIds((previous) => {
      if (previous.includes(trackId)) {
        return previous.filter((id) => id !== trackId);
      }
      return [...previous, trackId];
    });
  };

  const handleSaveToSpotify = async () => {
    if (tracks.length === 0) {
      setSaveErrorMessage("No tracks available to save.");
      return;
    }

    const trimmedName = playlistName.trim();
    if (!trimmedName) {
      setSaveErrorMessage("Playlist name is required.");
      return;
    }

    setIsSavingPlaylist(true);
    setSaveErrorMessage(null);
    setSaveResult(null);

    try {
      const response = await fetch("/api/vibe/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: trimmedName,
          description: playlistDescription.trim(),
          isPublic: isPublicPlaylist === true,
          trackUris: tracks.map((track) => track.uri),
        }),
      });

      if (!response.ok) {
        const data = (await response.json()) as SavePlaylistApiError;
        setSaveErrorMessage(data.error ?? "Could not save playlist.");
        return;
      }

      const data = (await response.json()) as SavePlaylistApiSuccess;
      setSaveResult(data);
      if (latestHistoryId) {
        attachPlaylistToHistory(latestHistoryId, {
          id: data.playlistId,
          url: data.playlistUrl,
        });
      }
      setIsSaveModalOpen(false);
    } catch {
      setSaveErrorMessage("Could not save playlist right now.");
    } finally {
      setIsSavingPlaylist(false);
    }
  };

  useEffect(() => {
    if (tracks.length === 0) {
      return;
    }

    setLockedTrackCache((previous) => {
      const next = { ...previous };
      for (const track of tracks) {
        if (lockedTrackIds.includes(track.id)) {
          next[track.id] = track;
        }
      }
      return next;
    });
  }, [lockedTrackIds, tracks]);

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
        <section aria-live="polite" aria-busy="true" className="space-y-3">
          <p className="text-sm text-zinc-600">Generating tracks...</p>
          <div className="h-16 animate-pulse rounded-xl bg-zinc-100" />
          <div className="h-16 animate-pulse rounded-xl bg-zinc-100" />
          <div className="h-16 animate-pulse rounded-xl bg-zinc-100" />
        </section>
      ) : null}

      {!requestParse.error && !isLoading && errorMessage ? (
        <section
          aria-live="assertive"
          className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700"
        >
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => void fetchResults()}
            className="rounded-full bg-red-700 px-4 py-2 text-white hover:bg-red-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-500"
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
          {saveResult ? (
            <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <p>Playlist saved with {tracks.length} tracks.</p>
              <a
                href={saveResult.playlistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex rounded-full bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-600"
              >
                Open in Spotify
              </a>
            </div>
          ) : null}

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-zinc-700">
              Generated {tracks.length} tracks.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void fetchResults()}
                className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
              >
                Regenerate
              </button>
              <button
                type="button"
                onClick={handleShuffle}
                className="rounded-full border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
              >
                Shuffle Order
              </button>
              <button
                type="button"
                onClick={() => {
                  setSaveErrorMessage(null);
                  setIsSaveModalOpen(true);
                }}
                className="rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
              >
                Save to Spotify
              </button>
            </div>
          </div>

          <ul className="space-y-2" aria-live="polite">
            {tracks.map((track) => (
              <li
                key={track.id}
                className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-3 sm:flex-row sm:items-center"
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
                  onClick={() => handleToggleLock(track.id)}
                  aria-pressed={lockedTrackIds.includes(track.id)}
                  className={`rounded-full border px-3 py-1.5 text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500 ${
                    lockedTrackIds.includes(track.id)
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-300 text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  {lockedTrackIds.includes(track.id) ? "Locked" : "Lock"}
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveTrack(track.id)}
                  className="rounded-full border border-zinc-300 px-3 py-1.5 text-xs text-zinc-700 hover:bg-zinc-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
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
          className="inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
        >
          Back to Builder
        </Link>
        <Link
          href="/vibe/history"
          className="ml-2 inline-flex rounded-full border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          View History
        </Link>
      </div>

      {isSaveModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Save playlist to Spotify"
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 p-4 sm:items-center"
        >
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-zinc-900">Save to Spotify</h2>
              <p className="text-sm text-zinc-600">
                Edit details before creating the playlist in your account.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="playlist-name" className="text-sm font-medium text-zinc-900">
                Playlist name
              </label>
              <input
                id="playlist-name"
                value={playlistName}
                onChange={(event) => setPlaylistName(event.target.value)}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="playlist-description" className="text-sm font-medium text-zinc-900">
                Description
              </label>
              <textarea
                id="playlist-description"
                value={playlistDescription}
                onChange={(event) => setPlaylistDescription(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-900">
              <input
                type="checkbox"
                checked={isPublicPlaylist}
                onChange={(event) => setIsPublicPlaylist(event.target.checked)}
              />
              Make playlist public
            </label>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                disabled={isSavingPlaylist}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveToSpotify()}
                disabled={isSavingPlaylist}
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {isSavingPlaylist ? "Saving..." : "Save Playlist"}
              </button>
            </div>

            {isSavingPlaylist ? (
              <p className="text-sm text-zinc-600">
                Saving playlist ({tracks.length} tracks)... this may take a few seconds.
              </p>
            ) : null}

            {saveErrorMessage ? (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {saveErrorMessage}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  );
}

function mergeLockedTracks(
  incomingTracks: PlaylistGenerationResponse["tracks"],
  lockedTrackIds: string[],
  lockedTrackCache: Record<string, PlaylistGenerationResponse["tracks"][number]>,
  trackCount: number,
  currentTracks: PlaylistGenerationResponse["tracks"],
): PlaylistGenerationResponse["tracks"] {
  if (lockedTrackIds.length === 0) {
    return incomingTracks;
  }

  const latestTrackMap: Record<string, PlaylistGenerationResponse["tracks"][number]> = {
    ...lockedTrackCache,
  };
  for (const track of currentTracks) {
    latestTrackMap[track.id] = track;
  }
  for (const track of incomingTracks) {
    latestTrackMap[track.id] = track;
  }

  const merged: PlaylistGenerationResponse["tracks"] = [];
  const seen = new Set<string>();

  for (const id of lockedTrackIds) {
    const lockedTrack = latestTrackMap[id];
    if (!lockedTrack || seen.has(lockedTrack.id)) {
      continue;
    }
    seen.add(lockedTrack.id);
    merged.push(lockedTrack);
  }

  for (const track of incomingTracks) {
    if (seen.has(track.id)) {
      continue;
    }
    seen.add(track.id);
    merged.push(track);
  }

  return merged.slice(0, trackCount);
}

function buildDefaultPlaylistName(vibes: string[], targetEnergy: number): string {
  const primaryVibe = vibes[0] ?? "Vibe";
  const energyLabel = getEnergyLabel(targetEnergy);
  const dateLabel = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date());

  return `${primaryVibe} • ${energyLabel} • ${dateLabel}`;
}

function getEnergyLabel(targetEnergy: number): string {
  if (targetEnergy >= 67) {
    return "High Energy";
  }
  if (targetEnergy >= 34) {
    return "Medium Energy";
  }
  return "Low Energy";
}
