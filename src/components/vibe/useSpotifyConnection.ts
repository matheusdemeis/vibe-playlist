"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage, retryDelayMs } from "@/lib/storage/playlist-draft";

type SpotifyConnection = { connected: boolean; grantedScopes: string[]; hasRequiredPlaylistScopes: boolean };
export function useSpotifyConnection() {
  const [connection, setConnection] = useState<SpotifyConnection | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const active = useRef<AbortController | null>(null);
  const retryAt = useRef(0);
  const check = useCallback(async () => {
    if (retryAt.current > Date.now()) {
      setError(`Spotify asked us to wait. Try again in ${Math.ceil((retryAt.current - Date.now()) / 1000)} seconds.`);
      return;
    }
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setChecking(true);
    setError(null);
    try {
      const response = await fetch("/api/spotify/status", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(30_000)]) });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) {
        retryAt.current = Date.now() + retryDelayMs(data, response.headers);
        setError(apiErrorMessage(data, "Could not check Spotify connection. Please retry."));
        return;
      }
      setConnection(data as SpotifyConnection);
    } catch {
      if (!controller.signal.aborted) setError("Could not check Spotify connection. Please retry.");
    } finally { if (!controller.signal.aborted) setChecking(false); }
  }, []);
  useEffect(() => { void check(); return () => active.current?.abort(); }, [check]);
  const disconnect = useCallback(async () => {
    active.current?.abort();
    setChecking(true);
    setError(null);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST", signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error("Disconnect failed");
      setConnection({ connected: false, grantedScopes: [], hasRequiredPlaylistScopes: false });
    } catch { setError("Could not disconnect. Please retry."); }
    finally { setChecking(false); }
  }, []);
  return { connection, error, checking, check, disconnect };
}
