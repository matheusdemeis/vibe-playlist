import { NextRequest, NextResponse } from "next/server";

export function rejectCrossOrigin(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (origin !== request.nextUrl.origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "This action must be started from VibePlay.", code: "invalid_origin", retrySafe: true }, { status: 403 });
  }
  return null;
}

export function privateHeaders(retryAfterSeconds?: number): Record<string, string> {
  return { "Cache-Control": "no-store", ...(retryAfterSeconds !== undefined ? { "Retry-After": String(retryAfterSeconds) } : {}) };
}
