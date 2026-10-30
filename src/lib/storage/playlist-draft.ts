export type SavePayload = {
  name: string;
  description: string;
  isPublic: boolean;
  trackUris: string[];
  draftId: string;
};

export type SavedPlaylist = {
  playlistName: string;
  playlistId: string;
  playlistUrl: string;
  isPublic: boolean | null;
  tracksAddedCount: number;
  tracksAdded: boolean;
  warning?: string;
  visibility: { requested: boolean; final: boolean | null };
};

export type SaveRecovery = { playlistId: string; playlistUrl: string; recoveryToken: string };
export type SaveAttempt = {
  status: "pending" | "uncertain" | "recovery" | "failed" | "saved";
  payload: SavePayload;
  message?: string;
  retryAt?: number;
  recovery?: SaveRecovery;
  result?: SavedPlaylist;
};
export type PlaylistDraft<T> = { id: string; tracks: T[]; attempt?: SaveAttempt };
export type DraftStorage = { getItem(key: string): string | null; setItem(key: string, value: string): void };

export function readDraft<T>(storage: DraftStorage, key: string): PlaylistDraft<T> | null {
  try {
    const value: unknown = JSON.parse(storage.getItem(key) ?? "null");
    if (!value || typeof value !== "object" || !("id" in value) || typeof value.id !== "string" || !("tracks" in value) || !Array.isArray(value.tracks)) return null;
    const draft = value as PlaylistDraft<T>;
    if (!/^[a-f0-9-]{36}$/i.test(draft.id) || !draft.tracks.every((track) => {
      const item = track as Record<string, unknown> | null;
      return item && typeof item === "object" && typeof item.uri === "string" && /^spotify:track:[A-Za-z0-9]{22}$/.test(item.uri) &&
        typeof item.id === "string" && typeof item.name === "string" && Array.isArray(item.artists) && item.artists.every((name) => typeof name === "string");
    })) return null;
    if (draft.attempt && !isSaveAttempt(draft.attempt)) return null;
    // A request interrupted by navigation may have reached Spotify. Never replay it blindly.
    if (draft.attempt?.status === "pending") {
      return { ...draft, attempt: { ...draft.attempt,
        status: draft.attempt.recovery ? "recovery" : "uncertain",
        message: draft.attempt.recovery
          ? "The last update was interrupted. Retry to check and finish the existing playlist."
          : "The last save was interrupted. Check your Spotify library before creating another mix.",
      } };
    }
    return draft;
  } catch {
    return null;
  }
}

export function writeDraft<T>(storage: DraftStorage, key: string, draft: PlaylistDraft<T>): boolean {
  try {
    storage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function canSaveAttempt(attempt?: SaveAttempt): boolean {
  return !attempt || attempt.status === "failed" || attempt.status === "recovery";
}

export function apiErrorMessage(data: unknown, fallback: string): string {
  if (!data || typeof data !== "object" || !("error" in data)) return fallback;
  if (typeof data.error === "string") return data.error;
  if (data.error && typeof data.error === "object" && "message" in data.error && typeof data.error.message === "string") return data.error.message;
  return fallback;
}

function isSaveAttempt(value: unknown): value is SaveAttempt {
  if (!value || typeof value !== "object") return false;
  const attempt = value as SaveAttempt;
  if (!["pending", "uncertain", "recovery", "failed", "saved"].includes(attempt.status)) return false;
  const payload = attempt.payload;
  if (!payload || typeof payload.name !== "string" || typeof payload.description !== "string" || typeof payload.isPublic !== "boolean" ||
    typeof payload.draftId !== "string" || !Array.isArray(payload.trackUris) || !payload.trackUris.every((uri) => typeof uri === "string" && /^spotify:track:[A-Za-z0-9]{22}$/.test(uri))) return false;
  if (attempt.recovery && (typeof attempt.recovery.playlistId !== "string" || typeof attempt.recovery.recoveryToken !== "string" || attempt.recovery.playlistUrl !== `https://open.spotify.com/playlist/${attempt.recovery.playlistId}`)) return false;
  if (attempt.status === "saved" && (!attempt.result || typeof attempt.result.playlistId !== "string" || attempt.result.playlistUrl !== `https://open.spotify.com/playlist/${attempt.result.playlistId}` || typeof attempt.result.tracksAddedCount !== "number")) return false;
  return true;
}

export function retryDelayMs(data: unknown, headers: Headers, now = Date.now()): number {
  const header = headers.get("retry-after");
  if (header) {
    const delay = /^\d+(?:\.\d+)?$/.test(header) ? Number(header) * 1000 : Date.parse(header) - now;
    if (Number.isFinite(delay)) return Math.max(0, delay);
  }
  if (data && typeof data === "object") {
    const body = data as { retryAfterSeconds?: unknown; error?: { retryAfterSeconds?: unknown } };
    const seconds = body.retryAfterSeconds ?? body.error?.retryAfterSeconds;
    if (typeof seconds === "number" && Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  }
  return 0;
}
