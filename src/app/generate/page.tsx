"use client";

import { useEffect, useRef, useState } from "react";
import { VIBE_OPTIONS, type VibeKey } from "@/lib/vibes";

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

type ErrorResponse = {
  error?:
    | string
    | {
        message?: string;
        status?: number;
        details?: unknown;
      };
  code?: string;
  details?: Record<string, unknown>;
};

type SavePlaylistResponse = {
  playlistName: string;
  playlistId: string;
  playlistUrl: string;
  isPublic: boolean | null;
  tracksAddedCount: number;
  tracksAdded: boolean;
  visibility: {
    requested: boolean;
    final: boolean | null;
  };
};

type GenerateStatus = "idle" | "loading" | "success" | "error";
type SaveStatus = "idle" | "saving" | "success" | "error";
type PlaylistVisibility = "private" | "public";

export default function Home() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [spotifyScopes, setSpotifyScopes] = useState<string[]>([]);
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedVibe, setSelectedVibe] = useState<VibeKey | null>(null);
  const [limit, setLimit] = useState(25);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tracks, setTracks] = useState<GenerateResponse["tracks"]>([]);
  const [status, setStatus] = useState<GenerateStatus>("idle");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("Generated with Vibe Playlist");
  const [playlistVisibility, setPlaylistVisibility] = useState<PlaylistVisibility>("private");
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [savedPlaylist, setSavedPlaylist] = useState<SavePlaylistResponse | null>(null);
  const generateInFlightRef = useRef(false);
  const saveInFlightRef = useRef(false);

  useEffect(() => {
    const checkConnection = async () => {
      const [meResponse, statusResponse] = await Promise.all([
        fetch("/api/me", { cache: "no-store" }),
        fetch("/api/spotify/status", { cache: "no-store" }),
      ]);

      if (!meResponse.ok) {
        setIsConnected(false);
      } else {
        const data = (await meResponse.json()) as { connected: boolean };
        setIsConnected(data.connected);
      }

      if (statusResponse.ok) {
        const data = (await statusResponse.json()) as { grantedScopes?: string[] };
        setSpotifyScopes(Array.isArray(data.grantedScopes) ? data.grantedScopes : []);
      } else {
        setSpotifyScopes([]);
      }
    };

    void checkConnection();
  }, []);

  const hasPlaylistScopes =
    spotifyScopes.includes("playlist-modify-private") &&
    spotifyScopes.includes("playlist-modify-public");

  const handleGeneratePlaylist = async () => {
    if (generateInFlightRef.current || isGenerating) {
      return;
    }
    const trimmedQuery = query.trim();
    if (!trimmedQuery && !selectedVibe) {
      setMessage("Please enter a search query or choose a vibe.");
      setTracks([]);
      return;
    }

    generateInFlightRef.current = true;
    setIsGenerating(true);
    setStatus("loading");
    setMessage(null);
    setTracks([]);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query: trimmedQuery,
          limit,
          ...(selectedVibe ? { vibe: selectedVibe } : {}),
        }),
      });
      const data = (await response.json()) as GenerateResponse | ErrorResponse;

      if (!response.ok) {
        const errorValue = "error" in data ? data.error : undefined;
        const errorMessage =
          typeof errorValue === "string"
            ? errorValue
            : errorValue?.message ?? "Could not generate tracks.";
        setMessage(errorMessage);
        setStatus("error");
        return;
      }

      const responseData = data as GenerateResponse;
      setTracks(responseData.tracks);
      if (responseData.warning) {
        setMessage(responseData.warning);
      } else if (responseData.tracks.length === 0) {
        setMessage("We couldn't build that mix right now. Try another vibe or artist.");
      } else {
        setMessage("Tracks generated successfully.");
      }
      setStatus("success");
    } catch {
      setMessage("Unexpected error while generating tracks. Please try again.");
      setStatus("error");
    } finally {
      setIsGenerating(false);
      generateInFlightRef.current = false;
    }
  };

  const handleOpenSaveModal = () => {
    const fallbackName = "Vibe Playlist";
    const trimmedQuery = query.trim();
    setPlaylistName(trimmedQuery ? `${trimmedQuery} • Vibe Playlist` : fallbackName);
    setPlaylistDescription("Generated with Vibe Playlist");
    setPlaylistVisibility("private");
    setSaveStatus("idle");
    setSaveMessage(null);
    setIsSaveModalOpen(true);
  };

  const handleSavePlaylist = async () => {
    if (saveInFlightRef.current || saveStatus === "saving") {
      return;
    }
    const name = playlistName.trim();
    if (!name) {
      setSaveStatus("error");
      setSaveMessage("Playlist name is required.");
      return;
    }

    saveInFlightRef.current = true;
    setSaveStatus("saving");
    setSaveMessage("Saving playlist to Spotify...");
    const savePayload = {
      name,
      description: playlistDescription.trim(),
      isPublic: playlistVisibility === "public",
      trackUris: tracks.map((track) => track.uri),
    };

    try {
      if (process.env.NODE_ENV !== "production") {
        console.log("[generate] save payload visibility", {
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

      const data = (await response.json()) as SavePlaylistResponse | ErrorResponse;
      if (!response.ok) {
        const errorValue = "error" in data ? data.error : undefined;
        const errorMessage =
          typeof errorValue === "string"
            ? errorValue
            : errorValue?.message ?? "Could not save playlist.";
        if ("code" in data && data.code === "spotify_playlist_visibility_mismatch") {
          const requested = data.details?.requestedPublic;
          const actual = data.details?.actualPublic;
          setSaveMessage(
            `Playlist visibility mismatch (requested: ${String(requested)}, actual: ${String(actual)}).`,
          );
          setSaveStatus("error");
          return;
        }
        if ("code" in data && data.code === "missing_scopes") {
          setShowReconnectPrompt(true);
        }
        setSaveStatus("error");
        setSaveMessage(errorMessage);
        return;
      }

      const result = data as SavePlaylistResponse;
      if (process.env.NODE_ENV !== "production") {
        console.log("[generate] save response visibility", {
          playlistId: result.playlistId,
          isPublic: result.isPublic,
        });
      }
      setSavedPlaylist(result);
      setSaveStatus("success");
      setSaveMessage(
        result.visibility.final !== null
          ? "Playlist saved successfully."
          : "Playlist saved and tracks added. Visibility update did not apply.",
      );
      setIsSaveModalOpen(false);
    } catch {
      setSaveStatus("error");
      setSaveMessage("Unexpected error while saving playlist.");
    } finally {
      saveInFlightRef.current = false;
    }
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
          {isConnected === null ? "Checking..." : isConnected ? "Connected" : "Not connected"}
        </p>
        <a
          className="mx-auto inline-flex rounded-full bg-[var(--brand-action)] px-6 py-3 text-sm font-semibold text-[var(--brand-bg)] transition-colors hover:bg-[var(--brand-action-hover)]"
          href="/api/auth/login"
        >
          Connect Spotify
        </a>
        {isConnected && !hasPlaylistScopes ? (
          <div className="w-full rounded-2xl border border-[var(--brand-info)]/30 bg-[var(--brand-info)]/10 p-4 text-sm text-[#bfdbfe]">
            <p className="font-medium">Spotify needs playlist permissions.</p>
            <p className="mt-1 text-[#dbeafe]/85">
              Reconnect to grant playlist-modify-private and playlist-modify-public.
            </p>
            <a
              href="/api/auth/reconnect"
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
            disabled={isGenerating || isConnected !== true}
          >
            {isGenerating ? "Generating..." : "Generate Playlist"}
          </button>
        </div>
        {message ? <p className="text-sm text-[var(--text-secondary)]">{message}</p> : null}
        {status === "success" && tracks.length > 0 ? (
          <div className="w-full rounded-2xl border border-[var(--brand-focus)]/30 bg-[var(--brand-focus)]/10 p-4 text-sm text-[#d1fae5]">
            <p className="font-medium">Tracks generated successfully.</p>
            <p>{tracks.length} tracks were found from Spotify.</p>
            <button
              type="button"
              onClick={handleOpenSaveModal}
              disabled={saveStatus === "saving"}
              className="mt-3 rounded-full bg-[var(--brand-action)] px-4 py-2 text-xs font-semibold text-[var(--brand-bg)] hover:bg-[var(--brand-action-hover)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-focus)]"
            >
              Save to Spotify
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
            {showReconnectPrompt ? (
              <a
                href="/api/auth/reconnect"
                className="mt-2 inline-flex rounded-full bg-red-400 px-4 py-2 text-xs font-semibold text-[var(--brand-bg)] hover:bg-red-300"
              >
                Reconnect Spotify
              </a>
            ) : null}
          </div>
        ) : null}
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
                Save to Spotify
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
                value={playlistDescription}
                onChange={(event) => setPlaylistDescription(event.target.value)}
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-[var(--surface-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--brand-focus)]"
              />
            </div>

            <fieldset className="space-y-2">
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
                disabled={saveStatus === "saving"}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-[var(--text-secondary)] hover:bg-[var(--surface-elevated-hover)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSavePlaylist()}
                disabled={saveStatus === "saving"}
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
