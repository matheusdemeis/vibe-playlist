import { Icon, SpotifyIcon } from "@/components/ui/Icon";
import type { SavedPlaylist } from "@/lib/storage/playlist-draft";

export function SaveSuccess({ result }: { result: SavedPlaylist }) {
  return (
    <section
      className="save-success"
      aria-label="Playlist saved"
      data-save-confirmation
      tabIndex={-1}
    >
      <span className="success-icon">
        <Icon name="check" />
      </span>
      <div>
        <p role="status" className="success-title">
          Your mix has a new home.
        </p>
        <p>
          <strong>{result.playlistName}</strong> · {result.tracksAddedCount}{" "}
          tracks ·{" "}
          {result.isPublic === null
            ? "Visibility unconfirmed"
            : result.isPublic
              ? "Public"
              : "Private"}
        </p>
      </div>
      <a
        className="button button-small button-secondary"
        href={result.playlistUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        <SpotifyIcon />
        Open in Spotify
        <Icon name="external" width="15" height="15" />
      </a>
    </section>
  );
}
