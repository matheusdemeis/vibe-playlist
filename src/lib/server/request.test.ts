import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { rejectCrossOrigin } from "./request";

const local = "http://127.0.0.1:5000";
const production = "https://vibe-play-livid.vercel.app";
const request = (origin: string | null, headers: Record<string, string> = {}, url = local) =>
  new NextRequest(`${url}/api/vibe/save`, { method: "POST", headers: { ...(origin === null ? {} : { origin }), ...headers } });
beforeEach(() => { vi.stubEnv("APP_BASE_URL", ""); vi.stubEnv("APP_URL", local); });
afterEach(() => vi.unstubAllEnvs());

describe("mutation origin validation", () => {
  it("accepts the browser's loopback origin despite NextURL normalization", () => {
    const req = request(local, { host: "127.0.0.1:5000" });
    expect(req.nextUrl.origin).toBe("http://localhost:5000");
    expect(rejectCrossOrigin(req)).toBeNull();
  });
  it("uses the configured production origin behind an internal proxy URL", () => {
    vi.stubEnv("NODE_ENV", "production"); vi.stubEnv("APP_BASE_URL", production);
    expect(rejectCrossOrigin(request(production, { host: "internal:3000", "x-forwarded-host": "conflicting.test", "x-forwarded-proto": "http" }))).toBeNull();
    expect(rejectCrossOrigin(request(local))?.status).toBe(403);
  });
  it.each([null, "null", "", "https://evil.test", "http://localhost:5000", "http://127.0.0.1:5001", "https://127.0.0.1:5000", `${local}/`, `${local}/path`, `${local}?x=1`, `${local}#x`, "http://user@127.0.0.1:5000", `${local}, https://evil.test`, "not a URL"])("rejects missing, malformed or unconfigured origin %s", (origin) => {
    expect(rejectCrossOrigin(request(origin))?.status).toBe(403);
  });
  it.each<Record<string, string>>([
    { host: "evil.test" },
    { "x-forwarded-host": "evil.test", "x-forwarded-proto": "https" },
    { host: "127.0.0.1:5000", "x-forwarded-host": "127.0.0.1:5000", "x-forwarded-proto": "http" },
    { forwarded: "host=evil.test;proto=https" },
  ])("never authorizes an external origin using transport headers %j", (headers) => {
    expect(rejectCrossOrigin(request("https://evil.test", headers, "https://evil.test"))?.status).toBe(403);
  });
  it("rejects contradictory cross-site fetch metadata", () => {
    expect(rejectCrossOrigin(request(local, { "sec-fetch-site": "cross-site" }))?.status).toBe(403);
  });
  it("supports explicit IPv6 loopback configuration", () => {
    vi.stubEnv("APP_URL", "http://[::1]:5000");
    expect(rejectCrossOrigin(request("http://[::1]:5000", {}, "http://[::1]:5000"))).toBeNull();
  });
  it("uses APP_URL fallback and APP_BASE_URL precedence", () => {
    expect(rejectCrossOrigin(request(local))).toBeNull();
    vi.stubEnv("APP_BASE_URL", production);
    expect(rejectCrossOrigin(request(production))).toBeNull();
    expect(rejectCrossOrigin(request(local))?.status).toBe(403);
  });
  it("keeps the development default but fails closed without production configuration", () => {
    vi.stubEnv("APP_URL", ""); vi.stubEnv("NODE_ENV", "development");
    expect(rejectCrossOrigin(request(local))).toBeNull();
    vi.stubEnv("NODE_ENV", "production");
    expect(rejectCrossOrigin(request(local))?.status).toBe(500);
  });
  it.each(["invalid", "http://external.test", `${production}/path`, "https://user:password@example.test"])("fails closed on invalid configuration %s", (configured) => {
    vi.stubEnv("APP_BASE_URL", configured);
    const result = rejectCrossOrigin(request(local));
    expect(result?.status).toBe(500);
    expect(result?.headers.get("cache-control")).toBe("no-store");
  });
});
