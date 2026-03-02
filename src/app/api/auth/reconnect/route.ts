import { NextResponse } from "next/server";

const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
const SCOPES_COOKIE_NAME = "spotify_access_scopes";
const APP_URL = "http://127.0.0.1:5000";

export async function GET() {
  const response = NextResponse.redirect(`${APP_URL}/api/auth/login?show_dialog=1`);
  response.cookies.delete(ACCESS_TOKEN_COOKIE_NAME);
  response.cookies.delete(SCOPES_COOKIE_NAME);
  return response;
}
