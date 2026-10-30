import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl } from "../config/app-url";

export function rejectCrossOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  let expectedOrigin: string;
  try {
    expectedOrigin = getAppBaseUrl();
  } catch {
    return NextResponse.json({ error: "VibePlay's public URL is not configured correctly.", code: "invalid_app_origin", retrySafe: true }, { status: 500, headers: privateHeaders() });
  }
  // NextURL rewrites loopback IPs to localhost. Host and forwarded headers can
  // also describe proxy internals or be client-controlled; neither authorizes
  // an origin. Only the server-configured public origin is trusted. Exact
  // comparison also rejects null, multiple origins, paths, and credentials.
  if (origin !== expectedOrigin || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "This action must be started from VibePlay.", code: "invalid_origin", retrySafe: true }, { status: 403, headers: privateHeaders() });
  }
  return null;
}

export function privateHeaders(retryAfterSeconds?: number): Record<string, string> {
  return { "Cache-Control": "no-store", ...(retryAfterSeconds !== undefined ? { "Retry-After": String(retryAfterSeconds) } : {}) };
}
