import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.next();
  }

  const { hostname, port, pathname, search } = request.nextUrl;
  if (!hostname.startsWith("localhost")) {
    return NextResponse.next();
  }

  if (hostname === "127.0.0.1") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/") || pathname.startsWith("/_next/") || pathname === "/favicon.ico") {
    return NextResponse.next();
  }

  if (pathname.startsWith("/api/auth/callback")) {
    return NextResponse.next();
  }

  if (port && port !== "5000") {
    return NextResponse.next();
  }

  const redirectUrl = new URL(request.url);
  redirectUrl.hostname = "127.0.0.1";
  redirectUrl.port = port || "5000";

  if (redirectUrl.href === request.url) {
    return NextResponse.next();
  }

  if (process.env.NODE_ENV === "development") {
    console.log("[DEV][proxy] redirect localhost -> 127.0.0.1", {
      from: `${hostname}:${port || "5000"}${pathname}${search}`,
      to: `${redirectUrl.hostname}:${redirectUrl.port}${pathname}${search}`,
    });
  }

  return NextResponse.redirect(redirectUrl, 307);
}

export const config = {
  matcher: ["/:path*"],
};
