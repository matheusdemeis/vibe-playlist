"use client";

import { Icon } from "@/components/ui/Icon";

type DisplayTrack = {
  id: string;
  name: string;
  artists: string[];
  image?: string | null;
  albumImage?: string | null;
  explicit?: boolean;
};
type TrackListProps = {
  disabled?: boolean;
  canRemove?: boolean;
  tracks: DisplayTrack[];
  lockedTrackIds?: string[];
  onToggleLock?: (trackId: string) => void;
  onRemoveTrack?: (trackId: string) => void;
};

export function TrackList({
  disabled = false,
  canRemove = true,
  tracks,
  lockedTrackIds = [],
  onToggleLock,
  onRemoveTrack,
}: TrackListProps) {
  return (
    <ol className="track-list" aria-label="Playlist tracks">
      {tracks.map((track, index) => {
        const isLocked = lockedTrackIds.includes(track.id);
        const image = track.image ?? track.albumImage;
        return (
          <li key={track.id} className="track-row">
            <span className="track-number" aria-hidden="true">
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="track-art" aria-hidden="true">
              <Icon name="music" width="18" height="18" />
              {image && (
                // Spotify album art stays unmodified; native loading avoids a new image proxy dependency.
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={image}
                  alt=""
                  width={44}
                  height={44}
                  loading="lazy"
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
            </div>
            <div className="track-copy">
              <a
                href={`https://open.spotify.com/track/${track.id}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {track.name}
                <span className="sr-only"> — open in Spotify</span>
              </a>
              <p>
                {track.artists.join(", ")}
                {track.explicit && (
                  <span className="explicit-tag" aria-label="Explicit">
                    E
                  </span>
                )}
              </p>
            </div>
            {(onToggleLock || onRemoveTrack) && (
              <div className="track-controls">
                {onToggleLock && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-pressed={isLocked}
                    aria-label={`${isLocked ? "Unlock" : "Lock"} ${track.name}`}
                    title={isLocked ? "Unlock track" : "Keep on regeneration"}
                    disabled={disabled}
                    onClick={() => onToggleLock(track.id)}
                  >
                    <Icon name="lock" width="16" height="16" />
                  </button>
                )}
                {onRemoveTrack && (
                  <button
                    type="button"
                    className="icon-button"
                    aria-label={`Remove ${track.name}`}
                    title="Remove track"
                    disabled={disabled || !canRemove}
                    onClick={() => onRemoveTrack(track.id)}
                  >
                    <Icon name="close" width="16" height="16" />
                  </button>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
