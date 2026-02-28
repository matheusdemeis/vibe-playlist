import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST, addTracksInBatches } from "./route";

describe("addTracksInBatches", () => {
  it("splits track URIs into 100-sized batches", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ snapshot_id: "ok" }), { status: 201 });
    });

    const uris = Array.from({ length: 205 }, (_, index) => `spotify:track:${index + 1}`);
    await addTracksInBatches("playlist-1", uris, "token");

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstBody = JSON.parse((fetchMock.mock.calls[0]?.[1]?.body as string) ?? "{}") as {
      uris: string[];
    };
    const thirdBody = JSON.parse((fetchMock.mock.calls[2]?.[1]?.body as string) ?? "{}") as {
      uris: string[];
    };

    expect(firstBody.uris).toHaveLength(100);
    expect(thirdBody.uris).toHaveLength(5);

    fetchMock.mockRestore();
  });
});

describe("POST /api/generate", () => {
  it("calls Spotify search -> me -> create playlist -> add tracks", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            tracks: {
              items: [
                { uri: "spotify:track:1" },
                { uri: "spotify:track:2" },
              ],
            },
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: "user-1" }), { status: 200 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: "playlist-1",
            external_urls: { spotify: "https://open.spotify.com/playlist/playlist-1" },
          }),
          { status: 201 },
        ),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ snapshot_id: "snap-1" }), { status: 201 }));

    const request = new NextRequest("http://localhost:5000/api/generate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: "spotify_access_token=test-token",
      },
      body: JSON.stringify({ artistName: "Drake" }),
    });

    const response = await POST(request);
    const body = (await response.json()) as { playlistId: string; trackCount: number };

    expect(response.status).toBe(200);
    expect(body.playlistId).toBe("playlist-1");
    expect(body.trackCount).toBe(2);

    expect(fetchMock.mock.calls[0]?.[0]).toContain("/v1/search?");
    expect(fetchMock.mock.calls[1]?.[0]).toContain("/v1/me");
    expect(fetchMock.mock.calls[2]?.[0]).toContain("/v1/users/user-1/playlists");
    expect(fetchMock.mock.calls[3]?.[0]).toContain("/v1/playlists/playlist-1/tracks");

    fetchMock.mockRestore();
  });

  it("supports dry run mode and skips playlist creation", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          tracks: {
            items: [
              { uri: "spotify:track:1" },
              { uri: "spotify:track:2" },
              { uri: "spotify:track:3" },
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
      body: JSON.stringify({ artistName: "Drake", dryRun: true }),
    });

    const response = await POST(request);
    const body = (await response.json()) as {
      dryRun: boolean;
      resolvedUrls: string[];
      trackCount: number;
    };

    expect(response.status).toBe(200);
    expect(body.dryRun).toBe(true);
    expect(body.trackCount).toBe(3);
    expect(body.resolvedUrls[0]).toContain("https://api.spotify.com/v1/search?");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[0]).toContain("/v1/search?");

    fetchMock.mockRestore();
  });
});
