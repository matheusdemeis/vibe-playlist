import { NextRequest, NextResponse } from "next/server";
import { getSpotifySession } from "@/lib/auth/spotify-session";

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { accessToken, grantedScopes } = await getSpotifySession();
  const cookieNames = request.cookies.getAll().map((cookie) => cookie.name);

  return NextResponse.json({
    connected: Boolean(accessToken),
    hasAccessToken: Boolean(accessToken),
    tokenPrefix: accessToken ? accessToken.slice(0, 6) : null,
    grantedScopes,
    requestHost: request.headers.get("host"),
    cookieNames,
  });
}
