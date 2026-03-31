import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";
import * as spotifySession from "../../../lib/auth/spotify-session";

vi.mock("../../../lib/auth/spotify-session", () => ({
  getSpotifySession: vi.fn(),
}));

describe("POST /api/generate", () => {
  beforeEach(() => {
    vi.mocked(spotifySession.getSpotifySession).mockResolvedValue({
      accessToken: "test-token",
      grantedScopes: ["playlist-modify-private", "playlist-modify-public", "user-read-private"],
      tokenResponseScopeRaw: "playlist-modify-private playlist-modify-public user-read-private",
    });
  });

  it("uses search as primary generation with vibe+artist query", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          artists: {
            items: [{ id: "artist-drake", name: "Drake" }],
          },
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tracks: {
            items: [
              {
                id: "track-1",
                name: "Track One",
                uri: "spotify:track:1",
                preview_url: "https://p.scdn.co/mp3-preview/1",
                is_playable: true,
                artists: [{ id: "artist-drake", name: "Drake" }],
                album: { images: [{ url: "https://i.scdn.co/image/1" }] },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const request = new NextRequest("http://localhost:5000/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "spotify_access_token=test-token",
      },
      body: JSON.stringify({ query: "Drake", vibe: "gym", limit: 25 }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { tracks: Array<{ id: string }> };
    const fetchUrls = fetchMock.mock.calls.map((call) => String(call[0]));

    expect(response.status).toBe(200);
    expect(body.tracks).toHaveLength(1);
    expect(fetchUrls[0]).toContain("/v1/search?");
    expect(fetchUrls[0]).toContain("type=artist");
    expect(fetchUrls[0]).toContain("q=Drake");
    expect(fetchUrls.some((url) => url.includes("q=Drake+edm+hip-hop+workout"))).toBe(true);

    fetchMock.mockRestore();
  });

  it("sanitizes spotify search limit and never sends invalid low values like 15", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          artists: {
            items: [{ id: "artist-drake", name: "Drake" }],
          },
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tracks: {
            items: [],
          },
        }),
        { status: 200 },
      ),
    );

    const request = new NextRequest("http://localhost:5000/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "spotify_access_token=test-token",
      },
      body: JSON.stringify({ query: "Drake", limit: 15 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("limit=25");
    expect(fetchMock.mock.calls[1]?.[0]).not.toContain("limit=15");

    fetchMock.mockRestore();
  });

  it("builds a plain Spotify search request for Frank Ocean without market", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          artists: {
            items: [{ id: "artist-frank", name: "Frank Ocean" }],
          },
        }),
        { status: 200 },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tracks: {
            items: [],
          },
        }),
        { status: 200 },
      ),
    );

    const request = new NextRequest("http://localhost:5000/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "spotify_access_token=test-token",
      },
      body: JSON.stringify({ query: "Frank Ocean", limit: 10 }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/v1/search?");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("q=Frank+Ocean");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("type=track");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("limit=25");
    expect(fetchMock.mock.calls[1]?.[0]).not.toContain("market=");

    fetchMock.mockRestore();
  });

  it("retries with fallback queries and dedupes tracks by id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            artists: {
              items: [{ id: "artist-drake", name: "Drake" }],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tracks: {
              items: [],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tracks: {
              items: [
                {
                  id: "dup-track",
                  name: "Duplicate",
                  uri: "spotify:track:dup",
                  preview_url: null,
                  artists: [{ id: "artist-drake", name: "Drake" }],
                  album: { images: [] },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tracks: {
              items: [
                {
                  id: "dup-track",
                  name: "Duplicate",
                  uri: "spotify:track:dup",
                  preview_url: null,
                  artists: [{ id: "artist-drake", name: "Drake" }],
                  album: { images: [] },
                },
                {
                  id: "unique-track",
                  name: "Unique",
                  uri: "spotify:track:unique",
                  preview_url: null,
                  artists: [{ id: "artist-other", name: "Artist B" }],
                  album: { images: [] },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );

    const request = new NextRequest("http://localhost:5000/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "spotify_access_token=test-token",
      },
      body: JSON.stringify({ query: "Drake", vibe: "party", limit: 25 }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { tracks: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(body.tracks).toHaveLength(1);
    expect(body.tracks.map((track) => track.id)).toEqual(["dup-track"]);

    fetchMock.mockRestore();
  });

  it("returns a friendly warning when no tracks are found", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ artists: { items: [{ id: "artist-none", name: "NoResults" }] } }), {
          status: 200,
        }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ tracks: { items: [] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tracks: { items: [] } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ tracks: { items: [] } }), { status: 200 }));

    const request = new NextRequest("http://localhost:5000/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "spotify_access_token=test-token",
      },
      body: JSON.stringify({ query: "NoResults", vibe: "chill", limit: 25 }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { tracks: unknown[]; warning?: string };

    expect(response.status).toBe(200);
    expect(body.tracks).toHaveLength(0);
    expect(body.warning).toBe("We couldn't build that mix right now. Try another vibe or artist.");

    fetchMock.mockRestore();
  });

  it("returns structured 400 when neither vibe nor valid query is provided", async () => {
    const request = new NextRequest("http://localhost:5000/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "spotify_access_token=test-token",
      },
      body: JSON.stringify({ query: "a" }),
    });

    const response = await POST(request);
    const body = (await response.json()) as {
      error: { message: string; status: number; details: Record<string, unknown> };
    };

    expect(response.status).toBe(400);
    expect(body.error.status).toBe(400);
    expect(body.error.message).toContain("at least 2 characters");
    expect(body.error.details.field).toBe("query");
  });

  it("returns artist-only tracks that include the selected artist", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            artists: {
              items: [{ id: "artist-drake", name: "Drake" }],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tracks: {
              items: [
                {
                  id: "drake-track",
                  name: "Drake Track",
                  uri: "spotify:track:drake",
                  preview_url: null,
                  is_playable: true,
                  artists: [{ id: "artist-drake", name: "Drake" }],
                  album: { images: [] },
                },
                {
                  id: "other-track",
                  name: "Other Track",
                  uri: "spotify:track:other",
                  preview_url: null,
                  is_playable: true,
                  artists: [{ id: "artist-other", name: "Other Artist" }],
                  album: { images: [] },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );

    const request = new NextRequest("http://localhost:5000/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "spotify_access_token=test-token",
      },
      body: JSON.stringify({ query: "Drake", limit: 25 }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { tracks: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.tracks.map((track) => track.id)).toEqual(["drake-track"]);

    fetchMock.mockRestore();
  });

  it("filters mood + artist results to only tracks that include the selected artist id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockImplementation((input) => {
      const url = String(input);

      if (url.includes("type=artist")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              artists: {
                items: [{ id: "artist-drake", name: "Drake" }],
              },
            }),
            { status: 200 },
          ),
        );
      }

      return Promise.resolve(
        new Response(
          JSON.stringify({
            tracks: {
              items: [
                {
                  id: "solo-drake",
                  name: "Solo Drake",
                  uri: "spotify:track:solo",
                  preview_url: null,
                  is_playable: true,
                  artists: [{ id: "artist-drake", name: "Drake" }],
                  album: { images: [] },
                },
                {
                  id: "drake-collab",
                  name: "Collab",
                  uri: "spotify:track:collab",
                  preview_url: null,
                  is_playable: true,
                  artists: [
                    { id: "artist-guest", name: "Guest" },
                    { id: "artist-drake", name: "Drake" },
                  ],
                  album: { images: [] },
                },
                {
                  id: "not-drake",
                  name: "Other Artist",
                  uri: "spotify:track:other",
                  preview_url: null,
                  is_playable: true,
                  artists: [{ id: "artist-other", name: "Other Artist" }],
                  album: { images: [] },
                },
              ],
            },
          }),
          { status: 200 },
        ),
      );
    });

    const request = new NextRequest("http://localhost:5000/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "spotify_access_token=test-token",
      },
      body: JSON.stringify({ query: "Drake", vibe: "party", limit: 25 }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { tracks: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.tracks.map((track) => track.id)).toEqual(["solo-drake", "drake-collab"]);

    fetchMock.mockRestore();
  });

  it("keeps mood-only flow unchanged without forcing artist filtering", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          tracks: {
            items: [
              {
                id: "mood-track",
                name: "Mood Track",
                uri: "spotify:track:mood",
                preview_url: null,
                is_playable: true,
                artists: [{ id: "artist-any", name: "Any Artist" }],
                album: { images: [] },
              },
            ],
          },
        }),
        { status: 200 },
      ),
    );

    const request = new NextRequest("http://localhost:5000/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "spotify_access_token=test-token",
      },
      body: JSON.stringify({ vibe: "chill", limit: 25 }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { tracks: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.tracks.map((track) => track.id)).toEqual(["mood-track"]);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("type=track");

    fetchMock.mockRestore();
  });
});
