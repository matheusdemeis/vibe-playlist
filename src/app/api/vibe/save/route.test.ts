import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { POST, validateSavePayload } from "./route";
import { SpotifyClientError } from "../../../../lib/spotify/client";
const session = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/auth/spotify-session", () => ({ getSpotifySession: session, clearSpotifySession: vi.fn(), getRequiredPlaylistModifyScope: (isPublic: boolean) => isPublic ? "playlist-modify-public" : "playlist-modify-private", hasGrantedScopes: (granted: string[], required: string[]) => required.every((s) => granted.includes(s)) }));
const valid = { name: "My Playlist", trackUris: ["spotify:track:4iV5W9uYEdYUVa79Axb7Rh"] };
afterEach(() => vi.resetAllMocks());

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
