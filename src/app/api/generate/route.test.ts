import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "./route";

describe("POST /api/generate", () => {
  it("calls Spotify search and returns tracks", async () => {
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
                explicit: false,
                is_playable: true,
                artists: [{ name: "Artist One" }],
                album: { images: [{ url: "https://i.scdn.co/image/1" }] },
              },
              {
                id: "track-2",
                name: "Track Two",
                uri: "spotify:track:2",
                preview_url: null,
                is_playable: false,
                artists: [{ name: "Artist Two" }],
                album: { images: [] },
              },
              {
                id: "track-3",
                name: "Track Three",
                uri: "spotify:track:3",
                preview_url: null,
                explicit: true,
                restrictions: { reason: "explicit" },
                artists: [{ name: "Artist Three" }],
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
      body: JSON.stringify({ query: "Drake" }),
    });

    const response = await POST(request);
    const body = (await response.json()) as {
      tracks: Array<{ id: string; name: string; albumImage: string | null }>;
    };

    expect(response.status).toBe(200);
    expect(body.tracks).toHaveLength(1);
    expect(body.tracks[0]?.id).toBe("track-1");

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/v1/search?");
    expect(fetchMock.mock.calls[0]?.[0]).toContain("market=from_token");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fetchMock.mockRestore();
  });

  it("returns structured 400 when query is invalid", async () => {
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

  it("normalizes limit once and clamps to spotify max", async () => {
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
      body: JSON.stringify({ query: "Drake", limit: "999" }),
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("limit=50");

    fetchMock.mockRestore();
  });
});
