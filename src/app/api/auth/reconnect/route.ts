import { NextRequest } from "next/server";
import { startSpotifyLogin } from "../../../../lib/auth/oauth";

export async function GET(request: NextRequest) {
  // Keep the current session usable if the user cancels reauthorization.
  return startSpotifyLogin(request, true);
}
