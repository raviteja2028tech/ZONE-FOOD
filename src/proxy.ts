import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

/**
 * Coarse page gate (Next.js 16 "proxy", formerly middleware): signed-out visitors are redirected to /login and
 * signed-in users are kept out of /login and /register. This is only a convenience - it is NOT authorisation.
 * Every page re-checks the user and permission on the server, and every API route enforces its own permission.
 */
const PUBLIC_PAGES = ["/login", "/register"];

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const signedIn = (await verifySession(request.cookies.get(SESSION_COOKIE)?.value)) !== null;
  const isPublic = PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"));

  if (!signedIn && !isPublic) {
    const url = new URL("/login", request.url);
    const response = NextResponse.redirect(url);
    if (request.cookies.has(SESSION_COOKIE)) response.cookies.delete(SESSION_COOKIE); // expired/tampered cookie
    return response;
  }
  if (signedIn && isPublic) return NextResponse.redirect(new URL("/", request.url));
  return NextResponse.next();
}

export const config = {
  // Pages only: APIs answer 401/403 themselves; static assets and images are excluded.
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|webp|ico|css|js|map|woff2?)$).*)"],
};
