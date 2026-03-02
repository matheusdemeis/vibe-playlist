import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getSpotifyRedirectUri } from "@/lib/config/app-url";

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const STATE_COOKIE_NAME = "spotify_auth_state";
// Playlist write operations require both private/public modify scopes.
const SPOTIFY_SCOPES = [
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-private",
].join(" ");

export async function GET(request: NextRequest) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = getSpotifyRedirectUri();

  if (!clientId) {
    return NextResponse.json({ error: "Missing SPOTIFY_CLIENT_ID." }, { status: 500 });
  }

  const state = randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });

  // URLSearchParams guarantees proper encoding for space-delimited scope values.
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
  });
  if (request.nextUrl.searchParams.get("show_dialog") === "1") {
    params.set("show_dialog", "true");
  }

  return NextResponse.redirect(`${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`);
}
