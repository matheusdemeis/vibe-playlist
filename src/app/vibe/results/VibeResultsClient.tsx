"use client";

import Link from "next/link";
import { Icon, SpotifyIcon } from "@/components/ui/Icon";
import { MoodArtwork } from "@/components/MoodArtwork";
import { normalizeVibeKey } from "@/lib/vibes";
import { SpotifyConnection } from "@/components/vibe/ConnectionCard";
import { GenerationProgress } from "@/components/vibe/GenerationProgress";
import { SavePlaylistDialog } from "@/components/vibe/SavePlaylistDialog";
import { SaveSuccess } from "@/components/vibe/SaveSuccess";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  buildVibeGeneratorRequest,
  readVibeBuilderQuery,
} from "@/lib/vibe-builder";
import type { PlaylistGenerationResponse } from "@/lib/playlist/generate";
import {
  addHistoryItem,
  attachPlaylistToHistory,
} from "@/lib/storage/vibe-data";
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
  const {
    draft,
    tracks,
    hydrated,
    replaceTracks,
    editTracks,
    save,
    isSaving: isSavingPlaylist,
    saveError,
    saveResult,
    canSave,
  } = usePlaylistDraft<PlaylistGenerationResponse["tracks"][number]>(
    `vibeplay_advanced_draft_v1:${cleanQuery}`,
  );
  const [lockedTrackIds, setLockedTrackIds] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("");
  const [playlistVisibility, setPlaylistVisibility] =
    useState<PlaylistVisibility>("private");
  const [latestHistoryId, setLatestHistoryId] = useState<string | null>(null);
  const retryAt = useRef(0);
  const generation = useRef<AbortController | null>(null);
  const latest = useRef({ tracks, lockedTrackIds });
  const initializedQuery = useRef<string | null>(null);
  const saveErrorMessage = saveError ?? draft?.attempt?.message ?? null;
  const returnTo = `/vibe/results?${cleanQuery}`;

  useEffect(() => {
    latest.current = { tracks, lockedTrackIds };
  }, [tracks, lockedTrackIds]);

  const requestParse = useMemo(() => {
    const input = readVibeBuilderQuery(new URLSearchParams(cleanQuery));
    try {
      return {
        input,
        request: buildVibeGeneratorRequest(input),
        error: null as string | null,
      };
    } catch (error) {
      return {
        input,
        request: null,
        error:
          error instanceof Error ? error.message : "Request validation failed.",
      };
    }
  }, [cleanQuery]);
  const defaultPlaylistName = `${requestParse.input.vibes[0] ?? "Custom"} • VibePlay`;
  const defaultPlaylistDescription = `Generated with VibePlay from ${requestParse.input.vibes.join(", ") || requestParse.input.genres.join(", ")}.`;

  const fetchResults = useCallback(async () => {
    if (!requestParse.request || generation.current || isSavingPlaylist) return;
    if (Date.now() < retryAt.current) {
      setErrorMessage(
        `Spotify asked us to wait. Try again in ${Math.ceil((retryAt.current - Date.now()) / 1000)} seconds.`,
      );
      return;
    }
    const controller = new AbortController();
    generation.current = controller;
    const previous = latest.current;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/vibe/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
        body: JSON.stringify({
          ...requestParse.request,
          referenceTrackIds: previous.lockedTrackIds,
        }),
      });
      const data = (await response.json()) as PlaylistGenerationResponse & {
        warning?: string;
      };
      if (controller.signal.aborted) return;
      if (!response.ok) {
        retryAt.current = Date.now() + retryDelayMs(data, response.headers);
        setErrorMessage(
          apiErrorMessage(data, "Could not generate tracks right now."),
        );
        return;
      }
      const merged = mergeLockedTracks(
        data.tracks,
        previous.lockedTrackIds,
        {},
        requestParse.request.trackCount,
        previous.tracks,
      );
      if (!merged.length) {
        setErrorMessage(
          "No tracks found. Try another mood or genre; your previous mix is still available.",
        );
        return;
      }
      replaceTracks(merged);
      setWarning(data.warning ?? null);
      setIsSaveModalOpen(false);
      try {
        const historyItem = addHistoryItem({
          settings: requestParse.input,
          topTracks: merged
            .slice(0, 5)
            .map((track) => ({
              id: track.id,
              name: track.name,
              artists: track.artists,
              image: track.image,
              uri: track.uri,
            })),
          playlist: null,
        });
        setLatestHistoryId(historyItem.id);
      } catch {
        setLatestHistoryId(null);
        setWarning(
          [
            data.warning,
            "Your mix is ready, but browser history could not be saved.",
          ]
            .filter(Boolean)
            .join(" "),
        );
      }
    } catch {
      if (!controller.signal.aborted)
        setErrorMessage(
          "Could not reach Spotify. Your previous mix is still available; please retry.",
        );
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

  useEffect(
    () => () => {
      generation.current?.abort();
      generation.current = null;
      initializedQuery.current = null;
    },
    [cleanQuery],
  );

  const handleOpenSaveModal = () => {
    setPlaylistName(draft?.attempt?.payload.name ?? defaultPlaylistName);
    setPlaylistDescription(
      draft?.attempt?.payload.description ?? defaultPlaylistDescription,
    );
    setPlaylistVisibility(
      draft?.attempt?.payload.isPublic ? "public" : "private",
    );
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
    setLockedTrackIds((previous) =>
      previous.includes(trackId)
        ? previous.filter((id) => id !== trackId)
        : [...previous, trackId],
    );
  };
  const handleSaveToSpotify = async () => {
    const result = await save({
      name: playlistName.trim(),
      description: playlistDescription.trim(),
      isPublic: playlistVisibility === "public",
    });
    if (!result) return;
    setIsSaveModalOpen(false);
    if (latestHistoryId) {
      try {
        attachPlaylistToHistory(latestHistoryId, {
          id: result.playlistId,
          url: result.playlistUrl,
        });
      } catch {
        setWarning(
          "Playlist saved to Spotify. Browser history could not be updated.",
        );
      }
    }
  };

  return (
    <main id="main-content" tabIndex={-1} className="shell page results-page">
      <header className="page-heading page-heading-row">
        <div>
          <span className="eyebrow">MIX STUDIO / YOUR RESULTS</span>
          <h1>A soundtrack, with your signature.</h1>
          <p>
            Keep the tracks you love. Shuffle, refine, and make this mix your
            own.
          </p>
        </div>
      </header>
      <SpotifyConnection
        returnTo={returnTo}
        busy={isSavingPlaylist || isLoading}
      />
      {requestParse.error && (
        <div role="alert" className="notice notice-error">
          {requestParse.error}{" "}
          <Link className="inline-link" href={`/vibe?${cleanQuery}`}>
            Edit your settings
          </Link>
        </div>
      )}
      {searchParams.get("auth_error") && (
        <p role="alert" className="notice notice-error">
          Spotify connection was not completed. Your settings and mix are
          preserved. Connect above to try again.
        </p>
      )}
      {warning && (
        <p role="status" className="notice">
          {warning}
        </p>
      )}
      {saveErrorMessage && !isSaveModalOpen && (
        <p role="alert" className="notice notice-error">
          {saveErrorMessage}
        </p>
      )}
      {draft?.attempt?.status === "uncertain" && (
        <p className="notice">
          <a
            className="inline-link"
            href="https://open.spotify.com/collection/playlists"
            target="_blank"
            rel="noopener noreferrer"
          >
            Check your Spotify library <Icon name="external" />
          </a>
        </p>
      )}
      {draft?.attempt?.recovery && (
        <p className="notice">
          <a
            className="inline-link"
            href={draft.attempt.recovery.playlistUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            Open the existing playlist <Icon name="external" />
          </a>
        </p>
      )}
      {!requestParse.error && isLoading && <GenerationProgress />}
      {!requestParse.error && !isLoading && errorMessage && (
        <section className="notice notice-error" role="alert">
          <p>{errorMessage}</p>
          <div className="notice-actions">
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => void fetchResults()}
            >
              Retry <Icon name="refresh" width="16" height="16" />
            </button>
            <a
              className="inline-link"
              href={`/api/auth/reconnect?returnTo=${encodeURIComponent(returnTo)}`}
            >
              Reconnect Spotify
            </a>
          </div>
        </section>
      )}
      {!requestParse.error &&
        !isLoading &&
        hydrated &&
        !errorMessage &&
        !tracks.length && (
          <div className="empty-history">
            <Icon name="music" width="32" height="32" />
            <h2>Let’s try another direction.</h2>
            <p>
              No tracks matched this selection. Change a mood or genre and give
              it another spin.
            </p>
            <Link
              className="button button-secondary"
              href={`/vibe?${cleanQuery}`}
            >
              Adjust your mix <Icon name="arrow" />
            </Link>
          </div>
        )}
      {!requestParse.error && tracks.length > 0 && (
        <section aria-label="Generated playlist" aria-busy={isLoading}>
          {saveResult && <SaveSuccess result={saveResult} />}
          <div className="playlist-preview">
            <div className="playlist-intro">
              <div className="playlist-cover">
                <MoodArtwork
                  mood={
                    normalizeVibeKey(requestParse.input.vibes[0]) ?? "chill"
                  }
                />
              </div>
              <div>
                <span className="eyebrow">A VIBEPLAY MIX / MADE BY YOU</span>
                <h2>{saveResult?.playlistName ?? defaultPlaylistName}</h2>
                <p>
                  {tracks.length} tracks ·{" "}
                  {requestParse.input.vibes.join(" + ") ||
                    requestParse.input.genres.join(" + ")}{" "}
                  · Spotify
                </p>
              </div>
            </div>
            <ResultsActionBar
              trackCount={tracks.length}
              isBusy={isLoading || isSavingPlaylist}
              canSave={canSave}
              canEdit={!draft?.attempt}
              saveLabel={
                saveResult
                  ? "Saved to Spotify"
                  : draft?.attempt?.status === "uncertain"
                    ? "Check Spotify library"
                    : draft?.attempt?.recovery
                      ? "Finish saving"
                      : "Save to Spotify"
              }
              onRegenerate={() => void fetchResults()}
              onShuffle={handleShuffle}
              onSave={handleOpenSaveModal}
            />
            <p className="results-hint">
              <Icon
                name="lock"
                width="12"
                height="12"
                className="inline-block mr-1"
              />
              Lock a track to keep it when you regenerate. Track titles open in
              Spotify.
            </p>
            <TrackList
              disabled={isLoading || isSavingPlaylist}
              canRemove={!draft?.attempt}
              tracks={tracks}
              lockedTrackIds={lockedTrackIds}
              onToggleLock={handleToggleLock}
              onRemoveTrack={handleRemoveTrack}
            />
            <div className="playlist-attribution">
              <span>
                {lockedTrackIds.length
                  ? `${lockedTrackIds.length} tracks locked for your next mix`
                  : "Good music. Your final say."}
              </span>
              <a
                href="https://open.spotify.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                <SpotifyIcon />
                Spotify
              </a>
            </div>
          </div>
        </section>
      )}
      <div className="results-bottom">
        <Link
          className="inline-link"
          href={cleanQuery ? `/vibe?${cleanQuery}` : "/vibe"}
        >
          <Icon name="sliders" />
          Back to mix studio
        </Link>
        <Link className="inline-link" href="/vibe/history">
          View History <Icon name="clock" />
        </Link>
      </div>
      {isSaveModalOpen && (
        <SavePlaylistDialog
          name={playlistName}
          description={playlistDescription}
          isPublic={playlistVisibility === "public"}
          trackCount={tracks.length}
          onNameChange={setPlaylistName}
          onDescriptionChange={setPlaylistDescription}
          onPublicChange={(value) =>
            setPlaylistVisibility(value ? "public" : "private")
          }
          onClose={() => setIsSaveModalOpen(false)}
          onSave={() => void handleSaveToSpotify()}
          isSaving={isSavingPlaylist}
          canSave={canSave}
          locked={Boolean(draft?.attempt && draft.attempt.status !== "failed")}
          error={saveErrorMessage}
          reconnectUrl={`/api/auth/reconnect?returnTo=${encodeURIComponent(returnTo)}`}
        />
      )}
    </main>
  );
}

function mergeLockedTracks(
  incomingTracks: PlaylistGenerationResponse["tracks"],
  lockedTrackIds: string[],
  lockedTrackCache: Record<
    string,
    PlaylistGenerationResponse["tracks"][number]
  >,
  trackCount: number,
  currentTracks: PlaylistGenerationResponse["tracks"],
): PlaylistGenerationResponse["tracks"] {
  if (lockedTrackIds.length === 0) {
    return incomingTracks;
  }

  const latestTrackMap: Record<
    string,
    PlaylistGenerationResponse["tracks"][number]
  > = {
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
