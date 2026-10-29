"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiErrorMessage, canSaveAttempt, readDraft, retryDelayMs, writeDraft, type PlaylistDraft, type SavedPlaylist, type SavePayload, type SaveRecovery } from "@/lib/storage/playlist-draft";

export function usePlaylistDraft<T extends { uri: string }>(storageKey: string) {
  const [draft, setDraft] = useState<PlaylistDraft<T> | null>(null);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const current = useRef<PlaylistDraft<T> | null>(null);
  const inFlight = useRef(false);

  useEffect(() => {
    let restored: PlaylistDraft<T> | null = null;
    try { restored = readDraft<T>(window.localStorage, storageKey); } catch { /* Storage may be disabled. */ }
    current.current = restored;
    // Browser-only storage is unavailable during SSR. Hydrate once per storage key.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDraft(restored);
    setHydratedKey(storageKey);
    setSaveError(null);
  }, [storageKey]);

  const commit = useCallback((next: PlaylistDraft<T>, requirePersistence = false) => {
    let persisted = false;
    try { persisted = writeDraft(window.localStorage, storageKey, next); } catch { /* Storage may be disabled. */ }
    if (requirePersistence && !persisted) return false;
    current.current = next;
    setDraft(next);
    return true;
  }, [storageKey]);

  const replaceTracks = useCallback((tracks: T[]) => {
    if (inFlight.current) return;
    commit({ id: crypto.randomUUID(), tracks });
    setSaveError(null);
  }, [commit]);

  const editTracks = useCallback((update: (tracks: T[]) => T[]) => {
    const existing = current.current;
    if (!existing || inFlight.current || (existing.attempt && existing.attempt.status !== "failed")) return;
    commit({ ...existing, attempt: undefined, tracks: update(existing.tracks) });
  }, [commit]);

  const save = useCallback(async (details: Omit<SavePayload, "trackUris" | "draftId">): Promise<SavedPlaylist | null> => {
    if (inFlight.current || !current.current || !canSaveAttempt(current.current.attempt)) return null;
    inFlight.current = true;
    setIsSaving(true);
    setSaveError(null);

    const performSave = async () => {
      let snapshot = current.current;
      if (!snapshot) return null;
      // Re-read under the browser lock so another tab's receipt wins over stale UI state.
      try {
        const stored = readDraft<T>(window.localStorage, storageKey);
        if (stored?.id === snapshot.id && stored.attempt) {
          snapshot = stored;
          current.current = stored;
          setDraft(stored);
        }
      } catch { /* Persistence is checked before the request. */ }
      if (!canSaveAttempt(snapshot.attempt)) return null;
      if (snapshot.attempt?.retryAt && snapshot.attempt.retryAt > Date.now()) {
        setSaveError(`Spotify asked us to wait. Try again in ${Math.ceil((snapshot.attempt.retryAt - Date.now()) / 1000)} seconds.`);
        return null;
      }
      const payload = (snapshot.attempt?.status !== "failed" ? snapshot.attempt?.payload : undefined) ?? { ...details, trackUris: snapshot.tracks.map((track) => track.uri), draftId: snapshot.id };
      if (!payload.name.trim() || payload.trackUris.length === 0) {
        setSaveError("Add tracks and a playlist name before saving.");
        return null;
      }
      const recovery = snapshot.attempt?.recovery;
      const pending: PlaylistDraft<T> = { ...snapshot, attempt: { status: "pending", payload, recovery } };
      if (!commit(pending, true)) {
        setSaveError("Your browser could not store a save receipt. Enable site storage before saving. No playlist was created.");
        return null;
      }
      try {
        const response = await fetch("/api/vibe/save", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...payload, ...(recovery ? { recoveryToken: recovery.recoveryToken } : {}) }),
          signal: AbortSignal.timeout(90_000),
        });
        const data = await response.json() as SavedPlaylist & { error?: unknown; retrySafe?: boolean; retryAfterSeconds?: number; recovery?: SaveRecovery };
        if (!response.ok) {
          const message = apiErrorMessage(data, "Spotify could not finish saving this playlist.");
          const retryDelay = retryDelayMs(data, response.headers);
          commit({ ...snapshot, attempt: { payload, recovery: data.recovery ?? recovery, status: data.recovery || recovery ? "recovery" : data.retrySafe === true ? "failed" : "uncertain", message, retryAt: retryDelay ? Date.now() + retryDelay : undefined } });
          setSaveError(message);
          return null;
        }
        if (typeof data.playlistId !== "string" || !/^[A-Za-z0-9]{22}$/.test(data.playlistId) ||
          data.playlistUrl !== `https://open.spotify.com/playlist/${data.playlistId}` || typeof data.tracksAddedCount !== "number") throw new Error("Invalid save response");
        commit({ ...snapshot, attempt: { status: "saved", payload, result: data } });
        return data;
      } catch {
        const message = recovery ? "We could not confirm the update. Retry to check and finish the existing playlist." : "We could not confirm whether Spotify created the playlist. Check your Spotify library; this draft will not be submitted again.";
        commit({ ...snapshot, attempt: { status: recovery ? "recovery" : "uncertain", payload, recovery, message } });
        setSaveError(message);
        return null;
      }
    };

    try {
      return navigator.locks ? await navigator.locks.request(`vibeplay-save-${current.current.id}`, performSave) : await performSave();
    } finally {
      inFlight.current = false;
      setIsSaving(false);
    }
  }, [commit, storageKey]);

  return { draft, hydrated: hydratedKey === storageKey, tracks: draft?.tracks ?? [], replaceTracks, editTracks, save, isSaving, saveError, saveResult: draft?.attempt?.result ?? null, canSave: canSaveAttempt(draft?.attempt) };
}
