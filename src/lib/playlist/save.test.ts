import { afterEach, describe, expect, it, vi } from "vitest";
import { addTracksInBatches, buildTrackUris, chunkTrackUris, normalizeTrackUris } from "./save";

describe("chunkTrackUris", () => {
  it("splits URIs into fixed-size chunks", () => {
    const uris = Array.from({ length: 205 }, (_, index) => `spotify:track:${index + 1}`);
    const chunks = chunkTrackUris(uris, 100);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(100);
    expect(chunks[1]).toHaveLength(100);
    expect(chunks[2]).toHaveLength(5);
  });
});

describe("addTracksInBatches", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("posts all URI batches to Spotify", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/me")) {
        return new Response(JSON.stringify({ id: "user-123" }), { status: 200 });
      }
      return new Response(JSON.stringify({ snapshot_id: "ok" }), { status: 201 });
    });

    const uris = Array.from(
      { length: 205 },
      (_, index) => `spotify:track:${String(index + 1).padStart(22, "A")}`,
    );
    const result = await addTracksInBatches(
      "token-123",
      "playlist-abc",
      uris,
      100,
    );

    expect(fetchMock).toHaveBeenCalledTimes(4);

    const firstCallArgs = fetchMock.mock.calls[1];
    const secondCallArgs = fetchMock.mock.calls[2];
    const thirdCallArgs = fetchMock.mock.calls[3];

    expect(firstCallArgs[0]).toContain("/playlists/playlist-abc/items");
    expect(secondCallArgs[0]).toContain("/playlists/playlist-abc/items");
    expect(thirdCallArgs[0]).toContain("/playlists/playlist-abc/items");

    const firstBody = JSON.parse((firstCallArgs[1]?.body as string) ?? "{}") as { uris: string[] };
    const secondBody = JSON.parse((secondCallArgs[1]?.body as string) ?? "{}") as { uris: string[] };
    const thirdBody = JSON.parse((thirdCallArgs[1]?.body as string) ?? "{}") as { uris: string[] };

    expect(firstBody.uris).toHaveLength(100);
    expect(secondBody.uris).toHaveLength(100);
    expect(thirdBody.uris).toHaveLength(5);
    expect(firstCallArgs[1]?.method).toBe("POST");
    const firstHeaders = firstCallArgs[1]?.headers as Headers;
    expect(firstHeaders.get("Authorization")).toBe("Bearer token-123");
    expect(firstHeaders.get("Content-Type")).toBe("application/json");
    expect(firstHeaders.get("Accept")).toBe("application/json");
    expect(result.snapshotId).toBe("ok");
    expect(result.tracksAddedCount).toBe(205);
  });

  it("throws with spotify status when add-tracks request fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/me")) {
        return new Response(JSON.stringify({ id: "user-123" }), { status: 200 });
      }
      if (url.includes("/playlists/playlist-abc") && !url.endsWith("/items")) {
        return new Response(
          JSON.stringify({ owner: { id: "user-123" }, collaborative: false, public: false }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ error: { status: 403, message: "Forbidden" } }), { status: 403 });
    });

    await expect(
      addTracksInBatches("token-123", "playlist-abc", ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh"], 100),
    ).rejects.toMatchObject({
      status: 403,
      code: "spotify_add_tracks_failed",
    });
    expect(fetchMock).toHaveBeenCalled();
  });

  it("requests /v1/tracks/{id} on 403 filtering flow", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith("/me")) {
        return new Response(JSON.stringify({ id: "user-123" }), { status: 200 });
      }
      if (url === "https://api.spotify.com/v1/tracks/4iV5W9uYEdYUVa79Axb7Rh") {
        return new Response(
          JSON.stringify({
            id: "4iV5W9uYEdYUVa79Axb7Rh",
            explicit: false,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/playlists/playlist-abc/items")) {
        return new Response(JSON.stringify({ error: { status: 403, message: "Forbidden" } }), {
          status: 403,
        });
      }
      if (url.includes("/playlists/playlist-abc") && !url.endsWith("/items")) {
        return new Response(
          JSON.stringify({ owner: { id: "user-123" }, collaborative: false, public: false }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    await expect(
      addTracksInBatches(
        "token-123",
        "playlist-abc",
        ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh"],
        100,
      ),
    ).rejects.toMatchObject({
      status: 403,
      code: "spotify_add_tracks_failed",
    });

    const tracksLookupCall = fetchMock.mock.calls.find(
      ([input]) => String(input) === "https://api.spotify.com/v1/tracks/4iV5W9uYEdYUVa79Axb7Rh",
    );
    expect(tracksLookupCall).toBeDefined();
    expect(String(tracksLookupCall?.[0])).toContain("/tracks/4iV5W9uYEdYUVa79Axb7Rh");
  });
});

describe("normalizeTrackUris", () => {
  it("keeps spotify uris and converts raw track ids", () => {
    const uris = normalizeTrackUris([
      "spotify:track:4iV5W9uYEdYUVa79Axb7Rh",
      "4iV5W9uYEdYUVa79Axb7Rh",
      "invalid",
      " ",
    ]);

    expect(uris).toEqual(["spotify:track:4iV5W9uYEdYUVa79Axb7Rh"]);
  });
});

describe("buildTrackUris", () => {
  it("converts raw ids to spotify track uris and removes invalid entries", () => {
    const uris = buildTrackUris([
      "4iV5W9uYEdYUVa79Axb7Rh",
      "spotify:track:1301WleyT98MSxVHPZCA6M",
      "spotify:track:not-a-valid-id",
      "",
      "invalid-id",
    ]);

    expect(uris).toEqual([
      "spotify:track:4iV5W9uYEdYUVa79Axb7Rh",
      "spotify:track:1301WleyT98MSxVHPZCA6M",
    ]);
  });
});
