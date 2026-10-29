import { NextRequest } from "next/server";
import { getSpotifyRedirectUri } from "../../../../lib/config/app-url";
import { authRedirect, consumeOAuthAttempt } from "../../../../lib/auth/oauth";
import { requestSpotifyToken, saveSpotifySession } from "../../../../lib/auth/spotify-session";

export async function GET(request: NextRequest) {
  let returnTo = "/generate";
  try {
    const attempt = await consumeOAuthAttempt(request.nextUrl.searchParams.get("state"));
    if (!attempt) return authRedirect(request, returnTo, "invalid_state");
    returnTo = attempt.returnTo;
    if (request.nextUrl.searchParams.has("error")) {
      return authRedirect(request, returnTo,
        request.nextUrl.searchParams.get("error") === "access_denied" ? "access_denied" : "token_exchange_failed");
    }
    const code = request.nextUrl.searchParams.get("code");
    if (!code) return authRedirect(request, returnTo, "token_exchange_failed");
    const token = await requestSpotifyToken(new URLSearchParams({
      grant_type: "authorization_code", code, redirect_uri: getSpotifyRedirectUri(),
      code_verifier: attempt.verifier,
    }));
    await saveSpotifySession(token);
    return authRedirect(request, returnTo);
  } catch {
    return authRedirect(request, returnTo, "token_exchange_failed");
  }
}
