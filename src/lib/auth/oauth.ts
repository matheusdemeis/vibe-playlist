import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getAppBaseUrl, getSpotifyRedirectUri, safeReturnTo } from "../config/app-url";
import { REQUIRED_PLAYLIST_SCOPES } from "./spotify-session";
import { sealCookie, secureCookieOptions, unsealCookie } from "./sealed-cookie";

export const OAUTH_COOKIE_NAME = "vibeplay_spotify_oauth";
const OAUTH_COOKIE_PURPOSE = "spotify-oauth-v1";
const OAUTH_LIFETIME_SECONDS = 10 * 60;

type OAuthAttempt = { state: string; verifier: string; returnTo: string; expiresAt: number };

export async function startSpotifyLogin(request: NextRequest, forceConsent = false) {
  try {
    const clientId = process.env.SPOTIFY_CLIENT_ID;
    if (!clientId || !process.env.SPOTIFY_CLIENT_SECRET) throw new Error("Missing OAuth configuration.");
    const redirectUri = getSpotifyRedirectUri();
    const attempt: OAuthAttempt = {
      state: randomBytes(32).toString("base64url"),
      verifier: randomBytes(64).toString("base64url"),
      returnTo: safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
      expiresAt: Date.now() + OAUTH_LIFETIME_SECONDS * 1000,
    };
    const params = new URLSearchParams({
      client_id: clientId, response_type: "code", redirect_uri: redirectUri,
      scope: [...REQUIRED_PLAYLIST_SCOPES, "user-read-private"].join(" "),
      state: attempt.state, code_challenge_method: "S256",
      code_challenge: createHash("sha256").update(attempt.verifier).digest("base64url"),
    });
    if (forceConsent || request.nextUrl.searchParams.get("show_dialog") === "1") params.set("show_dialog", "true");
    const response = NextResponse.redirect(`https://accounts.spotify.com/authorize?${params}`);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(OAUTH_COOKIE_NAME, sealCookie(attempt, OAUTH_COOKIE_PURPOSE),
      secureCookieOptions(OAUTH_LIFETIME_SECONDS));
    return response;
  } catch {
    return NextResponse.json({ error: "Spotify login is not configured. Please contact the app owner.", code: "configuration_error" },
      { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

export async function consumeOAuthAttempt(state: string | null): Promise<OAuthAttempt | null> {
  const store = await cookies();
  const value = store.get(OAUTH_COOKIE_NAME)?.value;
  store.set(OAUTH_COOKIE_NAME, "", secureCookieOptions(0));
  store.set("spotify_auth_state", "", secureCookieOptions(0));
  if (!value || !state) return null;
  const data = unsealCookie(value, OAUTH_COOKIE_PURPOSE);
  if (!data || typeof data !== "object") return null;
  const attempt = data as Partial<OAuthAttempt>;
  if (typeof attempt.state !== "string" || typeof attempt.verifier !== "string" ||
    typeof attempt.returnTo !== "string" || typeof attempt.expiresAt !== "number" ||
    !Number.isFinite(attempt.expiresAt) || attempt.expiresAt <= Date.now()) return null;
  const expected = Buffer.from(attempt.state);
  const actual = Buffer.from(state);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return { ...attempt, returnTo: safeReturnTo(attempt.returnTo) } as OAuthAttempt;
}

export function authRedirect(request: NextRequest, returnTo: string, error?: string) {
  let base: string;
  try {
    base = getAppBaseUrl();
  } catch {
    base = request.nextUrl.origin;
  }
  const target = new URL(safeReturnTo(returnTo), base);
  if (error) target.searchParams.set("auth_error", error);
  const response = NextResponse.redirect(target);
  response.headers.set("Cache-Control", "no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
