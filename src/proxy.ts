import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.next();
  }

  if (request.nextUrl.hostname !== "localhost" || request.nextUrl.port !== "5000") {
    return NextResponse.next();
  }

  const redirectUrl = new URL(request.url);
  redirectUrl.hostname = "127.0.0.1";

  if (redirectUrl.href === request.url) {
    return NextResponse.next();
  }

  return NextResponse.redirect(redirectUrl, 307);
}

export const config = {
  matcher: ["/((?!_next|favicon.ico).*)"],
};
