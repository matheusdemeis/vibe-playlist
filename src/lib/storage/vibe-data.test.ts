import { describe, expect, it } from "vitest";
import { DEFAULT_VIBE_INPUT } from "../vibe-builder";
import {
  addHistoryItem,
  attachPlaylistToHistory,
  deletePreset,
  listHistory,
  listPresets,
  savePreset,
  type StorageLike,
} from "./vibe-data";

class MemoryStorage implements StorageLike {
  private store = new Map<string, string>();

  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
}

describe("vibe storage helpers", () => {
  it("saves and deletes presets", () => {
    const storage = new MemoryStorage();
    const preset = savePreset("Morning Focus", DEFAULT_VIBE_INPUT, storage);

    expect(listPresets(storage)).toHaveLength(1);
    expect(listPresets(storage)[0]?.name).toBe("Morning Focus");

    deletePreset(preset.id, storage);
    expect(listPresets(storage)).toEqual([]);
  });

  it("keeps only 10 history entries", () => {
    const storage = new MemoryStorage();

    for (let index = 0; index < 12; index += 1) {
      addHistoryItem(
        {
          settings: DEFAULT_VIBE_INPUT,
          topTracks: [
            {
              id: `track-${index}`,
              name: `Track ${index}`,
              artists: ["Artist"],
              image: null,
              uri: `spotify:track:${index}`,
            },
          ],
          playlist: null,
        },
        storage,
      );
    }

    const history = listHistory(storage);
    expect(history).toHaveLength(10);
    expect(history[0]?.topTracks[0]?.id).toBe("track-11");
    expect(history[9]?.topTracks[0]?.id).toBe("track-2");
  });

  it("attaches playlist metadata to a history item", () => {
    const storage = new MemoryStorage();
    const entry = addHistoryItem(
      {
        settings: DEFAULT_VIBE_INPUT,
        topTracks: [
          { id: "1", name: "Track", artists: ["Artist"], image: null, uri: "spotify:track:1" },
        ],
        playlist: null,
      },
      storage,
    );

    attachPlaylistToHistory(entry.id, { id: "playlist-123", url: "https://open.spotify.com/..." }, storage);
    expect(listHistory(storage)[0]?.playlist?.id).toBe("playlist-123");
  });
});
