import type { VibeBuilderInput } from "@/lib/vibe-builder";

const PRESETS_KEY = "vibe_builder_presets_v1";
const HISTORY_KEY = "vibe_builder_history_v1";
const HISTORY_LIMIT = 10;
const PRESET_LIMIT = 20;

export type Preset = {
  id: string;
  name: string;
  settings: VibeBuilderInput;
  createdAt: string;
};

export type HistoryTrack = {
  id: string;
  name: string;
  artists: string[];
  image: string | null;
  uri: string;
};

export type HistoryItem = {
  id: string;
  createdAt: string;
  settings: VibeBuilderInput;
  topTracks: HistoryTrack[];
  playlist: {
    id: string;
    url: string;
  } | null;
};

export type StorageLike = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

export function listPresets(storage = getBrowserStorage()): Preset[] {
  return readJson<unknown[]>(storage, PRESETS_KEY, []).filter(isPreset).slice(0, PRESET_LIMIT);
}

export function savePreset(name: string, settings: VibeBuilderInput, storage = getBrowserStorage()): Preset {
  const normalizedName = name.trim();
  if (!normalizedName) {
    throw new Error("Preset name is required.");
  }

  const presets = listPresets(storage);
  const existing = presets.filter((preset) => preset.name.toLowerCase() !== normalizedName.toLowerCase());
  const preset: Preset = {
    id: createId(),
    name: normalizedName,
    settings,
    createdAt: new Date().toISOString(),
  };

  const next = [preset, ...existing].slice(0, PRESET_LIMIT);
  writeJson(storage, PRESETS_KEY, next);
  return preset;
}

export function deletePreset(presetId: string, storage = getBrowserStorage()): void {
  const presets = listPresets(storage);
  writeJson(
    storage,
    PRESETS_KEY,
    presets.filter((preset) => preset.id !== presetId),
  );
}

export function listHistory(storage = getBrowserStorage()): HistoryItem[] {
  return readJson<unknown[]>(storage, HISTORY_KEY, []).filter(isHistoryItem).slice(0, HISTORY_LIMIT);
}

export function addHistoryItem(
  item: Omit<HistoryItem, "id" | "createdAt">,
  storage = getBrowserStorage(),
): HistoryItem {
  const history = listHistory(storage);
  const nextItem: HistoryItem = {
    id: createId(),
    createdAt: new Date().toISOString(),
    settings: item.settings,
    topTracks: item.topTracks,
    playlist: item.playlist,
  };

  const next = [nextItem, ...history].slice(0, HISTORY_LIMIT);
  writeJson(storage, HISTORY_KEY, next);
  return nextItem;
}

export function attachPlaylistToHistory(
  historyId: string,
  playlist: { id: string; url: string },
  storage = getBrowserStorage(),
): void {
  const history = listHistory(storage);
  writeJson(
    storage,
    HISTORY_KEY,
    history.map((item) => (item.id === historyId ? { ...item, playlist } : item)),
  );
}

function createId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `id_${Math.random().toString(36).slice(2, 10)}`;
}

function getBrowserStorage(): StorageLike {
  if (typeof window === "undefined") {
    return createNoopStorage();
  }

  try { return window.localStorage; } catch { return createNoopStorage(); }
}

function readJson<T>(storage: StorageLike, key: string, fallback: T): T {
  try {
    const value = storage.getItem(key);
    if (!value) return fallback;
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(storage: StorageLike, key: string, value: unknown): void {
  try { storage.setItem(key, JSON.stringify(value)); } catch {
    throw new Error("Could not save browser data. Check your storage settings.");
  }
}

function createNoopStorage(): StorageLike {
  return {
    getItem: () => null,
    setItem: () => { throw new Error("Browser storage is unavailable."); },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function isSettings(value: unknown): value is VibeBuilderInput {
  if (!isRecord(value)) return false;
  return [value.vibes, value.genres].every((items) => Array.isArray(items) && items.every((item) => typeof item === "string")) &&
    [value.energy, value.valence, value.trackCount].every((n) => typeof n === "number" && Number.isFinite(n)) &&
    ["Slow", "Medium", "Fast"].includes(String(value.tempo)) && typeof value.explicit === "boolean";
}
function isPreset(value: unknown): value is Preset {
  return isRecord(value) && typeof value.id === "string" && typeof value.name === "string" &&
    typeof value.createdAt === "string" && isSettings(value.settings);
}
function isHistoryItem(value: unknown): value is HistoryItem {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.createdAt !== "string" || !isSettings(value.settings) || !Array.isArray(value.topTracks)) return false;
  if (!value.topTracks.every((track) => isRecord(track) && typeof track.id === "string" && typeof track.name === "string" &&
    typeof track.uri === "string" && Array.isArray(track.artists) && track.artists.every((name) => typeof name === "string") &&
    (track.image === null || typeof track.image === "string"))) return false;
  return value.playlist === null || (isRecord(value.playlist) && typeof value.playlist.id === "string" &&
    typeof value.playlist.url === "string" && value.playlist.url.startsWith("https://open.spotify.com/playlist/"));
}
