"use client";

import { Icon, SpotifyIcon } from "@/components/ui/Icon";
import { useSpotifyConnection } from "./useSpotifyConnection";

export function ConnectionCard({
  state,
  returnTo,
  busy = false,
}: {
  state: ReturnType<typeof useSpotifyConnection>;
  returnTo: string;
  busy?: boolean;
}) {
  const { connection, checking, error, check, disconnect } = state;
  const connected = connection?.connected;
  const needsScopes = connected && !connection.hasRequiredPlaylistScopes;
  const pending = checking || (!connection && !error);
  const loginUrl = `/api/auth/${needsScopes ? "reconnect" : "login"}?returnTo=${encodeURIComponent(returnTo)}`;
  return (
    <section
      className={`connection-card ${connected && !error ? "is-connected" : ""}`}
      aria-label="Spotify connection"
    >
      <div className="connection-icon">
        <SpotifyIcon />
      </div>
      <div className="connection-copy">
        <p className="connection-title" role="status">
          {pending
            ? "Checking Spotify…"
            : error
              ? "Connection needs attention"
              : needsScopes
                ? "One more permission"
                : connected
                  ? "Spotify connected"
                  : "Bring your Spotify along"}
          {connected && !error && !pending && (
            <Icon name="check" width="16" height="16" />
          )}
        </p>
        <p>
          {needsScopes
            ? "Reconnect to save and verify your playlists."
            : connected
              ? connection.account?.displayName || "Ready when you are."
              : "Connect to discover tracks and save your mix."}
        </p>
      </div>
      {error ? (
        <button
          className="button button-small button-secondary"
          disabled={pending || busy}
          onClick={() => void check()}
        >
          Retry connection
        </button>
      ) : pending ? (
        <span className="spinner" aria-hidden="true" />
      ) : connected && !needsScopes ? (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => void disconnect()}
        >
          Disconnect<span className="sr-only"> Spotify</span>
        </button>
      ) : (
        <a className="button button-small button-secondary" href={loginUrl}>
          {needsScopes ? "Reconnect Spotify" : "Connect Spotify"}
          <Icon name="arrow" width="16" height="16" />
        </a>
      )}
      {error && (
        <p className="connection-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

export function SpotifyConnection({
  returnTo,
  busy,
}: {
  returnTo: string;
  busy?: boolean;
}) {
  const state = useSpotifyConnection();
  return <ConnectionCard state={state} returnTo={returnTo} busy={busy} />;
}
