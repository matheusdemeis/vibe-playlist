"use client";

import { useEffect, useState } from "react";

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
};

type GenerateStatus = "idle" | "loading" | "success" | "error";

export default function Home() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(25);
  const [isGenerating, setIsGenerating] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [tracks, setTracks] = useState<GenerateResponse["tracks"]>([]);
  const [status, setStatus] = useState<GenerateStatus>("idle");

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
    const trimmedQuery = query.trim();
    if (!trimmedQuery) {
      setMessage("Please enter a search query.");
      setTracks([]);
      return;
    }

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
            placeholder="Enter artist or track (e.g. Drake)"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <input
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
    </div>
  );
}
