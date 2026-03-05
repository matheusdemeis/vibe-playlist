"use client";

import type { PlaylistGenerationResponse } from "@/lib/playlist/generate";

type TrackListProps = {
  tracks: PlaylistGenerationResponse["tracks"];
  lockedTrackIds: string[];
  onToggleLock: (trackId: string) => void;
  onRemoveTrack: (trackId: string) => void;
};

// Presentational only: keep Spotify API/network calls in server routes.
export function TrackList({ tracks, lockedTrackIds, onToggleLock, onRemoveTrack }: TrackListProps) {
  return (
    <ul className="space-y-2" aria-live="polite">
      {tracks.map((track) => {
        const isLocked = lockedTrackIds.includes(track.id);

        return (
          <li
            key={track.id}
            className="flex flex-col gap-3 rounded-2xl border border-zinc-800 bg-zinc-900/70 p-3 sm:flex-row sm:items-center"
          >
            {track.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={track.image}
                alt={`${track.album} cover`}
                className="h-12 w-12 rounded-lg object-cover"
              />
            ) : (
              <div className="h-12 w-12 rounded-lg bg-zinc-800" />
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-zinc-100">{track.name}</p>
              <p className="truncate text-xs text-zinc-400">{track.artists.join(", ")}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {track.explicit ? (
                  <span className="rounded-full bg-zinc-700 px-2 py-0.5 text-[10px] font-medium text-zinc-200">
                    Explicit
                  </span>
                ) : null}
                {track.preview_url ? (
                  <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                    Has Preview
                  </span>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onToggleLock(track.id)}
              aria-pressed={isLocked}
              className={`rounded-full border px-3 py-1.5 text-xs transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 ${
                isLocked
                  ? "border-emerald-300 bg-emerald-500/20 text-emerald-200"
                  : "border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {isLocked ? "Locked" : "Lock"}
            </button>
            <button
              type="button"
              onClick={() => onRemoveTrack(track.id)}
              className="rounded-full border border-zinc-700 px-3 py-1.5 text-xs text-zinc-300 transition-colors hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
            >
              Remove
            </button>
          </li>
        );
      })}
    </ul>
  );
}
