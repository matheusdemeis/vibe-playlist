import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consumeOAuthAttempt, OAUTH_COOKIE_NAME, startSpotifyLogin } from "./oauth";
import { getAppBaseUrl, getSpotifyRedirectUri, safeReturnTo } from "../config/app-url";
const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (key: string) => ({ value: jar.get(key) }), set: (key: string, value: string) => jar.set(key, value) }) }));
beforeEach(() => { jar.clear(); vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("SPOTIFY_CLIENT_SECRET", "test-secret"); vi.stubEnv("SPOTIFY_CLIENT_ID", "test-client"); vi.stubEnv("APP_BASE_URL", "https://vibe.test"); vi.stubEnv("SPOTIFY_REDIRECT_URI", "https://vibe.test/api/auth/callback"); });
afterEach(() => vi.unstubAllEnvs());

describe("OAuth state and redirects", () => {
  it("binds a one-use state, PKCE verifier, and safe return destination in a secure cookie", async () => {
    const response = await startSpotifyLogin(new NextRequest("https://vibe.test/api/auth/login?returnTo=%2Fvibe%2Fresults%3Fvibes%3DChill"));
    const url = new URL(response.headers.get("location")!);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("scope")).toContain("playlist-read-private");
    const cookie = response.cookies.get(OAUTH_COOKIE_NAME)!;
    expect(cookie.httpOnly).toBe(true); expect(cookie.secure).toBe(true); expect(cookie.maxAge).toBe(600);
    jar.set(OAUTH_COOKIE_NAME, cookie.value);
    expect(await consumeOAuthAttempt(url.searchParams.get("state"))).toMatchObject({ returnTo: "/vibe/results?vibes=Chill", verifier: expect.any(String) });
    expect(await consumeOAuthAttempt(url.searchParams.get("state"))).toBeNull();
  });
  it("rejects a mismatched state", async () => {
    const response = await startSpotifyLogin(new NextRequest("https://vibe.test/api/auth/login"));
    jar.set(OAUTH_COOKIE_NAME, response.cookies.get(OAUTH_COOKIE_NAME)!.value);
    expect(await consumeOAuthAttempt("wrong")).toBeNull();
  });
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/api/auth/login", "/%2f%2fevil.test"])("rejects unsafe return destination %s", (value) => expect(safeReturnTo(value)).toBe("/generate"));
  it("validates configured origins and exact callback route", () => {
    expect(getSpotifyRedirectUri()).toBe("https://vibe.test/api/auth/callback");
    vi.stubEnv("SPOTIFY_REDIRECT_URI", "https://other.test/api/auth/callback"); expect(() => getSpotifyRedirectUri()).toThrow();
    vi.stubEnv("APP_BASE_URL", "http://localhost:5000"); expect(() => getAppBaseUrl()).toThrow();
    vi.stubEnv("APP_BASE_URL", ""); vi.stubEnv("APP_URL", ""); expect(() => getAppBaseUrl()).toThrow();
  });
});
