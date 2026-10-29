"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { buildVibeGeneratorRequest, readVibeBuilderQuery } from "@/lib/vibe-builder";
import type { PlaylistGenerationResponse } from "@/lib/playlist/generate";
import { addHistoryItem, attachPlaylistToHistory } from "@/lib/storage/vibe-data";
import { apiErrorMessage, retryDelayMs } from "@/lib/storage/playlist-draft";
import { usePlaylistDraft } from "@/components/vibe/usePlaylistDraft";
import { ResultsActionBar } from "@/components/vibe/ResultsActionBar";
import { TrackList } from "@/components/vibe/TrackList";

type PlaylistVisibility = "private" | "public";

export default function VibeResultsClient() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const cleanQuery = useMemo(() => {
    const params = new URLSearchParams(queryString);
    params.delete("auth_error");
    return params.toString();
  }, [queryString]);
  const { draft, tracks, hydrated, replaceTracks, editTracks, save, isSaving: isSavingPlaylist, saveError, saveResult, canSave } = usePlaylistDraft<PlaylistGenerationResponse["tracks"][number]>(`vibeplay_advanced_draft_v1:${cleanQuery}`);
  const [lockedTrackIds, setLockedTrackIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistVisibility, setPlaylistVisibility] = useState<PlaylistVisibility>("private");
  const [latestHistoryId, setLatestHistoryId] = useState<string | null>(null);
  const retryAt = useRef(0);
  const generation = useRef<AbortController | null>(null);
  const latest = useRef({ tracks, lockedTrackIds });
  const initializedQuery = useRef<string | null>(null);
  const savedPlaylistName = saveResult?.playlistName ?? "";
  const saveErrorMessage = saveError ?? draft?.attempt?.message ?? null;
  const returnTo = `/vibe/results?${cleanQuery}`;

  useEffect(() => { latest.current = { tracks, lockedTrackIds }; }, [tracks, lockedTrackIds]);

  const requestParse = useMemo(() => {
    const input = readVibeBuilderQuery(new URLSearchParams(cleanQuery));
    try { return { input, request: buildVibeGeneratorRequest(input), error: null as string | null }; }
    catch (error) { return { input, request: null, error: error instanceof Error ? error.message : "Request validation failed." }; }
  }, [cleanQuery]);
  const defaultPlaylistName = `${requestParse.input.vibes[0] ?? "Custom"} • VibePlay`;
  const defaultPlaylistDescription = `Generated with VibePlay from ${requestParse.input.vibes.join(", ") || requestParse.input.genres.join(", ")}.`;

  const fetchResults = useCallback(async () => {
    if (!requestParse.request || generation.current || isSavingPlaylist) return;
    if (Date.now() < retryAt.current) { setErrorMessage(`Spotify asked us to wait. Try again in ${Math.ceil((retryAt.current - Date.now()) / 1000)} seconds.`); return; }
    const controller = new AbortController();
    generation.current = controller;
    const previous = latest.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/vibe/generate", {
        method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ ...requestParse.request, referenceTrackIds: previous.lockedTrackIds }),
      });
      const data = await response.json() as PlaylistGenerationResponse & { warning?: string };
      if (controller.signal.aborted) return;
      if (!response.ok) {
        retryAt.current = Date.now() + retryDelayMs(data, response.headers);
        setErrorMessage(apiErrorMessage(data, "Could not generate tracks right now."));
        return;
      }
      const merged = mergeLockedTracks(data.tracks, previous.lockedTrackIds, {}, requestParse.request.trackCount, previous.tracks);
      if (!merged.length) {
        setErrorMessage("No tracks found. Try another mood or genre; your previous mix is still available.");
        return;
      }
      replaceTracks(merged);
      setWarning(data.warning ?? null);
      setIsSaveModalOpen(false);
      try {
        const historyItem = addHistoryItem({ settings: requestParse.input, topTracks: merged.slice(0, 5).map((track) => ({ id: track.id, name: track.name, artists: track.artists, image: track.image, uri: track.uri })), playlist: null });
        setLatestHistoryId(historyItem.id);
      } catch {
        setLatestHistoryId(null);
        setWarning([data.warning, "Your mix is ready, but browser history could not be saved."].filter(Boolean).join(" "));
      }
    } catch {
      if (!controller.signal.aborted) setErrorMessage("Could not reach Spotify. Your previous mix is still available; please retry.");
    } finally {
      if (generation.current === controller) {
        generation.current = null;
        setIsLoading(false);
      }
    }
  }, [isSavingPlaylist, replaceTracks, requestParse]);

  useEffect(() => {
    if (!hydrated || initializedQuery.current === cleanQuery) return;
    initializedQuery.current = cleanQuery;
    if (!draft) void fetchResults();
  }, [cleanQuery, draft, fetchResults, hydrated]);

  useEffect(() => () => {
    generation.current?.abort();
    generation.current = null;
    initializedQuery.current = null;
  }, [cleanQuery]);

  const handleOpenSaveModal = () => {
    setPlaylistName(draft?.attempt?.payload.name ?? defaultPlaylistName);
    setPlaylistDescription(draft?.attempt?.payload.description ?? defaultPlaylistDescription);
    setPlaylistVisibility(draft?.attempt?.payload.isPublic ? "public" : "private");
    setIsSaveModalOpen(true);
  };

  const handleShuffle = () => {
    editTracks((previous) => {
      const next = [...previous];
      for (let index = next.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [next[index], next[swapIndex]] = [next[swapIndex], next[index]];
      }
      return next;
    });
  };
  const handleRemoveTrack = (trackId: string) => {
    if (draft?.attempt || isLoading || isSavingPlaylist) return;
    editTracks((previous) => previous.filter((track) => track.id !== trackId));
    setLockedTrackIds((previous) => previous.filter((id) => id !== trackId));
  };
  const handleToggleLock = (trackId: string) => {
    if (isLoading || isSavingPlaylist) return;
    setLockedTrackIds((previous) => previous.includes(trackId) ? previous.filter((id) => id !== trackId) : [...previous, trackId]);
  };
  const handleSaveToSpotify = async () => {
    const result = await save({ name: playlistName.trim(), description: playlistDescription.trim(), isPublic: playlistVisibility === "public" });
    if (!result) return;
    setIsSaveModalOpen(false);
    if (latestHistoryId) {
      try { attachPlaylistToHistory(latestHistoryId, { id: result.playlistId, url: result.playlistUrl }); }
      catch { setWarning("Playlist saved to Spotify. Browser history could not be updated."); }
    }
  };
  const handleCreateAnotherPlaylist = () => { void fetchResults(); };

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

      {searchParams.get("auth_error") ? <p role="alert" className="mb-4 text-sm text-amber-200">Spotify connection was not completed. Your settings and mix are preserved. You can reconnect below.</p> : null}
      {warning ? <p role="status" className="mb-4 text-sm text-amber-200">{warning}</p> : null}
      {saveErrorMessage && !isSaveModalOpen ? <p role="alert" className="mb-4 text-sm text-amber-200">{saveErrorMessage}</p> : null}
      {draft?.attempt?.status === "uncertain" ? <a className="mb-4 inline-block text-sm text-emerald-300 underline" href="https://open.spotify.com/collection/playlists" target="_blank" rel="noopener noreferrer">Check your Spotify library</a> : null}
      {draft?.attempt?.recovery ? <a className="mb-4 inline-block text-sm text-emerald-300 underline" href={draft.attempt.recovery.playlistUrl} target="_blank" rel="noopener noreferrer">Open the existing playlist</a> : null}

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
          <a className="mr-3 underline" href={`/api/auth/reconnect?returnTo=${encodeURIComponent(returnTo)}`}>Reconnect Spotify</a>
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

      {!requestParse.error && tracks.length > 0 ? (
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

              </div>
              {saveResult.warning ? <p className="text-amber-200">{saveResult.warning}</p> : null}
              {saveErrorMessage ? <p className="text-amber-200">{saveErrorMessage}</p> : null}
            </div>
          ) : null}

          <ResultsActionBar
            trackCount={tracks.length}
            isBusy={isLoading || isSavingPlaylist}
            canSave={canSave}
            canEdit={!draft?.attempt}
            saveLabel={draft?.attempt?.recovery ? "Finish saving" : "Save to Spotify"}
            onRegenerate={() => void fetchResults()}
            onShuffle={handleShuffle}
            onSave={() => {
              handleOpenSaveModal();
            }}
          />

          <TrackList
            disabled={isLoading || isSavingPlaylist}
            canRemove={!draft?.attempt}
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
                disabled={Boolean(draft?.attempt && draft.attempt.status !== "failed")}
                maxLength={100}
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
                disabled={Boolean(draft?.attempt && draft.attempt.status !== "failed")}
                maxLength={300}
                value={playlistDescription}
                onChange={(event) => setPlaylistDescription(event.target.value)}
                rows={3}
                className="w-full rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100"
              />
            </div>

            <fieldset disabled={Boolean(draft?.attempt && draft.attempt.status !== "failed")} className="space-y-2">
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
                disabled={isSavingPlaylist || !canSave}
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
                    href={`/api/auth/reconnect?returnTo=${encodeURIComponent(returnTo)}`}
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
