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
          tracks: {
            items: [
              {
                id: "track-1",
                name: "Track One",
                uri: "spotify:track:1",
                preview_url: "https://p.scdn.co/mp3-preview/1",
                is_playable: true,
                artists: [{ name: "Artist One" }],
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

    expect(response.status).toBe(200);
    expect(body.tracks).toHaveLength(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/v1/search?");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("q=Drake+edm+hip-hop+workout");

    fetchMock.mockRestore();
  });

  it("sanitizes spotify search limit and never sends invalid low values like 15", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
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
    expect(fetchMock.mock.calls[0]?.[0]).toContain("limit=25");
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("limit=15");

    fetchMock.mockRestore();
  });

  it("builds a plain Spotify search request for Frank Ocean without market", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
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
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/v1/search?");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("q=Frank+Ocean");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("type=track");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("limit=25");
    expect(fetchMock.mock.calls[0]?.[0]).not.toContain("market=");

    fetchMock.mockRestore();
  });

  it("retries with fallback queries and dedupes tracks by id", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
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
                  artists: [{ name: "Artist A" }],
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
                  artists: [{ name: "Artist A" }],
                  album: { images: [] },
                },
                {
                  id: "unique-track",
                  name: "Unique",
                  uri: "spotify:track:unique",
                  preview_url: null,
                  artists: [{ name: "Artist B" }],
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
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(body.tracks).toHaveLength(2);
    expect(body.tracks.map((track) => track.id)).toEqual(["dup-track", "unique-track"]);

    fetchMock.mockRestore();
  });

  it("returns a friendly warning when no tracks are found", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
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
});
