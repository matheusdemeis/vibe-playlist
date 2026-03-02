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
  visibilityUpdated: boolean;
};

type GenerateStatus = "idle" | "loading" | "success" | "error";
type SaveStatus = "idle" | "saving" | "success" | "error";

export default function Home() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [spotifyScopes, setSpotifyScopes] = useState<string[]>([]);
  const [showReconnectPrompt, setShowReconnectPrompt] = useState(false);
  const [query, setQuery] = useState("");
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
        body: JSON.stringify({ query: trimmedQuery, limit }),
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
        result.visibilityUpdated
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <main className="flex w-full max-w-xl flex-col items-center gap-6 rounded-2xl bg-white p-10 text-center shadow-sm">
        <h1 className="text-3xl font-semibold text-zinc-900">Vibe Playlist</h1>
        <p className="text-zinc-600">
          Status:{" "}
          {isConnected === null ? "Checking..." : isConnected ? "Connected" : "Not connected"}
        </p>
        <a
          className="rounded-full bg-zinc-900 px-6 py-3 text-white transition-colors hover:bg-zinc-700"
          href="/api/auth/login"
        >
          Connect Spotify
        </a>
        {isConnected && !hasPlaylistScopes ? (
          <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4 text-left text-sm text-amber-800">
            <p className="font-medium">Spotify needs playlist permissions.</p>
            <p className="mt-1 text-amber-700">
              Reconnect to grant playlist-modify-private and playlist-modify-public.
            </p>
            <a
              href="/api/auth/reconnect"
              className="mt-2 inline-flex rounded-full bg-amber-700 px-4 py-2 text-xs font-medium text-white hover:bg-amber-600"
            >
              Reconnect Spotify
            </a>
          </div>
        ) : null}
        <div className="flex w-full flex-col gap-3">
          <input
            aria-label="Search query"
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
            placeholder="Enter artist or track (e.g. Drake)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <input
            aria-label="Track limit"
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
            type="number"
            min={1}
            max={50}
            value={limit}
            onChange={(event) => setLimit(Number(event.target.value))}
          />
          <button
            className="rounded-full bg-zinc-900 px-6 py-3 text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-400"
            type="button"
            onClick={handleGeneratePlaylist}
            disabled={isGenerating || isConnected !== true}
          >
            {isGenerating ? "Generating..." : "Generate Playlist"}
          </button>
        </div>
        {message ? <p className="text-sm text-zinc-700">{message}</p> : null}
        {status === "success" && tracks.length > 0 ? (
          <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left text-sm text-emerald-800">
            <p className="font-medium">Tracks generated successfully.</p>
            <p>{tracks.length} tracks were found from Spotify Search.</p>
            <button
              type="button"
              onClick={handleOpenSaveModal}
              disabled={saveStatus === "saving"}
              className="mt-3 rounded-full bg-zinc-900 px-4 py-2 text-xs font-medium text-white hover:bg-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-500"
            >
              Save to Spotify
            </button>
          </div>
        ) : null}
        {saveStatus === "success" && savedPlaylist ? (
          <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-left text-sm text-emerald-800">
            <p className="font-medium">{playlistName.trim() || "Playlist"} saved to Spotify.</p>
            <p className="mt-1 text-xs text-emerald-700">
              Tracks added: {savedPlaylist.tracksAddedCount}
            </p>
            <p className="mt-1 text-xs text-emerald-700">
              Visibility updated: {savedPlaylist.visibilityUpdated ? "Yes" : "No"}
            </p>
            <a
              href={savedPlaylist.playlistUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex rounded-full bg-emerald-700 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-600"
            >
              Open in Spotify
            </a>
          </div>
        ) : null}
        {saveStatus === "error" && saveMessage ? (
          <div className="w-full rounded-xl border border-red-200 bg-red-50 p-3 text-left text-sm text-red-700">
            <p>{saveMessage}</p>
            {showReconnectPrompt ? (
              <a
                href="/api/auth/reconnect"
                className="mt-2 inline-flex rounded-full bg-red-700 px-4 py-2 text-xs font-medium text-white hover:bg-red-600"
              >
                Reconnect Spotify
              </a>
            ) : null}
          </div>
        ) : null}
        {tracks.length > 0 ? (
          <ul className="w-full space-y-2 text-left">
            {tracks.map((track) => (
              <li key={track.id} className="flex items-center gap-3 rounded-xl border border-zinc-200 p-3">
                {track.albumImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={track.albumImage}
                    alt={track.name}
                    className="h-10 w-10 rounded-md object-cover"
                  />
                ) : (
                  <div className="h-10 w-10 rounded-md bg-zinc-100" />
                )}
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-900">{track.name}</p>
                  <p className="truncate text-xs text-zinc-600">{track.artists.join(", ")}</p>
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
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/30 p-4 sm:items-center"
        >
          <div className="w-full max-w-lg space-y-4 rounded-2xl bg-white p-5 shadow-xl sm:p-6">
            <div className="space-y-1">
              <h2 id="save-modal-title" className="text-lg font-semibold text-zinc-900">
                Save to Spotify
              </h2>
              <p id="save-modal-description" className="text-sm text-zinc-600">
                Review playlist details and create a playlist in your account.
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
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
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
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-500"
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
                disabled={saveStatus === "saving"}
                className="rounded-full border border-zinc-300 px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleSavePlaylist()}
                disabled={saveStatus === "saving"}
                className="rounded-full bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {saveStatus === "saving" ? "Saving..." : "Save Playlist"}
              </button>
            </div>

            {saveMessage ? <p className="text-sm text-zinc-600">{saveMessage}</p> : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
