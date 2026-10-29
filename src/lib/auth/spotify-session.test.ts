import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSpotifySession, saveSpotifySession, SPOTIFY_SESSION_COOKIE_NAME } from "./spotify-session";
import { sealCookie, unsealCookie } from "./sealed-cookie";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined, set: (key: string, value: string) => jar.set(key, value) }) }));
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
beforeEach(() => { jar.clear(); vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test-encryption-secret"); vi.stubEnv("SPOTIFY_CLIENT_ID", "test-client"); vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-01T00:00:00Z")); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("encrypted sessions", () => {
  it("does not expose tokens in cookies and rejects tampering and purpose confusion", () => {
    const sealed = sealCookie({ token: "sensitive-token" }, "one");
    expect(sealed).not.toContain("sensitive-token");
    expect(unsealCookie(sealed, "one")).toEqual({ token: "sensitive-token" });
    expect(unsealCookie(sealed, "two")).toBeNull();
    expect(unsealCookie(`X${sealed.slice(1)}`, "one")).toBeNull();
  });
  it("retains the active token until refresh is due", async () => {
    const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
    await saveSpotifySession({ access_token: "access", refresh_token: "refresh", expires_in: 3600, token_type: "Bearer", scope: "playlist-modify-private" });
    expect(await getSpotifySession()).toMatchObject({ accessToken: "access", grantedScopes: ["playlist-modify-private"] });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refreshes once for concurrent callers and rotates tokens preserving omitted scopes", async () => {
    await saveSpotifySession({ access_token: "old", refresh_token: "refresh", expires_in: 3600, token_type: "Bearer", scope: "playlist-modify-private" });
    vi.setSystemTime(new Date("2026-10-01T01:00:00Z"));
    const fetcher = vi.fn(async () => json({ access_token: "new", refresh_token: "rotated", expires_in: 3600, token_type: "Bearer" })); vi.stubGlobal("fetch", fetcher);
    const results = await Promise.all([getSpotifySession(), getSpotifySession()]);
    expect(results.map((s) => s.accessToken)).toEqual(["new", "new"]);
    expect(results[0].grantedScopes).toEqual(["playlist-modify-private"]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(unsealCookie(jar.get(SPOTIFY_SESSION_COOKIE_NAME)!, "spotify-session-v1")).toMatchObject({ refreshToken: "rotated" });
  });
  it("clears invalid_grant sessions without retrying", async () => {
    await saveSpotifySession({ access_token: "old", refresh_token: "refresh", expires_in: 30, token_type: "Bearer" });
    const fetcher = vi.fn(async () => json({ error: "invalid_grant" }, 400)); vi.stubGlobal("fetch", fetcher);
    expect((await getSpotifySession()).accessToken).toBeNull();
    expect(jar.get(SPOTIFY_SESSION_COOKIE_NAME)).toBe(""); expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("preserves sessions on transient refresh errors", async () => {
    await saveSpotifySession({ access_token: "old", refresh_token: "refresh", expires_in: 30, token_type: "Bearer" });
    const original = jar.get(SPOTIFY_SESSION_COOKIE_NAME);
    vi.stubGlobal("fetch", vi.fn(async () => json({}, 429)));
    await expect(getSpotifySession()).rejects.toMatchObject({ status: 429 });
    expect(jar.get(SPOTIFY_SESSION_COOKIE_NAME)).toBe(original);
  });
  it("rejects expired or corrupted session cookies", async () => {
    await saveSpotifySession({ access_token: "old", refresh_token: "refresh", expires_in: 3600, token_type: "Bearer" });
    vi.setSystemTime(new Date("2026-11-02T00:00:00Z"));
    expect((await getSpotifySession()).accessToken).toBeNull();
    jar.set(SPOTIFY_SESSION_COOKIE_NAME, "bad-cookie");
    expect((await getSpotifySession()).accessToken).toBeNull();
  });
});
