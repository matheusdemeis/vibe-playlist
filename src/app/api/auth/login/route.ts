import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const STATE_COOKIE_NAME = "spotify_auth_state";
const DEFAULT_REDIRECT_URI = "http://127.0.0.1:5000/api/auth/callback";
const SPOTIFY_SCOPES = [
  "playlist-modify-private",
  "playlist-modify-public",
  "user-read-private",
].join(" ");

export async function GET(request: NextRequest) {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const redirectUri = normalizeDevSpotifyUrl(
    process.env.SPOTIFY_REDIRECT_URI ?? DEFAULT_REDIRECT_URI,
  );

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
  if (request.nextUrl.searchParams.get("show_dialog") === "1") {
    params.set("show_dialog", "true");
  }

  return NextResponse.redirect(`${SPOTIFY_AUTHORIZE_URL}?${params.toString()}`);
}

function normalizeDevSpotifyUrl(value: string): string {
  if (process.env.NODE_ENV === "production") {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.hostname === "localhost" && url.port === "5000") {
      url.hostname = "127.0.0.1";
      return url.toString();
    }
    return value;
  } catch {
    return value;
  }
}
