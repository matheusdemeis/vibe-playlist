import { NextResponse } from "next/server";
import { getAppBaseUrl } from "@/lib/config/app-url";

const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
const SCOPES_COOKIE_NAME = "spotify_access_scope_raw";
const LEGACY_SCOPES_COOKIE_NAME = "spotify_access_scopes";

export async function GET() {
  const response = NextResponse.redirect(`${getAppBaseUrl()}/api/auth/login?show_dialog=1`);
  response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
  response.cookies.delete(SCOPES_COOKIE_NAME);
  response.cookies.delete(LEGACY_SCOPES_COOKIE_NAME);
  return response;
}
