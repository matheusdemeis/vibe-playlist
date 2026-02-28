"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [isConnected, setIsConnected] = useState<boolean | null>(null);

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
      </main>
    </div>
  );
}
