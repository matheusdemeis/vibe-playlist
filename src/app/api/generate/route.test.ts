import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const session = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/auth/spotify-session", () => ({ getSpotifySession: session, clearSpotifySession: vi.fn() }));
const json = (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });
const track = (i: number, artist = "artist") => ({ id: String(i).padStart(22, "0"), name: `Track ${i}`, uri: `spotify:track:${String(i).padStart(22, "0")}`, artists: [{ id: artist, name: "Artist" }], album: { images: [] }, explicit: false });
const request = (body: unknown) => new NextRequest("https://vibe.test/api/generate", { method: "POST", body: JSON.stringify(body) });
beforeEach(() => session.mockResolvedValue({ accessToken: "test", grantedScopes: [] }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetAllMocks(); });

describe("catalog generation API", () => {
  it("paginates in pages of ten and returns the requested 25 tracks", async () => {
    const offsets: number[] = [];
    vi.stubGlobal("fetch", vi.fn(async (raw: string) => {
      const url = new URL(raw); expect(url.searchParams.get("limit")).toBe("10");
      expect(url.pathname).toBe("/v1/search");
      const offset = Number(url.searchParams.get("offset")); offsets.push(offset);
      return json({ tracks: { items: Array.from({ length: 10 }, (_, i) => track(offset + i)), next: "next" } });
    }));
    const result = await POST(request({ vibe: "chill", limit: 25 }));
    expect(result.status).toBe(200); expect((await result.json()).tracks).toHaveLength(25);
    expect(offsets).toContain(10);
  });
  it.each([400, 401, 403, 429, 500])("propagates Spotify %s and stops further catalog calls", async (status) => {
    const fetcher = vi.fn(async () => json({ error: { message: "No" } }, status, { "Retry-After": "15" }));
    vi.stubGlobal("fetch", fetcher);
    const result = await POST(request({ vibe: "gym" }));
    expect(result.status).toBe(status); expect(fetcher).toHaveBeenCalledTimes(1);
    if (status === 429) expect(result.headers.get("retry-after")).toBe("15");
  });
  it.each([null, [], { query: 4 }, { vibe: "unknown" }, { vibe: "chill", limit: 1.5 }])("rejects invalid payload %j", async (body) => expect((await POST(request(body))).status).toBe(400));
  it("does not treat an unrelated artist match as a track preference", async () => {
    vi.stubGlobal("fetch", vi.fn(async (raw: string) => {
      const url = new URL(raw);
      if (url.searchParams.get("type") === "artist") return json({ artists: { items: [{ id: "unrelated", name: "Unrelated" }] } });
      expect(url.searchParams.get("q")).toBe("Song title");
      return json({ tracks: { items: [track(1)], next: null } });
    }));
    const result = await POST(request({ query: "Song title" }));
    expect(result.status).toBe(200); expect((await result.json()).tracks).toHaveLength(1);
  });
  it("filters exact artists and explicit tracks, deduplicating ids", async () => {
    vi.stubGlobal("fetch", vi.fn(async (raw: string) => new URL(raw).searchParams.get("type") === "artist"
      ? json({ artists: { items: [{ id: "artist", name: "Artist" }] } })
      : json({ tracks: { items: [track(1), track(1), track(2, "different"), { ...track(3), explicit: true }], next: null } })));
    const result = await POST(request({ query: "Artist", includeExplicit: false }));
    expect((await result.json()).tracks).toHaveLength(1);
  });
  it("returns an honest empty result for a successful search with no matches", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ tracks: { items: [], next: null } })));
    const result = await POST(request({ vibe: "chill" }));
    expect(result.status).toBe(200); expect(await result.json()).toMatchObject({ tracks: [], warning: expect.stringContaining("No catalog matches") });
  });
});
