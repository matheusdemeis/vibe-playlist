import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const STATE_COOKIE_NAME = "spotify_auth_state";
const DEFAULT_REDIRECT_URI = "http://127.0.0.1:5000/api/auth/callback";
const SPOTIFY_SCOPES = [
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-private",
].join(" ");

export async function GET() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = process.env.SPOTIFY_REDIRECT_URI ?? DEFAULT_REDIRECT_URI;

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

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: "code",
    redirect_uri: redirectUri,
    scope: SPOTIFY_SCOPES,
    state,
  });

  return NextResponse.redirect(`${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`);
}
