import { describe, expect, it, vi } from "vitest";
import { searchCatalogTracks } from "./catalog";
import { selectCatalogTracks } from "../playlist/catalog-selection";
const track = (id: string, artist = id) => ({ id, name: `Song ${id}`, uri: `spotify:track:${id}`, artists: [{ id: artist, name: artist }], album: { name: "Album", images: [] }, preview_url: null, explicit: false });
const response = (items: unknown[], next: string | null = null) => Response.json({ tracks: { items, next } });

describe("bounded, balanced catalog collection", () => {
  it("represents all genre sources even when the first page exceeds playlist length", async () => {
    const fetcher = vi.fn(async (raw) => {
      const source = new URL(String(raw)).searchParams.get("q")!;
      return response(Array.from({ length: 10 }, (_, i) => track(`${source}${i}`)));
    }) as unknown as typeof fetch;
    const result = await searchCatalogTracks("test", { queries: ["a", "b", "c"], targetCount: 6, fetcher });
    expect(result.map((t) => t.id)).toEqual(["a0", "b0", "c0", "a1", "b1", "c1"]);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it("deduplicates recordings and same-title reissues while preserving named versions", async () => {
    const fetcher = vi.fn(async () => response([
      { ...track("a", "artist"), external_ids: { isrc: "recording" } },
      { ...track("b", "artist"), external_ids: { isrc: "RECORDING" } },
      { ...track("c", "artist"), name: "Song a" },
      { ...track("d", "artist"), name: "Song a - Live" },
      { ...track("e", "another"), name: "Song a" },
    ])) as unknown as typeof fetch;
    expect((await searchCatalogTracks("test", { queries: ["a"], targetCount: 10, fetcher })).map((t) => t.id)).toEqual(["a", "d", "e"]);
  });
  it("advances offsets past filtered pages and enforces the request budget", async () => {
    const offsets: number[] = [];
    const fetcher = vi.fn(async (raw) => {
      const offset = Number(new URL(String(raw)).searchParams.get("offset")); offsets.push(offset);
      return response(Array.from({ length: 10 }, (_, i) => ({ ...track(String(offset + i)), explicit: true })), "next");
    }) as unknown as typeof fetch;
    expect(await searchCatalogTracks("test", { queries: ["a"], targetCount: 10, includeExplicit: false, maxRequests: 2, fetcher })).toEqual([]);
    expect(offsets).toEqual([0, 10]);
  });
  it("filters reference artists by identity, not a shared display name", async () => {
    const fetcher = vi.fn(async () => response([track("a", "wanted"), track("b", "other")])) as unknown as typeof fetch;
    expect((await searchCatalogTracks("test", { queries: ["artist"], targetCount: 10, requiredArtistIdsByQuery: { artist: ["wanted"] }, fetcher })).map((t) => t.id)).toEqual(["a"]);
  });
  it("removes unavailable and restricted tracks", async () => {
    const fetcher = vi.fn(async () => response([{ ...track("a"), is_playable: false }, { ...track("b"), restrictions: { reason: "market" } }, track("c")])) as unknown as typeof fetch;
    expect((await searchCatalogTracks("test", { queries: ["a"], targetCount: 10, fetcher })).map((t) => t.id)).toEqual(["c"]);
  });
});

describe("deterministic artist diversity", () => {
  it("uses surplus candidates to replace repeats and separates adjacent artists", () => {
    const candidates = [track("a", "one"), track("b", "one"), track("c", "one"), track("d", "two"), track("e", "three")];
    const chosen = selectCatalogTracks(candidates, 4);
    expect(chosen.map((t) => t.id)).toEqual(["a", "d", "b", "e"]);
    expect(selectCatalogTracks(candidates, 4)).toEqual(chosen);
  });
  it("counts collaborators and relaxes the cap for narrow preferences", () => {
    const collaboration = { ...track("a", "one"), artists: [{ id: "one", name: "One" }, { id: "two", name: "Two" }] };
    expect(selectCatalogTracks([collaboration, track("b", "two"), track("c", "three")], 2, 1).map((t) => t.id)).toEqual(["a", "c"]);
    expect(selectCatalogTracks([track("a", "one"), track("b", "one"), track("c", "one")], 3, 1)).toHaveLength(3);
  });
});
