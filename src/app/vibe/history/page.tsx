"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { listHistory, type HistoryItem } from "@/lib/storage/vibe-data";

export default function VibeHistoryPage() {
  const [history] = useState<HistoryItem[]>(() => (typeof window === "undefined" ? [] : listHistory()));

  const entries = useMemo(() => history, [history]);

  return (
    <main className="rounded-2xl bg-white p-5 shadow-sm sm:p-8">
      <header className="mb-6 space-y-2">
        <h1 className="text-2xl font-semibold text-zinc-900 sm:text-3xl">Generation History</h1>
        <p className="text-sm text-zinc-600 sm:text-base">
          Your last 10 generations, including saved playlist links when available.
        </p>
      </header>

      {entries.length === 0 ? (
        <p className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm text-zinc-600">
          No history yet. Generate a vibe first.
        </p>
      ) : (
        <ul className="space-y-3">
          {entries.map((entry) => (
            <li key={entry.id} className="space-y-3 rounded-xl border border-zinc-200 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-medium text-zinc-900">
                    {entry.settings.vibes[0] ?? "Custom"} · {entry.settings.energy} energy
                  </p>
                  <p className="text-xs text-zinc-600">
                    {new Date(entry.createdAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Link
                    href={`/vibe?${buildSettingsQuery(entry)}`}
                    className="inline-flex rounded-full border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
                  >
                    Reuse Settings
                  </Link>
                  {entry.playlist ? (
                    <a
                      href={entry.playlist.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex rounded-full bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                    >
                      Open Playlist
                    </a>
                  ) : (
                    <span className="inline-flex items-center text-xs text-zinc-500">Not saved</span>
                  )}
                </div>
              </div>

              <div className="space-y-1">
                <p className="text-xs font-medium uppercase tracking-wide text-zinc-500">Top Tracks</p>
                <ul className="space-y-1">
                  {entry.topTracks.map((track) => (
                    <li key={track.id} className="text-sm text-zinc-700">
                      {track.name} - {track.artists.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-5">
        <Link
          href="/vibe"
          className="inline-flex rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
        >
          Back to Builder
        </Link>
      </div>
    </main>
  );
}

function buildSettingsQuery(entry: HistoryItem): string {
  const params = new URLSearchParams();
  if (entry.settings.vibes.length > 0) {
    params.set("vibes", entry.settings.vibes.join(","));
  }
  if (entry.settings.genres.length > 0) {
    params.set("genres", entry.settings.genres.join(","));
  }
  params.set("energy", String(entry.settings.energy));
  params.set("valence", String(entry.settings.valence));
  params.set("tempo", entry.settings.tempo);
  params.set("trackCount", String(entry.settings.trackCount));
  params.set("explicit", String(entry.settings.explicit));

  return params.toString();
}
