import { NextRequest, NextResponse } from "next/server";

const publicPaths = ["/login", "/register", "/api/auth"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow public paths
  if (publicPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check for session cookie (actual validation happens per-route via auth.api.getSession)
  // Check for session cookie (prefix matches advanced.cookiePrefix in auth config)
  const sessionCookie = request.cookies.get("moirai.session_token") || request.cookies.get("better-auth.session_token");
  if (!sessionCookie?.value || sessionCookie.value.length < 10) {
    const loginUrl = new URL("/login", request.url);
    // Only allow relative callback URLs to prevent open redirects
    if (pathname.startsWith("/")) {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
