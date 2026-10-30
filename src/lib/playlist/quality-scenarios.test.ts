import { performance } from "node:perf_hooks";
import { NextRequest } from "next/server";
import { afterEach, expect, it, vi } from "vitest";
import { POST } from "../../app/api/generate/route";
import { generatePlaylistTracks } from "./generate";

vi.mock("../../lib/auth/spotify-session", () => ({
  getSpotifySession: async () => ({ accessToken: "fixture-only", grantedScopes: [] }),
  clearSpotifySession: vi.fn(),
}));
afterEach(() => vi.unstubAllGlobals());

// Synthetic catalog fixtures exercise constraints and counts. These are NOT
// measurements of Spotify's live catalog, latency, or subjective music quality.
const scenarios = [
  { name: "Chill", vibe: "chill", limit: 25 },
  { name: "Night Drive + Drake", vibe: "nightdrive", query: "Drake", limit: 25 },
  { name: "Gym", vibe: "gym", limit: 50 },
  { name: "Party + Hip-Hop text", vibe: "party", query: "Hip-Hop", limit: 25 },
  { name: "Beach", vibe: "beach", limit: 25 },
  { name: "Advanced", vibe: "chill", limit: 30, advanced: true },
  { name: "Conflicting preference", vibe: "chill", query: "No matches", limit: 25 },
];
it.each(scenarios)("measures deterministic fixture quality: $name", async (scenario) => {
  const sourceIds = new Map<string, number>();
  const records = new Map<string, { recording: string; explicit: boolean; artist: string; name: string }>();
  let searchRequests = 0;
  let lookups = 0;
  const artistId = "d".repeat(22);
  const artist = { id: artistId, name: "Drake" };
  const secondArtist = { id: "s".repeat(22), name: "Second Reference Artist" };
  const reference = { id: "r".repeat(22), uri: `spotify:track:${"r".repeat(22)}`, name: "Reference", artists: [artist], album: { name: "Fixture", images: [] } };
  const fetcher = vi.fn(async (raw: string) => {
    const url = new URL(raw);
    if (url.pathname.startsWith("/v1/tracks/")) { lookups++; return Response.json(url.pathname.endsWith("s".repeat(22)) ? { ...reference, id: "s".repeat(22), artists: [secondArtist] } : reference); }
    expect(url.pathname).toBe("/v1/search");
    searchRequests++;
    expect(url.searchParams.get("limit")).toBe("10");
    if (url.searchParams.get("type") === "artist") return Response.json({ artists: { items: scenario.query === "Drake" ? [artist] : [] } });
    const query = url.searchParams.get("q")!;
    if (scenario.query === "No matches") return Response.json({ tracks: { items: [], next: null } });
    if (scenario.query === "Hip-Hop") expect(query).toContain('"Hip-Hop"');
    if (!sourceIds.has(query)) sourceIds.set(query, sourceIds.size + 1);
    const source = sourceIds.get(query)!;
    const offset = Number(url.searchParams.get("offset"));
    const items = Array.from({ length: 10 }, (_, i) => {
      const n = offset + i;
      const id = String(source * 1000 + n).padStart(22, "0");
      // A second release repeats each fifth recording; every seventh item is explicit.
      const recording = `fixture-${source}-${n % 5 === 4 ? n - 1 : n}`;
      const chosenArtist = query.startsWith('artist:"Second Reference Artist"') ? secondArtist : query.startsWith("artist:") ? artist : { id: `artist-${n % 12}`, name: `Artist ${n % 12}` };
      const name = `${scenario.query === "Hip-Hop" ? "Hip-Hop " : ""}Fixture ${source}-${n}`;
      records.set(id, { recording, explicit: n % 7 === 0, artist: chosenArtist.id, name });
      return { id, name, uri: `spotify:track:${id}`, artists: [chosenArtist], album: { name: "Fixture album", images: [] }, explicit: n % 7 === 0, external_ids: { isrc: recording } };
    });
    return Response.json({ tracks: { items, next: offset < 30 ? "next" : null } });
  });
  vi.stubGlobal("fetch", fetcher);
  const started = performance.now();
  const result = scenario.advanced
    ? await generatePlaylistTracks("fixture-only", { vibes: ["Chill", "Party"], seedGenres: ["hip-hop", "pop"], referenceTrackIds: [reference.id, "s".repeat(22)], targetEnergy: 50, targetValence: 50, trackCount: scenario.limit, includeExplicit: false })
    : await (await POST(new NextRequest("http://127.0.0.1:5000/api/generate", { method: "POST", body: JSON.stringify({ ...scenario, includeExplicit: false }) }))).json();
  const tracks = result.tracks as Array<{ id: string }>;
  const selected = tracks.map((t) => records.get(t.id)!);
  const artists = new Set(selected.map((t) => t.artist));
  const peak = Math.max(0, ...[...artists].map((id) => selected.filter((t) => t.artist === id).length));
  const measurement = { scenario: scenario.name, source: "synthetic fixtures", requested: scenario.limit, returned: tracks.length,
    uniqueIds: new Set(tracks.map((t) => t.id)).size, uniqueRecordings: new Set(selected.map((t) => t.recording)).size,
    duplicateTitleArtistPairs: selected.length - new Set(selected.map((t) => JSON.stringify([t.name, t.artist]))).size,
    primaryArtists: artists.size, largestArtistShare: tracks.length ? Number((peak / tracks.length).toFixed(3)) : 0,
    explicitTracks: selected.filter((t) => t.explicit).length, searchRequests, referenceLookups: lookups,
    fixtureLatencyMs: Number((performance.now() - started).toFixed(2)), warning: Boolean(result.warning) };
  console.info("QUALITY_FIXTURE " + JSON.stringify(measurement));
  expect(measurement.uniqueIds).toBe(tracks.length);
  expect(measurement.uniqueRecordings).toBe(tracks.length);
  expect(measurement.duplicateTitleArtistPairs).toBe(0);
  expect(measurement.explicitTracks).toBe(0);
  expect(searchRequests).toBeLessThanOrEqual(21);
  expect(tracks.length).toBeLessThanOrEqual(scenario.limit);
  if (scenario.query === "Drake") expect([...artists]).toEqual([artistId]);
  if (scenario.advanced) expect([...artists].sort()).toEqual([artistId, secondArtist.id].sort());
  if (tracks.length < scenario.limit) expect(result.warning).toBeTruthy();
});
