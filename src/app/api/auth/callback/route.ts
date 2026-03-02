import { Buffer } from "node:buffer";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const STATE_COOKIE_NAME = "spotify_auth_state";
const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
const TOKEN_SCOPE_RAW_COOKIE_NAME = "spotify_access_scope_raw";
const DEFAULT_REDIRECT_URI = "http://127.0.0.1:5000/api/auth/callback";
const DEFAULT_APP_URL = "http://127.0.0.1:5000";

type SpotifyTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
  scope?: string;
};

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const cookieStore = await cookies();
  const storedState = cookieStore.get(STATE_COOKIE_NAME)?.value;

  if (!code || !state || !storedState || state !== storedState) {
    console.log("Spotify OAuth state mismatch", {
      hasCode: Boolean(code),
      hasState: Boolean(state),
      hasStoredState: Boolean(storedState),
    });
    return NextResponse.json({ error: "Invalid OAuth state." }, { status: 400 });
  }

  cookieStore.delete(STATE_COOKIE_NAME);

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const redirectUri = normalizeDevSpotifyUrl(
    process.env.SPOTIFY_REDIRECT_URI ?? DEFAULT_REDIRECT_URI,
  );
  const appUrl = normalizeDevSpotifyUrl(process.env.APP_URL ?? DEFAULT_APP_URL);

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: "Missing Spotify OAuth environment variables." },
      { status: 500 },
    );
  }

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${credentials}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!tokenResponse.ok) {
    return NextResponse.json({ error: "Token exchange failed." }, { status: 502 });
  }

  const data = (await tokenResponse.json()) as SpotifyTokenResponse;
  if (process.env.NODE_ENV === "development") {
    console.log("Spotify token exchange metadata", {
      scope: data.scope ?? "",
      token_type: data.token_type,
      expires_in: data.expires_in,
    });
  }
  const grantedScopes =
    typeof data.scope === "string"
      ? data.scope
          .split(" ")
          .map((scope) => scope.trim())
          .filter(Boolean)
      : [];
  const response = NextResponse.redirect(appUrl);

  response.cookies.set(ACCESS_TOKEN_COOKIE_NAME, data.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: data.expires_in,
  });
  response.cookies.set(TOKEN_SCOPE_RAW_COOKIE_NAME, grantedScopes.join(" "), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: data.expires_in,
  });

  return response;
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
