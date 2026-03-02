import { NextResponse } from "next/server";
import { getSpotifySession } from "@/lib/auth/spotify-session";

const SPOTIFY_API_BASE = "https://api.spotify.com/v1";

type SpotifyMeResponse = {
  id?: string;
};

export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const { accessToken, grantedScopes } = await getSpotifySession();
  const hasAccessToken = Boolean(accessToken);
  const tokenPrefix = accessToken ? accessToken.slice(0, 8) : null;

  if (!accessToken) {
    return NextResponse.json({
      hasAccessToken,
      grantedScopes,
      tokenPrefix,
      meStatus: null,
      meId: null,
      playlistsStatus: null,
    });
  }

  const [meResponse, playlistsResponse] = await Promise.all([
    fetch(`${SPOTIFY_API_BASE}/me`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }),
    fetch(`${SPOTIFY_API_BASE}/me/playlists?limit=1`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    }),
  ]);

  let meId: string | null = null;
  try {
    const meBody = (await meResponse.json()) as SpotifyMeResponse;
    meId = typeof meBody.id === "string" ? meBody.id : null;
  } catch {
    meId = null;
  }

  return NextResponse.json({
    hasAccessToken,
    grantedScopes,
    tokenPrefix,
    meStatus: meResponse.status,
    meId,
    playlistsStatus: playlistsResponse.status,
  });
}
