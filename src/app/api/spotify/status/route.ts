import { NextResponse } from "next/server";
import { getSpotifySession } from "@/lib/auth/spotify-session";

export async function GET() {
  const { accessToken, scopes } = await getSpotifySession();

  if (process.env.NODE_ENV === "development") {
    return NextResponse.json({
      connected: Boolean(accessToken),
      scopes,
    });
  }

  return NextResponse.json({
    connected: Boolean(accessToken),
  });
}
