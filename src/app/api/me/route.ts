import { NextResponse } from "next/server";
import { getSpotifyAccessToken } from "@/lib/auth/spotify-session";

export async function GET() {
  const accessToken = await getSpotifyAccessToken();
  return NextResponse.json({ connected: Boolean(accessToken) });
}
