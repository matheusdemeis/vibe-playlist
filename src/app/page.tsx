"use client";

import { useEffect, useState } from "react";

type GenerateResponse = {
  playlistUrl: string;
  playlistId: string;
  trackCount: number;
};

type ErrorResponse = {
  error?: string;
};

export default function Home() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [artistName, setArtistName] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [playlist, setPlaylist] = useState<GenerateResponse | null>(null);

  useEffect(() => {
    const checkConnection = async () => {
      const response = await fetch("/api/me", { cache: "no-store" });
      if (!response.ok) {
        setIsConnected(false);
        return;
      }

      const data = (await response.json()) as { connected: boolean };
      setIsConnected(data.connected);
    };

    void checkConnection();
  }, []);

  const handleGeneratePlaylist = async () => {
    const trimmedArtist = artistName.trim();
    if (!trimmedArtist) {
      setMessage("Please enter an artist name.");
      setPlaylist(null);
      return;
    }

    setIsGenerating(true);
    setMessage(null);
    setPlaylist(null);

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ artistName: trimmedArtist }),
      });
      const data = (await response.json()) as GenerateResponse | ErrorResponse;

      if (!response.ok) {
        const errorMessage = "error" in data ? data.error : undefined;
        setMessage(errorMessage ?? "Could not generate playlist.");
        return;
      }

      setPlaylist(data as GenerateResponse);
      setMessage("Playlist created successfully.");
    } catch {
      setMessage("Unexpected error while generating playlist. Please try again.");
    } finally {
      setIsGenerating(false);
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
        <div className="flex w-full flex-col gap-3">
          <input
            className="w-full rounded-lg border border-zinc-300 px-4 py-3 text-zinc-900 outline-none focus:border-zinc-500"
            placeholder="Enter artist name"
            value={artistName}
            onChange={(event) => setArtistName(event.target.value)}
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
        {playlist ? (
          <p className="text-sm text-zinc-700">
            Playlist ready ({playlist.trackCount} tracks):{" "}
            <a
              className="font-medium text-zinc-900 underline"
              href={playlist.playlistUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open in Spotify
            </a>
          </p>
        ) : null}
      </main>
    </div>
  );
}
