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
import { ResultsActionBar } from "@/components/vibe/ResultsActionBar";
import { TrackList } from "@/components/vibe/TrackList";

type GenerateVibeApiError = {
  error: string;
  code: string;
};

type SavePlaylistApiError = {
  error: string;
  code: string;
};

type SavePlaylistApiSuccess = {
  playlistName: string;
  playlistId: string;
  playlistUrl: string;
  isPublic: boolean | null;
  snapshotId: string | null;
  tracksAddedCount: number;
  tracksAdded: boolean;
  warning?: string;
  visibility: {
    requested: boolean;
    final: boolean | null;
  };
};

type PlaylistVisibility = "private" | "public";

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

export default function VibeResultsClient() {
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
  const [playlistVisibility, setPlaylistVisibility] = useState<PlaylistVisibility>("private");
  const [isSavingPlaylist, setIsSavingPlaylist] = useState(false);
  const [isRetryingAddTracks, setIsRetryingAddTracks] = useState(false);
  const [saveErrorMessage, setSaveErrorMessage] = useState<string | null>(null);
  const [saveResult, setSaveResult] = useState<SavePlaylistApiSuccess | null>(null);
  const [savedPlaylistName, setSavedPlaylistName] = useState<string>("");
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
    setPlaylistVisibility("private");
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
    setSavedPlaylistName("");
    const savePayload = {
      name: trimmedName,
      description: playlistDescription.trim(),
      isPublic: playlistVisibility === "public",
      trackUris: tracks.map((track) => track.uri),
    };

    try {
      if (process.env.NODE_ENV !== "production") {
        console.log("[vibe-results] save payload visibility", {
          isPublic: savePayload.isPublic,
          isPublicType: typeof savePayload.isPublic,
        });
      }
      const response = await fetch("/api/vibe/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(savePayload),
      });

      if (!response.ok) {
        const data = (await response.json()) as SavePlaylistApiError;
        setSaveErrorMessage(data.error ?? "Could not save playlist.");
        return;
      }

      const data = (await response.json()) as SavePlaylistApiSuccess;
      if (process.env.NODE_ENV !== "production") {
        console.log("[vibe-results] save response visibility", {
          playlistId: data.playlistId,
          isPublic: data.isPublic,
        });
      }
      setSaveResult(data);
      setSavedPlaylistName(data.playlistName || trimmedName);
      if (data.tracksAdded === false) {
        setSaveErrorMessage("Playlist created, but tracks failed to add.");
      }
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

  const handleCreateAnotherPlaylist = () => {
    setTracks([]);
    setLockedTrackIds([]);
    setLockedTrackCache({});
    setSaveResult(null);
    setSavedPlaylistName("");
    setSaveErrorMessage(null);
    setLatestHistoryId(null);
    setErrorMessage(null);
    setIsSaveModalOpen(false);
    setPlaylistVisibility("private");
    setPlaylistName(defaultPlaylistName);
    setPlaylistDescription(defaultPlaylistDescription);
    if (requestParse.request) {
      void fetchResults();
    }
  };

  const handleRetryAddTracks = async () => {
    if (!saveResult) {
      return;
    }

    setIsRetryingAddTracks(true);
    setSaveErrorMessage(null);
    try {
      const response = await fetch(`/api/playlists/${saveResult.playlistId}/add-tracks`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          trackUris: tracks.map((track) => track.uri),
        }),
      });

      const data = (await response.json()) as
        | { tracksAddedCount: number; error?: string }
        | SavePlaylistApiError;
      if (!response.ok) {
        setSaveErrorMessage(
          ("error" in data ? data.error : undefined) ?? "Could not add tracks right now.",
        );
        return;
      }

      setSaveResult((previous) =>
        previous
          ? {
              ...previous,
              tracksAdded: true,
              tracksAddedCount:
                "tracksAddedCount" in data ? data.tracksAddedCount : previous.tracksAddedCount,
            }
          : previous,
      );
    } catch {
      setSaveErrorMessage("Could not add tracks right now.");
    } finally {
      setIsRetryingAddTracks(false);
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
    <main className="relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-950/90 p-5 shadow-2xl shadow-black/40 sm:p-8">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-28 -top-28 h-64 w-64 rounded-full bg-emerald-500/10 blur-3xl"
      />
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-100 sm:text-3xl">Vibe Results</h1>
        <p className="text-sm text-zinc-400 sm:text-base">
          Generated tracks from your current vibe settings.
        </p>
      </header>

      {requestParse.error ? (
        <section className="rounded-xl border border-red-300/30 bg-red-500/10 p-4 text-sm text-red-200">
          {requestParse.error}
        </section>
      ) : null}

      {!requestParse.error && isLoading ? (
        <section aria-live="polite" aria-busy="true" className="space-y-3">
          <p className="text-sm text-zinc-400">Generating tracks...</p>
          <div className="h-16 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
          <div className="h-16 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
          <div className="h-16 animate-pulse rounded-xl border border-zinc-800 bg-zinc-900" />
        </section>
      ) : null}

      {!requestParse.error && !isLoading && errorMessage ? (
        <section
          aria-live="assertive"
          className="space-y-3 rounded-xl border border-red-300/30 bg-red-500/10 p-4 text-sm text-red-200"
        >
          <p>{errorMessage}</p>
          <button
            type="button"
            onClick={() => void fetchResults()}
            disabled={isLoading}
            className="rounded-full bg-red-400 px-4 py-2 text-zinc-900 hover:bg-red-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading ? "Retrying..." : "Retry"}
          </button>
        </section>
      ) : null}

      {!requestParse.error && !isLoading && !errorMessage && tracks.length === 0 ? (
        <section className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-5 text-sm text-zinc-400">
          No tracks found for this vibe. Try adjusting genres or mood settings and regenerate.
        </section>
      ) : null}

      {!requestParse.error && !isLoading && !errorMessage && tracks.length > 0 ? (
        <section className="space-y-4">
          {saveResult ? (
            <div className="space-y-3 rounded-xl border border-emerald-300/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
              <p className="font-semibold">Playlist created successfully.</p>
              <p>
                Name: <span className="font-medium">{savedPlaylistName || "Playlist"}</span>
              </p>
              <p>
                Tracks added: {saveResult.tracksAdded ? saveResult.tracksAddedCount : 0}
              </p>
              <p>
                Visibility:{" "}
                {saveResult.isPublic === true
                  ? "Public"
                  : saveResult.isPublic === false
                    ? "Private"
                    : "Unknown"}
              </p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={saveResult.playlistUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex rounded-full bg-zinc-950 px-4 py-2 text-xs font-medium text-emerald-300 hover:bg-black"
                >
                  Open in Spotify
                </a>
                <button
                  type="button"
                  onClick={handleCreateAnotherPlaylist}
                  className="inline-flex rounded-full border border-emerald-300/30 px-4 py-2 text-xs font-medium text-emerald-100 hover:bg-emerald-400/10"
                >
                  Create Another Playlist
                </button>
                {!saveResult.tracksAdded ? (
                  <button
                    type="button"
                    onClick={() => void handleRetryAddTracks()}
                    disabled={isRetryingAddTracks}
                    className="inline-flex rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-60"
                  >
                    {isRetryingAddTracks ? "Retrying..." : "Retry add tracks"}
                  </button>
                ) : null}
              </div>
              {saveResult.warning ? <p className="text-amber-200">{saveResult.warning}</p> : null}
              {saveErrorMessage ? <p className="text-amber-200">{saveErrorMessage}</p> : null}
            </div>
          ) : null}

          <ResultsActionBar
            trackCount={tracks.length}
            isBusy={isLoading || isSavingPlaylist || isRetryingAddTracks}
            onRegenerate={() => void fetchResults()}
            onShuffle={handleShuffle}
            onSave={() => {
              setSaveErrorMessage(null);
              setIsSaveModalOpen(true);
            }}
          />

          <TrackList
            tracks={tracks}
            lockedTrackIds={lockedTrackIds}
            onToggleLock={handleToggleLock}
            onRemoveTrack={handleRemoveTrack}
          />
        </section>
      ) : null}

      <div className="mt-5">
        <Link
          href={queryString ? `/vibe?${queryString}` : "/vibe"}
          className="inline-flex rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-200 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
        >
          Back to Builder
        </Link>
        <Link
          href="/vibe/history"
          className="ml-2 inline-flex rounded-full border border-zinc-700 px-4 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800"
        >
          View History
        </Link>
      </div>

      {isSaveModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Save playlist to Spotify"
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 sm:items-center"
        >
          <div className="w-full max-w-lg space-y-4 rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:p-6">
            <div className="space-y-1">
              <h2 className="text-lg font-semibold text-zinc-100">Save to Spotify</h2>
              <p className="text-sm text-zinc-400">
                Edit details before creating the playlist in your account.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="playlist-name" className="text-sm font-medium text-zinc-100">
                Playlist name
              </label>
              <input
                id="playlist-name"
                value={playlistName}
                onChange={(event) => setPlaylistName(event.target.value)}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="playlist-description" className="text-sm font-medium text-zinc-100">
                Description
              </label>
              <textarea
                id="playlist-description"
                value={playlistDescription}
                onChange={(event) => setPlaylistDescription(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-zinc-100">Playlist visibility</legend>
              <div className="inline-flex rounded-xl border border-zinc-800 bg-zinc-900 p-1">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="playlist-visibility"
                    value="private"
                    checked={playlistVisibility === "private"}
                    onChange={() => setPlaylistVisibility("private")}
                    className="sr-only"
                  />
                  <span
                    className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-medium ${
                      playlistVisibility === "private"
                        ? "bg-emerald-500 text-zinc-950"
                        : "text-zinc-300"
                    }`}
                  >
                    Private
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="playlist-visibility"
                    value="public"
                    checked={playlistVisibility === "public"}
                    onChange={() => setPlaylistVisibility("public")}
                    className="sr-only"
                  />
                  <span
                    className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-medium ${
                      playlistVisibility === "public"
                        ? "bg-emerald-500 text-zinc-950"
                        : "text-zinc-300"
                    }`}
                  >
                    Public
                  </span>
                </label>
              </div>
              <p className="text-xs text-zinc-400">Private playlists are only visible to you.</p>
            </fieldset>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                disabled={isSavingPlaylist}
                className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-800"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSaveToSpotify()}
                disabled={isSavingPlaylist}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {isSavingPlaylist ? "Saving..." : "Save Playlist"}
              </button>
            </div>

            {isSavingPlaylist ? (
              <p className="text-sm text-zinc-400">
                Saving playlist ({tracks.length} tracks)... this may take a few seconds.
              </p>
            ) : null}

            {saveErrorMessage ? (
              <div className="rounded-lg border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-200">
                <p>{saveErrorMessage}</p>
                {saveErrorMessage.toLowerCase().includes("reconnect") ? (
                  <a
                    href="/api/auth/reconnect"
                    className="mt-2 inline-block rounded-full bg-red-400 px-4 py-1.5 text-xs font-semibold text-zinc-900 hover:bg-red-300"
                  >
                    Reconnect Spotify
                  </a>
                ) : null}
              </div>
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
