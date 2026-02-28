import type { VibeBuilderInput } from "@/lib/vibe-builder";

const PRESETS_KEY = "vibe_builder_presets_v1";
const HISTORY_KEY = "vibe_builder_history_v1";
const HISTORY_LIMIT = 10;

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
  return readJson<Preset[]>(storage, PRESETS_KEY, []);
}

export function savePreset(name: string, settings: VibeBuilderInput, storage = getBrowserStorage()): Preset {
  const presets = listPresets(storage);
  const preset: Preset = {
    id: createId(),
    name: name.trim(),
    settings,
    createdAt: new Date().toISOString(),
  };

  const next = [preset, ...presets];
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
  return readJson<HistoryItem[]>(storage, HISTORY_KEY, []);
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

  return window.localStorage;
}

function readJson<T>(storage: StorageLike, key: string, fallback: T): T {
  const value = storage.getItem(key);
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function writeJson(storage: StorageLike, key: string, value: unknown): void {
  storage.setItem(key, JSON.stringify(value));
}

function createNoopStorage(): StorageLike {
  return {
    getItem: () => null,
    setItem: () => {},
  };
}
