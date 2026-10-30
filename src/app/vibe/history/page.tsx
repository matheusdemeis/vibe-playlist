"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/Icon";
import { MoodArtwork } from "@/components/MoodArtwork";
import { normalizeVibeKey } from "@/lib/vibes";
import { listHistory, type HistoryItem } from "@/lib/storage/vibe-data";

export default function VibeHistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Browser history is loaded after SSR, avoiding different server/client markup.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHistory(listHistory());
    setHydrated(true);
  }, []);

  return (
    <main id="main-content" tabIndex={-1} className="shell page">
      <header className="page-heading page-heading-row">
        <div>
          <span className="eyebrow">GOOD MIXES DESERVE AN ENCORE</span>
          <h1>Back to a good feeling.</h1>
          <p>Your last 10 mix studio generations, kept in this browser.</p>
        </div>
        <Link className="button button-secondary" href="/vibe">
          Create a new mix <Icon name="arrow" />
        </Link>
      </header>
      {!hydrated ? (
        <p className="notice" role="status">
          Finding your recent mixes…
        </p>
      ) : history.length ? (
        <ul className="history-grid">
          {history.map((entry) => (
            <li className="history-card" key={entry.id}>
              <div className="history-card-head">
                <div className="history-art">
                  <MoodArtwork
                    mood={normalizeVibeKey(entry.settings.vibes[0]) ?? "chill"}
                  />
                </div>
                <div>
                  <h2>{entry.settings.vibes[0] ?? "Custom"} mix</h2>
                  <time dateTime={entry.createdAt}>
                    {new Date(entry.createdAt).toLocaleDateString(undefined, {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </time>
                  <p className="field-hint">
                    {entry.playlist
                      ? "Saved to Spotify"
                      : "Previewed in VibePlay"}
                  </p>
                </div>
              </div>
              <span className="eyebrow">A FEW FROM THE MIX</span>
              <ol className="history-tracks">
                {entry.topTracks.map((track, index) => (
                  <li key={track.id}>
                    <span aria-hidden="true">
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <p>
                      <a
                        href={`https://open.spotify.com/track/${track.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {track.name}
                      </a>
                      <small>{track.artists.join(", ")}</small>
                    </p>
                  </li>
                ))}
              </ol>
              <div className="history-actions">
                <Link
                  className="button button-secondary button-small"
                  href={`/vibe?${buildSettingsQuery(entry)}`}
                >
                  Reuse Settings <Icon name="refresh" width="14" height="14" />
                </Link>
                {entry.playlist && (
                  <a
                    className="button button-primary button-small"
                    href={entry.playlist.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open Playlist{" "}
                    <Icon name="external" width="14" height="14" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <section className="empty-history">
          <Icon name="clock" width="32" height="32" />
          <h2>Your first mix is waiting.</h2>
          <p>
            Head to the mix studio and try a combination. Your recent
            generations will appear here.
          </p>
          <Link className="button button-primary" href="/vibe">
            Explore mix studio <Icon name="arrow" />
          </Link>
        </section>
      )}
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
