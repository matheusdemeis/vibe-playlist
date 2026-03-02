import { cookies } from "next/headers";
import { NextResponse } from "next/server";

const ACCESS_TOKEN_COOKIE_NAME = "spotify_access_token";
const SCOPES_COOKIE_NAME = "spotify_access_scopes";

export async function GET() {
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  const scopeValue = cookieStore.get(SCOPES_COOKIE_NAME)?.value ?? "";
  const scopes = scopeValue.split(" ").map((scope) => scope.trim()).filter(Boolean);

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
