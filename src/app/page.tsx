  "use client";

import { useEffect, useRef, useState } from "react";

type GenerateResponse = {
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
  playlistId: string;
  playlistUrl: string;
  tracksAddedCount: number;
  tracksAdded: boolean;
  visibility: {
    requested: boolean;
    final: boolean | null;
  };
};

type GenerateStatus = "idle" | "loading" | "success" | "error";
type SaveStatus = "idle" | "saving" | "success" | "error";
const VIBE_OPTIONS = ["Chill", "Gym", "Beach", "Night Drive", "Party", "Snowboarding"] as const;

export default function Home() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [spotifyScopes, setSpotifyScopes] = useState<string[]>([]);
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedVibe, setSelectedVibe] = useState<(typeof VIBE_OPTIONS)[number] | null>(null);
  const [limit, setLimit] = useState(25);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tracks, setTracks] = useState<GenerateResponse["tracks"]>([]);
  const [status, setStatus] = useState<GenerateStatus>("idle");
  const [isSaveModalOpen, setIsSaveModalOpen] = useState(false);
  const [playlistName, setPlaylistName] = useState("");
  const [playlistDescription, setPlaylistDescription] = useState("Generated with Vibe Playlist");
  const [isPublicPlaylist, setIsPublicPlaylist] = useState(false);
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
    if (!trimmedQuery) {
      setMessage("Please enter a search query.");
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

      setTracks((data as GenerateResponse).tracks);
      setMessage("Tracks generated successfully.");
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
    setIsPublicPlaylist(false);
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

    try {
      const response = await fetch("/api/vibe/save", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          description: playlistDescription.trim(),
          isPublic: isPublicPlaylist === true,
          trackUris: tracks.map((track) => track.uri),
        }),
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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#12100c] px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-amber-500/20 blur-3xl"
      />
      <main className="relative flex w-full max-w-2xl flex-col gap-6 rounded-3xl border border-zinc-800/90 bg-zinc-950/90 p-6 text-left shadow-2xl shadow-black/50 sm:p-10">
        <div className="space-y-2 text-center">
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-50">Vibe Playlist</h1>
          <p className="text-sm text-zinc-400">Warm, fast playlist generation for Spotify.</p>
        </div>
        <p className="rounded-full border border-zinc-800 bg-zinc-900 px-4 py-2 text-center text-sm text-zinc-300">
          Status:{" "}
          {isConnected === null ? "Checking..." : isConnected ? "Connected" : "Not connected"}
        </p>
        <a
          className="mx-auto inline-flex rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400"
          href="/api/auth/login"
        >
          Connect Spotify
        </a>
        {isConnected && !hasPlaylistScopes ? (
          <div className="w-full rounded-2xl border border-amber-300/30 bg-amber-500/10 p-4 text-sm text-amber-200">
            <p className="font-medium">Spotify needs playlist permissions.</p>
            <p className="mt-1 text-amber-100/80">
              Reconnect to grant playlist-modify-private and playlist-modify-public.
            </p>
            <a
              href="/api/auth/reconnect"
              className="mt-2 inline-flex rounded-full bg-amber-400 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-amber-300"
            >
              Reconnect Spotify
            </a>
          </div>
        ) : null}
        <div className="flex w-full flex-col gap-4">
          <section className="rounded-2xl border border-amber-300/20 bg-gradient-to-br from-amber-400/10 via-orange-300/5 to-transparent p-4 sm:p-5">
            <div className="space-y-1">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-amber-100">
                Choose your vibe
              </h2>
              <p className="text-xs text-zinc-300">Pick one mood to guide your next playlist.</p>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Choose your vibe">
              {VIBE_OPTIONS.map((vibe) => {
                const isActive = selectedVibe === vibe;

                return (
                  <button
                    key={vibe}
                    type="button"
                    aria-pressed={isActive}
                    onClick={() => setSelectedVibe(vibe)}
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 ${
                      isActive
                        ? "border-amber-300 bg-amber-200/90 text-zinc-900"
                        : "border-zinc-700 bg-zinc-900/70 text-zinc-200 hover:border-zinc-500 hover:bg-zinc-800"
                    }`}
                  >
                    {vibe}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-sm text-zinc-200">
              Selected vibe:{" "}
              <span className="font-semibold text-amber-200">
                {selectedVibe ?? "None"}
              </span>
            </p>
          </section>
          <input
            aria-label="Search query"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition-colors placeholder:text-zinc-500 focus:border-emerald-400"
            placeholder="Enter artist or track (e.g. Drake)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <input
            aria-label="Track limit"
            className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-zinc-100 outline-none transition-colors focus:border-emerald-400"
            type="number"
            min={1}
            max={50}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
          <button
            className="rounded-full bg-emerald-500 px-6 py-3 text-sm font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
            type="button"
            onClick={handleGeneratePlaylist}
            disabled={isGenerating || isConnected !== true}
          >
            {isGenerating ? "Generating..." : "Generate Playlist"}
          </button>
        </div>
        {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
        {status === "success" && tracks.length > 0 ? (
          <div className="w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <p className="font-medium">Tracks generated successfully.</p>
            <p>{tracks.length} tracks were found from Spotify Search.</p>
            <button
              type="button"
              onClick={handleOpenSaveModal}
              disabled={saveStatus === "saving"}
              className="mt-3 rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300"
            >
              Save to Spotify
            </button>
          </div>
        ) : null}
        {saveStatus === "success" && savedPlaylist ? (
          <div className="w-full rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4 text-sm text-emerald-100">
            <p className="font-medium">{playlistName.trim() || "Playlist"} saved to Spotify.</p>
            <p className="mt-1 text-xs text-emerald-200">
              Tracks added: {savedPlaylist.tracksAddedCount}
            </p>
            <p className="mt-1 text-xs text-emerald-200">
              Visibility:{" "}
              {savedPlaylist.visibility.final === null
                ? "Unknown"
                : savedPlaylist.visibility.final
                  ? "Public"
                  : "Private"}
            </p>
            <a
              href={savedPlaylist.playlistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex rounded-full bg-zinc-950 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-black focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
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
                className="mt-2 inline-flex rounded-full bg-red-400 px-4 py-2 text-xs font-semibold text-zinc-900 hover:bg-red-300"
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
                className="flex items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/80 p-3"
              >
                {track.albumImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.albumImage}
                    alt={track.name}
                    className="h-10 w-10 rounded-md object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-md bg-zinc-800" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-100">{track.name}</p>
                  <p className="truncate text-xs text-zinc-400">{track.artists.join(", ")}</p>
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
          <div className="w-full max-w-lg space-y-4 rounded-3xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl sm:p-6">
            <div className="space-y-1">
              <h2 id="save-modal-title" className="text-lg font-semibold text-zinc-100">
                Save to Spotify
              </h2>
              <p id="save-modal-description" className="text-sm text-zinc-400">
                Review playlist details and create a playlist in your account.
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
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400"
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
                className="w-full rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400"
              />
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-300">
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
                disabled={saveStatus === "saving"}
                className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSavePlaylist()}
                disabled={saveStatus === "saving"}
                className="rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
              >
                {saveStatus === "saving" ? "Saving..." : "Save Playlist"}
              </button>
            </div>

            {saveMessage ? <p className="text-sm text-zinc-300">{saveMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
