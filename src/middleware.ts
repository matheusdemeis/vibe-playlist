import { NextRequest, NextResponse } from "next/server";

const DEV_LOCALHOST_HOST = "localhost:5000";
const DEV_CANONICAL_ORIGIN = "http://127.0.0.1:5000";

export function middleware(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.next();
  }

  if (request.nextUrl.host !== DEV_LOCALHOST_HOST) {
    return NextResponse.next();
  }

  const redirectUrl = new URL(request.nextUrl.pathname + request.nextUrl.search, DEV_CANONICAL_ORIGIN);
  return NextResponse.redirect(redirectUrl, 307);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
