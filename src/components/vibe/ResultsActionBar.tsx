"use client";

type ResultsActionBarProps = {
  trackCount: number;
  isBusy: boolean;
  onRegenerate: () => void;
  onShuffle: () => void;
  onSave: () => void;
};

// Presentational only: keep Spotify API/network calls in server routes.
export function ResultsActionBar({
  trackCount,
  isBusy,
  onRegenerate,
  onShuffle,
  onSave,
}: ResultsActionBarProps) {
  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
      <p className="text-sm text-zinc-400">Generated {trackCount} tracks.</p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onRegenerate}
          disabled={isBusy}
          className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Regenerate
        </button>
        <button
          type="button"
          onClick={onShuffle}
          disabled={isBusy}
          className="rounded-full border border-zinc-700 bg-zinc-900 px-4 py-2 text-xs font-medium text-zinc-200 transition-colors hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Shuffle Order
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={isBusy}
          className="rounded-full bg-emerald-500 px-4 py-2 text-xs font-semibold text-zinc-950 transition-colors hover:bg-emerald-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isBusy ? "Please wait..." : "Save to Spotify"}
        </button>
      </div>
    </div>
  );
}
