import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";
const session = vi.hoisted(() => vi.fn());
const clear = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/auth/spotify-session", () => ({ getSpotifySession: session, clearSpotifySession: clear, REQUIRED_PLAYLIST_SCOPES: ["playlist-modify-private", "playlist-modify-public", "playlist-read-private"] }));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetAllMocks(); });
describe("connection status", () => {
  it("returns permission metadata in production with no token exposure", async () => {
    vi.stubEnv("NODE_ENV", "production");
    session.mockResolvedValue({ accessToken: "sensitive-token", grantedScopes: ["playlist-modify-private", "playlist-modify-public", "playlist-read-private"] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ id: "owner", display_name: "Listener" }))));
    const response = await GET();
    const text = await response.text();
    expect(JSON.parse(text)).toMatchObject({ connected: true, hasRequiredPlaylistScopes: true, missingRequiredScopes: [] });
    expect(text).not.toContain("sensitive-token"); expect(response.headers.get("cache-control")).toBe("no-store");
  });
  it("clears a revoked access token", async () => {
    session.mockResolvedValue({ accessToken: "revoked", grantedScopes: [] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    expect(await (await GET()).json()).toMatchObject({ connected: false }); expect(clear).toHaveBeenCalledOnce();
  });
});
