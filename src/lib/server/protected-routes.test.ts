import { NextRequest } from "next/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST as logout } from "../../app/api/auth/logout/route";
import { POST as debug } from "../../app/api/debug/spotify/add-one/route";
import { POST as recovery } from "../../app/api/playlists/[playlistId]/add-tracks/route";
const session = vi.hoisted(() => ({ clearSpotifySession: vi.fn(), getSpotifySession: vi.fn() }));
vi.mock("../auth/spotify-session", () => session);
beforeEach(() => { vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("APP_BASE_URL", "http://127.0.0.1:5000"); });
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
const request = (origin: string) => new NextRequest("http://127.0.0.1:5000/api/action", { method: "POST", headers: { origin }, body: JSON.stringify({ recoveryToken: "test", playlistId: "p".repeat(22), uri: `spotify:track:${"1".repeat(22)}` }) });
it("allows local logout while rejecting an external origin before clearing cookies", async () => {
  expect((await logout(request("https://evil.test"))).status).toBe(403);
  expect(session.clearSpotifySession).not.toHaveBeenCalled();
  expect((await logout(request("http://127.0.0.1:5000"))).status).toBe(200);
  expect(session.clearSpotifySession).toHaveBeenCalledOnce();
});
it("protects debug mutations and allows local requests to reach authentication", async () => {
  expect((await debug(request("https://evil.test"))).status).toBe(403);
  expect(session.getSpotifySession).not.toHaveBeenCalled();
  session.getSpotifySession.mockResolvedValue({ accessToken: null });
  expect((await debug(request("http://127.0.0.1:5000"))).status).toBe(401);
});
it("applies the same origin guard through the compatibility recovery route", async () => {
  expect((await recovery(request("https://evil.test"), { params: Promise.resolve({ playlistId: "p".repeat(22) }) })).status).toBe(403);
  expect(session.getSpotifySession).not.toHaveBeenCalled();
});
