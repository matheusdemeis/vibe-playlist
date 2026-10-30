import { describe, expect, it, vi } from "vitest";
import { generatePlaylistTracks } from "./generate";
const reference = (id: string) => ({ id, name: `Reference ${id}`, uri: `spotify:track:${id}`, artists: [{ id: `artist-${id}`, name: `Artist ${id}` }], album: { name: "Album", images: [] } });
const input = { seedGenres: ["jazz", "pop", "rock", "ambient", "dance"], referenceTrackIds: ["one", "two", "three", "four", "five"], targetEnergy: 50, targetValence: 50, trackCount: 10 };
it("represents every reference artist within the ten-query budget and checks identity", async () => {
  const queries: string[] = [];
  const fetcher = vi.fn(async (raw) => {
    const url = new URL(String(raw));
    if (url.pathname.startsWith("/v1/tracks/")) return Response.json(reference(url.pathname.split("/").at(-1)!));
    expect(url.pathname).toBe("/v1/search");
    const query = url.searchParams.get("q")!; queries.push(query);
    // Same-looking result with a different identity must not become a recommendation.
    return Response.json({ tracks: { items: [reference("unrelated")], next: null } });
  }) as unknown as typeof fetch;
  const result = await generatePlaylistTracks("test", input, fetcher);
  expect(result.tracks).toEqual([]);
  expect(queries).toHaveLength(10);
  for (const id of input.referenceTrackIds) expect(queries.some((query) => query.includes(`artist:"Artist ${id}"`))).toBe(true);
  expect(result.metadata.queries).toEqual(queries);
  expect(result.metadata.usedSeeds.seed_genres).toEqual(["jazz", "pop"]);
  expect(result.warning).toContain("not applied");
});
it("keeps explicit genres represented when several moods consume the genre budget", async () => {
  const fetcher = vi.fn(async () => Response.json({ tracks: { items: [], next: null } })) as unknown as typeof fetch;
  const result = await generatePlaylistTracks("test", { ...input, referenceTrackIds: [], vibes: ["Chill", "Gym", "Beach", "Night Drive", "Party", "Snowboarding"], seedGenres: ["classical"] }, fetcher);
  expect(result.metadata.queries).toContain('genre:"classical"');
  expect(result.metadata.queries).toContain('genre:"indie"');
  expect(result.metadata.queries).toHaveLength(10);
});

describe("catalog budgets", () => {
  it("stops at twenty search pages even when no usable candidate survives", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      return Response.json({ tracks: { items: Array.from({ length: 10 }, (_, i) => ({ ...reference(String(i)), explicit: true })), next: "next" } });
    }) as unknown as typeof fetch;
    const result = await generatePlaylistTracks("test", { ...input, referenceTrackIds: [], includeExplicit: false }, fetcher);
    expect(calls).toBe(20);
    expect(result.tracks).toEqual([]);
  });
});
