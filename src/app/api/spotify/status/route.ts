import { NextResponse } from "next/server";
import {
  getSpotifySession,
  hasGrantedScopes,
  REQUIRED_PLAYLIST_SCOPES,
} from "@/lib/auth/spotify-session";

export async function GET() {
  const { accessToken, grantedScopes } = await getSpotifySession();
  const missingRequiredScopes = REQUIRED_PLAYLIST_SCOPES.filter(
    (scope) => !grantedScopes.includes(scope),
  );

  if (process.env.NODE_ENV === "development") {
    return NextResponse.json({
      connected: Boolean(accessToken),
      grantedScopes,
      requiredScopes: REQUIRED_PLAYLIST_SCOPES,
      hasRequiredPlaylistScopes: hasGrantedScopes(grantedScopes, REQUIRED_PLAYLIST_SCOPES),
      missingRequiredScopes,
    });
  }

  return NextResponse.json({
    connected: Boolean(accessToken),
  });
}
