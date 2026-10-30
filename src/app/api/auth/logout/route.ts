import { NextRequest, NextResponse } from "next/server";
import { clearSpotifySession } from "../../../../lib/auth/spotify-session";
import { OAUTH_COOKIE_NAME } from "../../../../lib/auth/oauth";
import { secureCookieOptions } from "../../../../lib/auth/sealed-cookie";
import { rejectCrossOrigin, privateHeaders } from "../../../../lib/server/request";

export async function POST(request: NextRequest) {
  const rejected = rejectCrossOrigin(request);
  if (rejected) return rejected;
  await clearSpotifySession();
  const response = NextResponse.json({ connected: false }, { headers: privateHeaders() });
  response.cookies.set(OAUTH_COOKIE_NAME, "", secureCookieOptions(0));
  response.cookies.set("spotify_auth_state", "", secureCookieOptions(0));
  return response;
}
