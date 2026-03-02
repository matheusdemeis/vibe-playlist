import { afterEach, describe, expect, it, vi } from "vitest";
import { addTracksInBatches, chunkTrackUris } from "./save";

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
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
      return new Response(JSON.stringify({ snapshot_id: "ok" }), { status: 201 });
    });

    const uris = Array.from({ length: 205 }, (_, index) => `spotify:track:${index + 1}`);
    const snapshotId = await addTracksInBatches("token-123", "playlist-abc", uris, 100);

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstCallArgs = fetchMock.mock.calls[0];
    const secondCallArgs = fetchMock.mock.calls[1];
    const thirdCallArgs = fetchMock.mock.calls[2];

    expect(firstCallArgs[0]).toContain("/playlists/playlist-abc/tracks");
    expect(secondCallArgs[0]).toContain("/playlists/playlist-abc/tracks");
    expect(thirdCallArgs[0]).toContain("/playlists/playlist-abc/tracks");

    const firstBody = JSON.parse((firstCallArgs[1]?.body as string) ?? "{}") as { uris: string[] };
    const secondBody = JSON.parse((secondCallArgs[1]?.body as string) ?? "{}") as { uris: string[] };
    const thirdBody = JSON.parse((thirdCallArgs[1]?.body as string) ?? "{}") as { uris: string[] };

    expect(firstBody.uris).toHaveLength(100);
    expect(secondBody.uris).toHaveLength(100);
    expect(thirdBody.uris).toHaveLength(5);
    expect(snapshotId).toBe("ok");
  });
});
