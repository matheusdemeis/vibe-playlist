import { describe, expect, it, vi } from "vitest";
import { spotifyJson, SpotifyClientError } from "./client";
import { getSpotifyFailure, parseRetryAfter } from "./error";

describe("Spotify transport", () => {
  it("normalizes network failure without exposing token content", async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error("sensitive-token"));
    await expect(spotifyJson({ path: "/me", accessToken: "sensitive-token", fetcher })).rejects.toMatchObject({ status: 502, message: "Could not reach Spotify." });
  });
  it("rejects unreadable success bodies without replaying a write", async () => {
    const fetcher = vi.fn(async () => new Response("bad json", { status: 201 }));
    await expect(spotifyJson({ path: "/me/playlists", method: "POST", accessToken: "test", fetcher })).rejects.toMatchObject({ status: 502 });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it("distinguishes quota exhaustion and carries Retry-After", () => {
    const failure = getSpotifyFailure(new SpotifyClientError({ message: "limited", status: 429, path: "/search", url: "https://api.spotify.com/v1/search", bodyText: '{"error":{"reason":"QUOTA_EXCEEDED"}}', responseHeaders: new Headers({ "Retry-After": "75" }) }));
    expect(failure).toMatchObject({ code: "spotify_quota_exceeded", retryAfterSeconds: 75 });
    expect(parseRetryAfter("Wed, 28 Oct 2026 12:01:00 GMT", Date.parse("2026-10-28T12:00:00Z"))).toBe(60);
    expect(parseRetryAfter("nonsense")).toBeUndefined();
  });
});
