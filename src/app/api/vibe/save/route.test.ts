import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, validateSavePayload } from "./route";
import { SpotifyClientError } from "../../../../lib/spotify/client";
const session = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/auth/spotify-session", () => ({ getSpotifySession: session, clearSpotifySession: vi.fn(), getRequiredPlaylistModifyScope: (isPublic: boolean) => isPublic ? "playlist-modify-public" : "playlist-modify-private", hasGrantedScopes: (granted: string[], required: string[]) => required.every((s) => granted.includes(s)) }));
const valid = { name: "My Playlist", trackUris: ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh"] };
beforeEach(() => { vi.stubEnv("APP_BASE_URL", "https://vibe.test"); });
afterEach(() => { vi.resetAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("save payload validation", () => {
  it.each([null, [], "text", 42])("rejects non-object JSON %j", (value) => expect(validateSavePayload(value).ok).toBe(false));
  it("defaults to private and retains explicit public selection", () => {
    expect(validateSavePayload(valid)).toMatchObject({ ok: true, value: { isPublic: false } });
    expect(validateSavePayload({ ...valid, isPublic: true })).toMatchObject({ ok: true, value: { isPublic: true } });
  });
  it.each(["false", "true", 1])("rejects ambiguous visibility %s", (isPublic) => expect(validateSavePayload({ ...valid, isPublic }).ok).toBe(false));
  it("rejects invalid tracks, oversized lists and names", () => {
    expect(validateSavePayload({ ...valid, trackUris: ["spotify:track:bad"] }).ok).toBe(false);
    expect(validateSavePayload({ ...valid, trackUris: Array(301).fill(valid.trackUris[0]) }).ok).toBe(false);
    expect(validateSavePayload({ ...valid, name: " " }).ok).toBe(false);
    expect(validateSavePayload({ ...valid, name: "x".repeat(101) }).ok).toBe(false);
  });
});
describe("save route", () => {
  it("rejects cross-origin mutation before authentication", async () => {
    const result = await POST(new NextRequest("https://vibe.test/api/vibe/save", { method: "POST", headers: { origin: "https://elsewhere.test" }, body: JSON.stringify(valid) }));
    expect(result.status).toBe(403); expect(session).not.toHaveBeenCalled();
  });
  it("retains refresh rate-limit metadata without claiming login is invalid", async () => {
    session.mockRejectedValue(new SpotifyClientError({ status: 429, message: "Rate limited", path: "/api/token", url: "https://accounts.spotify.com/api/token", bodyText: "", responseHeaders: new Headers({ "Retry-After": "30" }) }));
    const result = await POST(new NextRequest("https://vibe.test/api/vibe/save", { method: "POST", headers: { origin: "https://vibe.test" }, body: JSON.stringify(valid) }));
    expect(result.status).toBe(429); expect(result.headers.get("retry-after")).toBe("30");
    expect(await result.json()).toMatchObject({ code: "spotify_rate_limited", retrySafe: true });
  });
});

describe("local save HTTP handler with real save service", () => {
  it.each([false, true])("creates and fills a playlist with public=%s through the origin guard", async (isPublic) => {
    vi.stubEnv("APP_BASE_URL", "http://127.0.0.1:5000");
    vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test-only-signing-secret");
    session.mockResolvedValue({ accessToken: "test-token", grantedScopes: ["playlist-read-private", "playlist-modify-private", "playlist-modify-public"] });
    const id = "p".repeat(22);
    const second = `spotify:track:${"2".repeat(22)}`;
    const calls: string[] = [];
    const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push(url);
      if (url.endsWith("/me")) return Response.json({ id: "owner" });
      if (url.endsWith("/me/playlists")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({ name: valid.name, description: "My mood", public: isPublic });
        return Response.json({ id, public: isPublic }, { status: 201 });
      }
      expect(url).toBe(`https://api.spotify.com/v1/playlists/${id}/items`);
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({ uris: [valid.trackUris[0], second] });
      return Response.json({ snapshot_id: "saved" }, { status: 201 });
    });
    vi.stubGlobal("fetch", fetcher);
    const body = JSON.stringify({ ...valid, description: "My mood", isPublic, trackUris: [...valid.trackUris, second, ...valid.trackUris], draftId: crypto.randomUUID() });
    const send = () => POST(new NextRequest("http://127.0.0.1:5000/api/vibe/save", { method: "POST", headers: { origin: "http://127.0.0.1:5000", host: "127.0.0.1:5000", "sec-fetch-site": "same-origin" }, body }));
    const result = await send();
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ playlistId: id, playlistUrl: `https://open.spotify.com/playlist/${id}`, tracksAddedCount: 2, tracksAdded: true, visibility: { requested: isPublic, final: isPublic } });
    expect(calls.slice(0, 3)).toEqual(["https://api.spotify.com/v1/me", "https://api.spotify.com/v1/me/playlists", `https://api.spotify.com/v1/playlists/${id}/items`]);
    expect((await send()).status).toBe(200);
    expect(calls.filter((url) => url.endsWith("/me/playlists"))).toHaveLength(1);
    expect(calls.filter((url) => url.endsWith("/items"))).toHaveLength(1);
  });
  it("lets legitimate unauthenticated local requests reach authentication", async () => {
    vi.stubEnv("APP_BASE_URL", "http://127.0.0.1:5000");
    session.mockResolvedValue({ accessToken: null, grantedScopes: [] });
    const result = await POST(new NextRequest("http://127.0.0.1:5000/api/vibe/save", { method: "POST", headers: { origin: "http://127.0.0.1:5000" }, body: JSON.stringify(valid) }));
    expect(result.status).toBe(401);
    expect(await result.json()).toMatchObject({ code: "not_authenticated", retrySafe: true });
  });
});
