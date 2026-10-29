import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addTracksInBatches, buildTrackUris, chunkTrackUris, PlaylistSaveError, savePlaylistToSpotify } from "./save";
import { createSaveReceipt, fingerprintPlaylist, getSaveSigningKey } from "./save-receipt";

const playlistId = "p".repeat(22);
const uri = (index: number) => `spotify:track:${String(index).padStart(22, "0")}`;
const json = (data: unknown, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers });
const input = () => ({ accessToken: "test-token", grantedScopes: ["playlist-modify-private", "playlist-read-private"], name: "Test mix", description: "Test", isPublic: false, trackUris: [uri(1), uri(2)], draftId: randomUUID() });
beforeEach(() => vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test-only-signing-secret"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("track URI handling", () => {
  it("normalizes, deduplicates, and rejects invalid identifiers", () => {
    expect(buildTrackUris([uri(1), String(1).padStart(22, "0"), "invalid"])).toEqual([uri(1)]);
    expect(chunkTrackUris(Array.from({ length: 205 }, (_, i) => uri(i))).map((batch) => batch.length)).toEqual([100, 100, 5]);
    expect(chunkTrackUris([uri(1), uri(2)], 0).length).toBe(2);
  });
});

describe("safe Spotify insertion", () => {
  it("sends bounded batches without unrelated profile or filtering calls", async () => {
    const fetcher = vi.fn(async () => json({ snapshot_id: "snapshot" }, 201));
    vi.stubGlobal("fetch", fetcher);
    const result = await addTracksInBatches("test", playlistId, Array.from({ length: 205 }, (_, i) => uri(i)));
    expect(result.tracksAddedCount).toBe(205);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it.each([403, 429, 500])("does not blindly retry or filter tracks on %s", async (status) => {
    const fetcher = vi.fn(async () => json({ error: { message: "Rejected" } }, status, { "Retry-After": "42" }));
    vi.stubGlobal("fetch", fetcher);
    await expect(addTracksInBatches("test", playlistId, [uri(1)])).rejects.toMatchObject({ status, retrySafe: false, ...(status === 429 ? { retryAfterSeconds: 42 } : {}) });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe("playlist saving and recovery", () => {
  it("preserves private visibility and deduplicates repeated/concurrent saves of a draft", async () => {
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/me")) return json({ id: "owner" });
      if (url.endsWith("/me/playlists")) { expect(JSON.parse(String(init?.body)).public).toBe(false); return json({ id: playlistId, public: false }, 201); }
      return json({ snapshot_id: "snapshot" }, 201);
    });
    vi.stubGlobal("fetch", fetcher);
    const draft = input();
    const [one, two] = await Promise.all([savePlaylistToSpotify(draft), savePlaylistToSpotify(draft)]);
    const three = await savePlaylistToSpotify(draft);
    expect(one).toEqual(two);
    expect(one).toEqual(three);
    expect(one.isPublic).toBe(false);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/me/playlists"))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/items"))).toHaveLength(1);
  });
  it("returns signed recovery after uncertain insertion and resumes only missing tracks", async () => {
    let failInsert = true;
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith("/me")) return json({ id: "owner" });
      if (url.endsWith("/me/playlists")) return json({ id: playlistId, public: false }, 201);
      if (url.endsWith(`/playlists/${playlistId}`)) return json({ owner: { id: "owner" }, public: false });
      if (init?.method === "GET") return json({ items: [{ item: { uri: uri(1) } }], next: null });
      if (failInsert) { failInsert = false; return json({}, 503); }
      expect(JSON.parse(String(init?.body)).uris).toEqual([uri(2)]);
      return json({ snapshot_id: "complete" }, 201);
    });
    vi.stubGlobal("fetch", fetcher);
    const draft = input();
    let failure: PlaylistSaveError | undefined;
    try { await savePlaylistToSpotify(draft); } catch (error) { failure = error as PlaylistSaveError; }
    expect(failure?.recovery?.playlistId).toBe(playlistId);
    expect(failure?.retrySafe).toBe(false);
    const result = await savePlaylistToSpotify({ ...draft, recoveryToken: failure!.recovery!.recoveryToken });
    expect(result.tracksAddedCount).toBe(2);
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/me/playlists"))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([, init]) => init?.method === "POST")).toHaveLength(3);
  });
  it("does not repeat an uncertain creation request", async () => {
    const fetcher = vi.fn(async (url: string) => url.endsWith("/me") ? json({ id: "owner" }) : json({}, 500));
    vi.stubGlobal("fetch", fetcher);
    const draft = input();
    await expect(savePlaylistToSpotify(draft)).rejects.toMatchObject({ code: "save_outcome_unknown", retrySafe: false });
    await expect(savePlaylistToSpotify(draft)).rejects.toMatchObject({ code: "save_outcome_unknown" });
    expect(fetcher.mock.calls.filter(([url]) => url.endsWith("/me/playlists"))).toHaveLength(1);
  });
  it.each([
    { owner: "owner", uris: [uri(1), uri(2)], error: null },
    { owner: "owner", uris: [uri(2), uri(1)], error: "playlist_changed" },
    { owner: "someone-else", uris: [], error: "playlist_owner_mismatch" },
  ])("recovery reads existing contents without writing: $error", async ({ owner, uris, error }) => {
    const draft = input();
    const recoveryToken = createSaveReceipt({ playlistId, ownerId: "owner", fingerprint: fingerprintPlaylist(draft) }, getSaveSigningKey());
    const fetcher = vi.fn(async (url: string) => {
      if (url.endsWith("/me")) return json({ id: "owner" });
      if (url.endsWith(`/playlists/${playlistId}`)) return json({ owner: { id: owner }, public: false });
      return json({ items: uris.map((uri) => ({ item: { uri } })), next: null });
    });
    vi.stubGlobal("fetch", fetcher);
    const result = savePlaylistToSpotify({ ...draft, recoveryToken });
    if (error) await expect(result).rejects.toMatchObject({ code: error, recovery: { playlistId } });
    else expect((await result).tracksAddedCount).toBe(2);
    const calls = fetcher.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls.every(([, init]) => init.method === "GET")).toBe(true);
  });
  it("keeps missing visibility unknown", async () => {
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.endsWith("/me") ? json({ id: "owner" }) : url.endsWith("/me/playlists") ? json({ id: playlistId }, 201) : json({ snapshot_id: "ok" }, 201)));
    expect((await savePlaylistToSpotify(input())).isPublic).toBeNull();
  });
});
