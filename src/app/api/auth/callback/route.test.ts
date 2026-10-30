import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { startSpotifyLogin, OAUTH_COOKIE_NAME } from "../../../../lib/auth/oauth";
import { getSpotifySession, SPOTIFY_SESSION_COOKIE_NAME } from "../../../../lib/auth/spotify-session";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({
  get: (key: string) => jar.has(key) ? { value: jar.get(key) } : undefined,
  set: (key: string, value: string) => jar.set(key, value),
}) }));
beforeEach(() => {
  jar.clear();
  vi.stubEnv("SPOTIFY_CLIENT_ID", "test-client");
  vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test-secret");
  vi.stubEnv("APP_BASE_URL", "http://127.0.0.1:5000");
  vi.stubEnv("SPOTIFY_REDIRECT_URI", "http://127.0.0.1:5000/api/auth/callback");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
async function begin() {
  const response = await startSpotifyLogin(new NextRequest("http://127.0.0.1:5000/api/auth/login?returnTo=/generate"));
  jar.set(OAUTH_COOKIE_NAME, response.cookies.get(OAUTH_COOKIE_NAME)!.value);
  return new URL(response.headers.get("location")!);
}
it("exchanges the callback with the original PKCE verifier, persists the session, and rejects replay", async () => {
  const authorization = await begin();
  const fetcher = vi.fn(async (url: string, init?: RequestInit) => {
    expect(url).toBe("https://accounts.spotify.com/api/token");
    const body = new URLSearchParams(String(init?.body));
    expect(body.get("redirect_uri")).toBe("http://127.0.0.1:5000/api/auth/callback");
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(createHash("sha256").update(body.get("code_verifier")!).digest("base64url")).toBe(authorization.searchParams.get("code_challenge"));
    return Response.json({ access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600, token_type: "Bearer", scope: "playlist-modify-private playlist-read-private" });
  });
  vi.stubGlobal("fetch", fetcher);
  const callback = () => new NextRequest(`http://127.0.0.1:5000/api/auth/callback?code=fixture-code&state=${authorization.searchParams.get("state")}`);
  const response = await GET(callback());
  expect(response.headers.get("location")).toBe("http://127.0.0.1:5000/generate");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(jar.get(SPOTIFY_SESSION_COOKIE_NAME)).not.toContain("fixture-access");
  expect(await getSpotifySession()).toMatchObject({ accessToken: "fixture-access", grantedScopes: ["playlist-modify-private", "playlist-read-private"] });
  expect((await GET(callback())).headers.get("location")).toContain("auth_error=invalid_state");
  expect(fetcher).toHaveBeenCalledOnce();
});
it.each(["access_denied", "invalid_state"])("does not exchange a token on %s", async (failure) => {
  const authorization = await begin();
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  const response = await GET(new NextRequest(`http://127.0.0.1:5000/api/auth/callback?error=access_denied&state=${failure === "invalid_state" ? "wrong" : authorization.searchParams.get("state")}`));
  expect(response.headers.get("location")).toContain(`auth_error=${failure}`);
  expect(fetcher).not.toHaveBeenCalled();
  expect(jar.has(SPOTIFY_SESSION_COOKIE_NAME)).toBe(false);
});
