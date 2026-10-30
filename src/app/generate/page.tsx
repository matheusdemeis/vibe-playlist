"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Icon, SpotifyIcon } from "@/components/ui/Icon";
import { MoodArtwork, MOOD_NOTES } from "@/components/MoodArtwork";
import { ConnectionCard } from "@/components/vibe/ConnectionCard";
import { GenerationProgress } from "@/components/vibe/GenerationProgress";
import { SavePlaylistDialog } from "@/components/vibe/SavePlaylistDialog";
import { SaveSuccess } from "@/components/vibe/SaveSuccess";
import { TrackList } from "@/components/vibe/TrackList";
import { useSearchParams } from "next/navigation";
import { VIBE_OPTIONS, type VibeKey } from "@/lib/vibes";
import { apiErrorMessage, retryDelayMs } from "@/lib/storage/playlist-draft";
import { usePlaylistDraft } from "@/components/vibe/usePlaylistDraft";
import { useSpotifyConnection } from "@/components/vibe/useSpotifyConnection";

type GenerateResponse = {
  warning?: string;
  tracks: Array<{
    id: string;
    name: string;
    artists: string[];
    albumImage: string | null;
    uri: string;
    preview_url: string | null;
  }>;
};
type GenerateStatus = "idle" | "loading" | "success" | "error";
type PlaylistVisibility = "private" | "public";

export default function Home() {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="shell page">
          <GenerationProgress />
        </main>
      }
    >
      <Generator />
    </Suspense>
  );
}

function Generator() {
  const params = useSearchParams();
  const connectionState = useSpotifyConnection();
  const { connection } = connectionState;
  const isConnected = connection?.connected ?? null;
  const hasPlaylistScopes = connection?.hasRequiredPlaylistScopes ?? false;
  const [query, setQuery] = useState(() => params.get("query") ?? "");
  const [selectedVibe, setSelectedVibe] = useState<VibeKey | null>(() => {
    const vibe = params.get("vibe");
    return VIBE_OPTIONS.some((option) => option.value === vibe)
      ? (vibe as VibeKey)
      : null;
  });
  const [limit, setLimit] = useState(() => {
    const raw = params.get("limit");
    const count = Number(raw);
    return raw && Number.isInteger(count) && count >= 1 && count <= 50
      ? count
      : 25;
  });
  const [authMessage] = useState(() => {
    const code = params.get("auth_error");
    return !code
      ? null
      : code === "access_denied"
        ? "Spotify connection was cancelled. Your mix and settings are preserved."
        : "Spotify connection could not be completed. Please try connecting again.";
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<GenerateStatus>("idle");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState(
    "Generated with VibePlay",
  );
  const [playlistVisibility, setPlaylistVisibility] =
    useState<PlaylistVisibility>("private");
  const {
    draft,
    tracks,
    replaceTracks,
    save,
    isSaving,
    saveError,
    saveResult: savedPlaylist,
    canSave,
  } = usePlaylistDraft<GenerateResponse["tracks"][number]>(
    "vibeplay_simple_draft_v1",
  );
  const saveMessage = saveError ?? draft?.attempt?.message ?? null;
  const retryAt = useRef(0);
  const generateInFlightRef = useRef<AbortController | null>(null);
  const resultsRef = useRef<HTMLElement>(null);
  const resultsHeadingRef = useRef<HTMLHeadingElement>(null);
  const returnParams = new URLSearchParams({
    query,
    limit: String(limit),
    ...(selectedVibe ? { vibe: selectedVibe } : {}),
  });
  const returnTo = `/generate?${returnParams.toString()}`;
  const reconnectUrl = `/api/auth/reconnect?returnTo=${encodeURIComponent(returnTo)}`;

  useEffect(() => () => generateInFlightRef.current?.abort(), []);
  useEffect(() => {
    window.history.replaceState(null, "", returnTo);
  }, [returnTo]);
  useEffect(() => {
    if (isGenerating && window.matchMedia("(max-width: 800px)").matches) {
      resultsRef.current?.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "auto"
          : "smooth",
        block: "start",
      });
    }
  }, [isGenerating]);
  useEffect(() => {
    if (status === "success")
      resultsHeadingRef.current?.focus({ preventScroll: true });
  }, [status]);

  const handleGeneratePlaylist = async () => {
    if (generateInFlightRef.current || isSaving) return;
    if (Date.now() < retryAt.current) {
      setMessage(
        `Spotify asked us to wait. Try again in ${Math.ceil((retryAt.current - Date.now()) / 1000)} seconds.`,
      );
      return;
    }
    const trimmedQuery = query.trim();
    if (!trimmedQuery && !selectedVibe) {
      setMessage("Please enter an artist or track, or choose a vibe.");
      return;
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
      setMessage("Choose a playlist length between 1 and 50 tracks.");
      return;
    }
    const controller = new AbortController();
    generateInFlightRef.current = controller;
    setIsGenerating(true);
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(90_000)]),
        body: JSON.stringify({
          query: trimmedQuery,
          limit,
          ...(selectedVibe ? { vibe: selectedVibe } : {}),
        }),
      });
      const data = (await response.json()) as GenerateResponse;
      if (controller.signal.aborted) return;
      if (!response.ok) {
        retryAt.current = Date.now() + retryDelayMs(data, response.headers);
        setMessage(
          apiErrorMessage(data, "Could not generate tracks. Please retry."),
        );
        setStatus("error");
        return;
      }
      if (!data.tracks.length) {
        setMessage(
          data.warning ??
            "No tracks found. Try another mood or artist; your previous mix is still available.",
        );
        setStatus("error");
        return;
      }
      replaceTracks(data.tracks);
      setMessage(data.warning ?? "Tracks generated successfully.");
      setStatus("success");
      setIsSaveModalOpen(false);
    } catch {
      if (!controller.signal.aborted) {
        setMessage(
          "Could not reach Spotify. Your previous mix is still available; please retry.",
        );
        setStatus("error");
      }
    } finally {
      if (generateInFlightRef.current === controller) {
        setIsGenerating(false);
        generateInFlightRef.current = null;
      }
    }
  };

  const handleOpenSaveModal = () => {
    if (!canSave) return;
    setPlaylistName(
      draft?.attempt?.payload.name ??
        (query.trim()
          ? `${query.trim()} • VibePlay`
          : "VibePlay Playlist"
        ).slice(0, 100),
    );
    setPlaylistDescription(
      draft?.attempt?.payload.description ?? "Generated with VibePlay",
    );
    setPlaylistVisibility(
      draft?.attempt?.payload.isPublic ? "public" : "private",
    );
    setIsSaveModalOpen(true);
  };
  const handleSavePlaylist = async () => {
    const result = await save({
      name: playlistName.trim(),
      description: playlistDescription.trim(),
      isPublic: playlistVisibility === "public",
    });
    if (result) setIsSaveModalOpen(false);
  };

  return (
    <main id="main-content" tabIndex={-1} className="shell page">
      <header className="page-heading">
        <span className="eyebrow">YOUR NEXT LISTEN STARTS HERE</span>
        <h1>Let’s find your frequency.</h1>
        <p>
          A mood, a favorite artist, a little curiosity. That’s all you need.
        </p>
      </header>
      <div className="workspace">
        <div>
          <ConnectionCard
            state={connectionState}
            returnTo={returnTo}
            busy={isSaving || isGenerating}
          />
          {authMessage && (
            <p className="notice" role="status">
              {authMessage}
            </p>
          )}
          <section className="panel" aria-labelledby="mix-settings">
            <div className="panel-heading">
              <h2 id="mix-settings" className="panel-title">
                Set the mood
              </h2>
              <span className="step-number">01 / THE INPUT</span>
            </div>
            <form
              className="generator-form"
              onSubmit={(event) => {
                event.preventDefault();
                if (isConnected) void handleGeneratePlaylist();
              }}
            >
              <fieldset>
                <legend>What are you feeling?</legend>
                <div className="mood-grid builder-moods">
                  {VIBE_OPTIONS.map((vibe) => (
                    <button
                      className="mood-card"
                      key={vibe.value}
                      type="button"
                      aria-label={vibe.label}
                      aria-pressed={selectedVibe === vibe.value}
                      onClick={() => setSelectedVibe(vibe.value)}
                    >
                      <MoodArtwork mood={vibe.value} />
                      <span className="mood-card-copy">
                        <strong>{vibe.label}</strong>
                        <small>{MOOD_NOTES[vibe.value]}</small>
                      </span>
                      {selectedVibe === vibe.value && (
                        <span className="mood-selected">
                          <Icon name="check" width="12" height="12" />
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="field">
                <label htmlFor="music-preference">
                  An artist or track you love{" "}
                  <span className="optional">optional</span>
                </label>
                <input
                  id="music-preference"
                  value={query}
                  maxLength={200}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Try an artist, or a song title…"
                  aria-describedby="preference-hint"
                />
                <p id="preference-hint" className="field-hint">
                  Artist names limit results to that artist. Song text matches
                  the catalog; it does not find similar-sounding music.
                </p>
              </div>
              <div className="length-field">
                <label htmlFor="playlist-length">How many tracks?</label>
                <div className="length-controls">
                  {[10, 25, 50].map((count) => (
                    <button
                      type="button"
                      className="chip"
                      key={count}
                      aria-pressed={limit === count}
                      onClick={() => setLimit(count)}
                    >
                      {count} tracks
                    </button>
                  ))}
                  <input
                    id="playlist-length"
                    aria-label="Custom track count"
                    type="number"
                    min={1}
                    max={50}
                    value={limit}
                    onChange={(event) => setLimit(Number(event.target.value))}
                  />
                </div>
                <p className="field-hint">
                  Choose 1–50 tracks. Available matches may vary.
                </p>
              </div>
              <div className="form-bottom">
                <button
                  className="button button-primary button-wide"
                  type="submit"
                  disabled={isGenerating || isSaving || isConnected !== true}
                >
                  {isGenerating ? (
                    <>
                      <span className="spinner" />
                      Finding your mix…
                    </>
                  ) : (
                    <>
                      <Icon name="spark" />
                      {status === "error"
                        ? "Try generating again"
                        : "Generate Playlist"}
                      <Icon name="arrow" />
                    </>
                  )}
                </button>
                <p className="field-hint">
                  {isConnected
                    ? "Review your tracks before anything is saved."
                    : "Connect Spotify above to start discovering."}
                </p>
              </div>
            </form>
          </section>
          <div className="studio-link">
            <span>Want a little more control?</span>
            <Link href="/vibe">
              Open mix studio <Icon name="sliders" width="16" height="16" />
            </Link>
          </div>
        </div>
        <section
          ref={resultsRef}
          aria-label="Your playlist"
          aria-busy={isGenerating}
        >
          {isGenerating && <GenerationProgress />}
          {message && !isGenerating && (
            <p
              className={`notice ${status === "error" ? "notice-error" : ""}`}
              role={status === "error" ? "alert" : "status"}
            >
              {message}
            </p>
          )}
          {savedPlaylist && <SaveSuccess result={savedPlaylist} />}
          {saveMessage && !isSaveModalOpen && (
            <div className="notice notice-error" role="alert">
              <p>{saveMessage}</p>
              {!hasPlaylistScopes && (
                <a className="inline-link" href={reconnectUrl}>
                  Reconnect Spotify
                </a>
              )}
            </div>
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
          {tracks.length ? (
            <div className="playlist-preview">
              <div className="playlist-intro">
                <div className="playlist-cover">
                  <MoodArtwork mood={selectedVibe ?? "chill"} />
                </div>
                <div>
                  <span className="eyebrow">02 / YOUR SOUNDTRACK</span>
                  <h2 ref={resultsHeadingRef} tabIndex={-1}>
                    {savedPlaylist?.playlistName ?? "Meet your next mix."}
                  </h2>
                  <p>{tracks.length} tracks · Selected from Spotify</p>
                </div>
              </div>
              <div className="playlist-toolbar">
                <button
                  className="text-button"
                  onClick={() => void handleGeneratePlaylist()}
                  disabled={isGenerating || isSaving || isConnected !== true}
                >
                  <span className="inline-flex items-center gap-2">
                    <Icon name="refresh" width="15" height="15" />
                    Regenerate
                  </span>
                </button>
                <button
                  className="button button-primary button-small"
                  onClick={(event) => {
                    // WebKit does not focus buttons on pointer activation.
                    event.currentTarget.focus();
                    handleOpenSaveModal();
                  }}
                  disabled={isSaving || isGenerating || !canSave}
                >
                  <SpotifyIcon />
                  {savedPlaylist
                    ? "Saved to Spotify"
                    : draft?.attempt?.status === "uncertain"
                      ? "Check Spotify library"
                      : draft?.attempt?.recovery
                        ? "Finish saving to Spotify"
                        : "Save to Spotify"}
                </button>
              </div>
              <TrackList tracks={tracks} />
              <div className="playlist-attribution">
                <span>Your mix. Your final say.</span>
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
          ) : (
            !isGenerating && (
              <div className="empty-mix">
                <div className="empty-disc" aria-hidden="true">
                  <span>
                    <Icon name="music" width="26" height="26" />
                  </span>
                </div>
                <h2>A good mix starts with you.</h2>
                <p>
                  Choose your mood and hit generate. Your next soundtrack will
                  show up here.
                </p>
                <span className="empty-tag">
                  LESS SEARCHING. MORE DISCOVERING.
                </span>
              </div>
            )
          )}
        </section>
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
          onSave={() => void handleSavePlaylist()}
          isSaving={isSaving}
          canSave={canSave}
          locked={Boolean(draft?.attempt && draft.attempt.status !== "failed")}
          error={saveMessage}
          reconnectUrl={reconnectUrl}
        />
      )}
    </main>
  );
}
