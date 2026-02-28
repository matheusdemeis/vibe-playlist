import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import {
  generatePlaylistTracks,
  type GeneratePlaylistTracksInput,
} from "@/lib/playlist/generate";

const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;

  if (!accessToken) {
    return NextResponse.json(
      { error: "You are not connected to Spotify. Please log in first." },
      { status: 401 },
    );
  }

  const body = (await request.json()) as GeneratePlaylistTracksInput;

  try {
    const result = await generatePlaylistTracks(accessToken, body);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Could not generate playlist recommendations right now.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
