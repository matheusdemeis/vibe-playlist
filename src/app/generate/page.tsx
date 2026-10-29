"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { VIBE_OPTIONS, type VibeKey } from "@/lib/vibes";
import { apiErrorMessage, retryDelayMs } from "@/lib/storage/playlist-draft";
import { usePlaylistDraft } from "@/components/vibe/usePlaylistDraft";
import { useSpotifyConnection } from "@/components/vibe/useSpotifyConnection";

type GenerateResponse = {
  warning?: string;
  tracks: Array<{ id: string; name: string; artists: string[]; albumImage: string | null; uri: string; preview_url: string | null }>;
};
type GenerateStatus = "idle" | "loading" | "success" | "error";
type PlaylistVisibility = "private" | "public";

export default function Home() {
  return <Suspense fallback={null}><Generator /></Suspense>;
}

function Generator() {
  const params = useSearchParams();
  const { connection, error: connectionError, checking, check, disconnect } = useSpotifyConnection();
  const isConnected = connection?.connected ?? null;
  const hasPlaylistScopes = connection?.hasRequiredPlaylistScopes ?? false;
  const [query, setQuery] = useState(() => params.get("query") ?? "");
  const [selectedVibe, setSelectedVibe] = useState<VibeKey | null>(() => {
    const vibe = params.get("vibe");
    return VIBE_OPTIONS.some((option) => option.value === vibe) ? vibe as VibeKey : null;
  });
  const [limit, setLimit] = useState(() => {
    const raw = params.get("limit");
    const count = Number(raw);
    return raw && Number.isInteger(count) && count >= 1 && count <= 50 ? count : 25;
  });
  const [authMessage] = useState(() => {
    const code = params.get("auth_error");
    return !code ? null : code === "access_denied"
      ? "Spotify connection was cancelled. Your mix and settings are preserved."
      : "Spotify connection could not be completed. Please try connecting again.";
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [status, setStatus] = useState<GenerateStatus>("idle");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("Generated with VibePlay");
  const [playlistVisibility, setPlaylistVisibility] = useState<PlaylistVisibility>("private");
  const { draft, tracks, replaceTracks, save, isSaving, saveError, saveResult: savedPlaylist, canSave } = usePlaylistDraft<GenerateResponse["tracks"][number]>("vibeplay_simple_draft_v1");
  const saveStatus = isSaving ? "saving" : savedPlaylist ? "success" : saveError || draft?.attempt?.message ? "error" : "idle";
  const saveMessage = saveError ?? draft?.attempt?.message ?? null;
  const retryAt = useRef(0);
  const generateInFlightRef = useRef<AbortController | null>(null);
  const returnParams = new URLSearchParams({ query, limit: String(limit), ...(selectedVibe ? { vibe: selectedVibe } : {}) });
  const returnTo = `/generate?${returnParams.toString()}`;
  const loginUrl = `/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`;
  const reconnectUrl = `/api/auth/reconnect?returnTo=${encodeURIComponent(returnTo)}`;

  useEffect(() => () => generateInFlightRef.current?.abort(), []);
  useEffect(() => {
    window.history.replaceState(null, "", returnTo);
  }, [returnTo]);

  const handleGeneratePlaylist = async () => {
    if (generateInFlightRef.current || isSaving) return;
    if (Date.now() < retryAt.current) { setMessage(`Spotify asked us to wait. Try again in ${Math.ceil((retryAt.current - Date.now()) / 1000)} seconds.`); return; }
    const trimmedQuery = query.trim();
    if (!trimmedQuery && !selectedVibe) { setMessage("Please enter an artist or track, or choose a vibe."); return; }
    if (!Number.isInteger(limit) || limit < 1 || limit > 50) { setMessage("Choose a playlist length between 1 and 50 tracks."); return; }
    const controller = new AbortController();
    generateInFlightRef.current = controller;
    setIsGenerating(true);
    setStatus("loading");
    setMessage(null);
    try {
      const response = await fetch("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, signal: controller.signal, body: JSON.stringify({ query: trimmedQuery, limit, ...(selectedVibe ? { vibe: selectedVibe } : {}) }) });
      const data = await response.json() as GenerateResponse;
      if (controller.signal.aborted) return;
      if (!response.ok) { retryAt.current = Date.now() + retryDelayMs(data, response.headers); setMessage(apiErrorMessage(data, "Could not generate tracks. Please retry.")); setStatus("error"); return; }
      if (!data.tracks.length) { setMessage(data.warning ?? "No tracks found. Try another mood or artist; your previous mix is still available."); setStatus("error"); return; }
      replaceTracks(data.tracks);
      setMessage(data.warning ?? "Tracks generated successfully.");
      setStatus("success");
      setIsSaveModalOpen(false);
    } catch {
      if (!controller.signal.aborted) { setMessage("Could not reach Spotify. Your previous mix is still available; please retry."); setStatus("error"); }
    } finally {
      if (generateInFlightRef.current === controller) { setIsGenerating(false); generateInFlightRef.current = null; }
    }
  };

  const handleOpenSaveModal = () => {
    if (!canSave) return;
    setPlaylistName(draft?.attempt?.payload.name ?? (query.trim() ? `${query.trim()} • VibePlay` : "VibePlay Playlist"));
    setPlaylistDescription(draft?.attempt?.payload.description ?? "Generated with VibePlay");
    setPlaylistVisibility(draft?.attempt?.payload.isPublic ? "public" : "private");
    setIsSaveModalOpen(true);
  };
  const handleSavePlaylist = async () => {
    const result = await save({ name: playlistName.trim(), description: playlistDescription.trim(), isPublic: playlistVisibility === "public" });
    if (result) setIsSaveModalOpen(false);
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--brand-bg)] px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-[var(--brand-glow)]"
      />
      <main className="relative flex w-full max-w-2xl flex-col gap-6 rounded-3xl border border-white/10 bg-[var(--card-bg)] p-6 text-left shadow-2xl shadow-black/50 sm:p-10">
        <div className="space-y-2 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-[var(--text-primary)]">Vibe Playlist</h1>
          <p className="text-sm text-[var(--text-secondary)]">Warm, fast playlist generation for Spotify.</p>
        </div>
        <p className="rounded-full border border-white/10 bg-[var(--surface-elevated)] px-4 py-2 text-center text-sm text-[var(--text-secondary)]">
          Status:{" "}
          {checking ? "Checking..." : connectionError ? "Connection check failed" : isConnected ? "Connected" : "Not connected"}
        </p>
        {authMessage ? <p role="status" className="text-sm text-amber-200">{authMessage}</p> : null}
        {connectionError ? <div role="alert" className="text-sm text-amber-200"><p>{connectionError}</p><button className="mt-2 underline" type="button" disabled={checking} onClick={() => void check()}>Retry connection</button></div> : null}
        {isConnected ? <button type="button" disabled={checking || isSaving} onClick={() => void disconnect()} className="text-sm text-[var(--text-secondary)] underline">Disconnect Spotify</button> : null}
        <a
          className="mx-auto inline-flex rounded-full bg-[var(--brand-action)] px-6 py-3 text-sm font-semibold text-[var(--brand-bg)] transition-colors hover:bg-[var(--brand-action-hover)]"
          href={loginUrl}
        >
          Connect Spotify
        </a>
        {isConnected && !hasPlaylistScopes ? (
          <div className="w-full rounded-2xl border border-[var(--brand-info)]/30 bg-[var(--brand-info)]/10 p-4 text-sm text-[#bfdbfe]">
            <p className="font-medium">Spotify needs playlist permissions.</p>
            <p className="mt-1 text-[#dbeafe]/85">
              Reconnect to grant permission to create playlists and verify saved tracks.
            </p>
            <a
              href={reconnectUrl}
              className="mt-2 inline-flex rounded-full bg-[var(--brand-info)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--brand-info-hover)]"
            >
              Reconnect Spotify
            </a>
          </div>
        ) : null}
        <div className="flex w-full flex-col gap-4">
          <section className="rounded-2xl border border-white/10 bg-[image:var(--gradient-soft)] p-4 sm:p-5">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--text-primary)]">
                Choose your vibe
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">Pick one mood to guide your next playlist.</p>
            </div>
            <div
              className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3"
              role="group"
              aria-label="Choose your vibe"
            >
              {VIBE_OPTIONS.map((vibe) => {
                const isActive = selectedVibe === vibe.value;

                return (
                  <button
                    key={vibe.value}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setSelectedVibe(vibe.value)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-focus)] ${
                      isActive
                        ? "border-transparent bg-[linear-gradient(135deg,#A8E063,#56CC9D,#2F80ED)] text-[var(--text-primary)]"
                        : "border-white/10 bg-[var(--surface-elevated)] text-[var(--text-secondary)] hover:border-[var(--brand-focus)]/60 hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {vibe.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-sm text-[var(--text-primary)]">
              Selected vibe:{" "}
              <span className="font-semibold text-[var(--brand-focus)]">
                {VIBE_OPTIONS.find((option) => option.value === selectedVibe)?.label ?? "None"}
              </span>
            </p>
          </section>
          <input
            aria-label="Search query"
            className="w-full rounded-xl border border-white/10 bg-[var(--surface-elevated)] px-4 py-3 text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-secondary)] focus:border-[var(--brand-focus)]"
            placeholder="Enter artist or track (e.g. Drake)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <input
            aria-label="Track limit"
            className="w-full rounded-xl border border-white/10 bg-[var(--surface-elevated)] px-4 py-3 text-[var(--text-primary)] outline-none transition-colors focus:border-[var(--brand-focus)]"
            type="number"
            min={1}
            max={50}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
          <button
            className="rounded-full bg-[var(--brand-action)] px-6 py-3 text-sm font-semibold text-[var(--brand-bg)] transition-colors hover:bg-[var(--brand-action-hover)] disabled:cursor-not-allowed disabled:bg-[#2a2a31] disabled:text-[var(--text-secondary)]"
            type="button"
            onClick={handleGeneratePlaylist}
            disabled={isGenerating || isSaving || isConnected !== true}
          >
            {isGenerating ? "Generating..." : status === "error" ? "Try generating again" : "Generate Playlist"}
          </button>
        </div>
        {message ? <p role="status" className="text-sm text-[var(--text-secondary)]">{message}</p> : null}
        {tracks.length > 0 ? (
          <div className="w-full rounded-2xl border border-[var(--brand-focus)]/30 bg-[var(--brand-focus)]/10 p-4 text-sm text-[#d1fae5]">
            <p className="font-medium">Tracks generated successfully.</p>
            <p>{tracks.length} tracks were found from Spotify.</p>
            <button
              type="button"
              onClick={handleOpenSaveModal}
              disabled={isSaving || isGenerating || !canSave}
              className="mt-3 rounded-full bg-[var(--brand-action)] px-4 py-2 text-xs font-semibold text-[var(--brand-bg)] hover:bg-[var(--brand-action-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-focus)]"
            >
              {savedPlaylist ? "Saved to Spotify" : draft?.attempt?.status === "uncertain" ? "Check Spotify library" : draft?.attempt?.recovery ? "Finish saving to Spotify" : "Save to Spotify"}
            </button>
          </div>
        ) : null}
        {saveStatus === "success" && savedPlaylist ? (
          <div className="w-full rounded-2xl border border-[var(--brand-focus)]/30 bg-[var(--brand-focus)]/10 p-4 text-sm text-[#d1fae5]">
            <p className="font-medium">{savedPlaylist.playlistName || "Playlist"} saved to Spotify.</p>
            <p className="mt-1 text-xs text-[#a7f3d0]">
              Tracks added: {savedPlaylist.tracksAddedCount}
            </p>
            <p className="mt-1 text-xs text-[#a7f3d0]">
              Visibility:{" "}
              {savedPlaylist.isPublic === null
                ? "Unknown"
                : savedPlaylist.isPublic
                  ? "Public"
                  : "Private"}
            </p>
            <a
              href={savedPlaylist.playlistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex rounded-full bg-[var(--surface-elevated)] px-4 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-elevated-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-focus)]"
            >
              Open in Spotify
            </a>
          </div>
        ) : null}
        {saveStatus === "error" && saveMessage ? (
          <div className="w-full rounded-2xl border border-red-300/30 bg-red-500/10 p-3 text-sm text-red-200">
            <p>{saveMessage}</p>
            {!hasPlaylistScopes ? (
              <a
                href={reconnectUrl}
                className="mt-2 inline-flex rounded-full bg-red-400 px-4 py-2 text-xs font-semibold text-[var(--brand-bg)] hover:bg-red-300"
              >
                Reconnect Spotify
              </a>
            ) : null}
          </div>
        ) : null}
        {draft?.attempt?.status === "uncertain" ? <a className="text-sm text-emerald-300 underline" href="https://open.spotify.com/collection/playlists" target="_blank" rel="noopener noreferrer">Check your Spotify library</a> : null}
        {draft?.attempt?.recovery ? <a className="text-sm text-emerald-300 underline" href={draft.attempt.recovery.playlistUrl} target="_blank" rel="noopener noreferrer">Open the existing playlist</a> : null}
        {tracks.length > 0 ? (
          <ul className="w-full space-y-2 text-left">
            {tracks.map((track) => (
              <li
                key={track.id}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-[var(--surface-elevated)] p-3"
              >
                {track.albumImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.albumImage}
                    alt={track.name}
                    className="h-10 w-10 rounded-md object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-md bg-[var(--surface-elevated-hover)]" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">{track.name}</p>
                  <p className="truncate text-xs text-[var(--text-secondary)]">{track.artists.join(", ")}</p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </main>

      {isSaveModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-modal-title"
          aria-describedby="save-modal-description"
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/60 p-4 sm:items-center"
        >
          <div className="w-full max-w-lg space-y-4 rounded-3xl border border-white/10 bg-[var(--card-bg)] p-5 shadow-2xl sm:p-6">
            <div className="space-y-1">
              <h2 id="save-modal-title" className="text-lg font-semibold text-[var(--text-primary)]">
                {savedPlaylist ? "Saved to Spotify" : draft?.attempt?.status === "uncertain" ? "Check Spotify library" : draft?.attempt?.recovery ? "Finish saving to Spotify" : "Save to Spotify"}
              </h2>
              <p id="save-modal-description" className="text-sm text-[var(--text-secondary)]">
                Review playlist details and create a playlist in your account.
              </p>
            </div>

            <div className="space-y-2">
              <label htmlFor="playlist-name" className="text-sm font-medium text-[var(--text-primary)]">
                Playlist name
              </label>
              <input
                id="playlist-name"
                disabled={Boolean(draft?.attempt && draft.attempt.status !== "failed")}
                maxLength={100}
                value={playlistName}
                onChange={(event) => setPlaylistName(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-focus)]"
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="playlist-description" className="text-sm font-medium text-[var(--text-primary)]">
                Description
              </label>
              <textarea
                id="playlist-description"
                disabled={Boolean(draft?.attempt && draft.attempt.status !== "failed")}
                maxLength={300}
                value={playlistDescription}
                onChange={(event) => setPlaylistDescription(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-focus)]"
              />
            </div>

            <fieldset disabled={Boolean(draft?.attempt && draft.attempt.status !== "failed")} className="space-y-2">
              <legend className="text-sm font-medium text-[var(--text-primary)]">
                Playlist visibility
              </legend>
              <div className="inline-flex rounded-xl border border-white/10 bg-[var(--surface-elevated)] p-1">
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="playlist-visibility-generate"
                    value="private"
                    checked={playlistVisibility === "private"}
                    onChange={() => setPlaylistVisibility("private")}
                    className="sr-only"
                  />
                  <span
                    className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-medium ${
                      playlistVisibility === "private"
                        ? "bg-[var(--brand-action)] text-[var(--brand-bg)]"
                        : "text-[var(--text-secondary)]"
                    }`}
                  >
                    Private
                  </span>
                </label>
                <label className="cursor-pointer">
                  <input
                    type="radio"
                    name="playlist-visibility-generate"
                    value="public"
                    checked={playlistVisibility === "public"}
                    onChange={() => setPlaylistVisibility("public")}
                    className="sr-only"
                  />
                  <span
                    className={`inline-flex rounded-lg px-3 py-1.5 text-xs font-medium ${
                      playlistVisibility === "public"
                        ? "bg-[var(--brand-action)] text-[var(--brand-bg)]"
                        : "text-[var(--text-secondary)]"
                    }`}
                  >
                    Public
                  </span>
                </label>
              </div>
              <p className="text-xs text-[var(--text-secondary)]">
                Private playlists are only visible to you.
              </p>
            </fieldset>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsSaveModalOpen(false)}
                disabled={isSaving}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-elevated-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSavePlaylist()}
                disabled={isSaving || isGenerating || !canSave}
                className="rounded-full bg-[var(--brand-action)] px-4 py-2 text-sm font-semibold text-[var(--brand-bg)] hover:bg-[var(--brand-action-hover)] disabled:cursor-not-allowed disabled:bg-[#2a2a31] disabled:text-[var(--text-secondary)]"
              >
                {saveStatus === "saving" ? "Saving..." : "Save Playlist"}
              </button>
            </div>

            {saveMessage ? <p className="text-sm text-[var(--text-secondary)]">{saveMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
