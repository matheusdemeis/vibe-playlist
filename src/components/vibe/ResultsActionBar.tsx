"use client";

import { Icon, SpotifyIcon } from "@/components/ui/Icon";

type ResultsActionBarProps = {
  trackCount: number;
  isBusy: boolean;
  canSave?: boolean;
  canEdit?: boolean;
  saveLabel?: string;
  onRegenerate: () => void;
  onShuffle: () => void;
  onSave: () => void;
};

export function ResultsActionBar({
  trackCount,
  isBusy,
  canSave = true,
  canEdit = true,
  saveLabel = "Save to Spotify",
  onRegenerate,
  onShuffle,
  onSave,
}: ResultsActionBarProps) {
  return (
    <div className="playlist-toolbar">
      <p>{trackCount} tracks in your mix</p>
      <div className="toolbar-buttons">
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={onRegenerate}
          disabled={isBusy}
        >
          <Icon name="refresh" width="16" height="16" />
          Regenerate
        </button>
        <button
          className="button button-secondary button-small"
          type="button"
          onClick={onShuffle}
          disabled={isBusy || !canEdit}
        >
          <Icon name="shuffle" width="16" height="16" />
          Shuffle Order
        </button>
        <button
          className="button button-primary button-small"
          type="button"
          onClick={(event) => {
            // Let the dialog restore focus to its launcher in WebKit too.
            event.currentTarget.focus();
            onSave();
          }}
          disabled={isBusy || !canSave || trackCount === 0}
        >
          <SpotifyIcon />
          {isBusy ? "Please wait…" : saveLabel}
        </button>
      </div>
    </div>
  );
}
