import { NextRequest } from "next/server";
import { startSpotifyLogin } from "../../../../lib/auth/oauth";

export async function GET(request: NextRequest) {
  return startSpotifyLogin(request);
}
