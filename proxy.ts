import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SESSION_COOKIE_NAME, validateSession } from "@/lib/outreach/auth/session";

// `middleware.ts` was renamed to `proxy.ts` in Next.js 16
// (node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md).

// Exact matches: /outreach/setup and /outreach/login are single pages with
// no sub-routes, so an exact match is both sufficient and safer than a
// prefix - `startsWith("/outreach/setup")` would also match a future route
// like `/outreach/setupxyz`, an unanchored-prefix bypass a security review
// caught. /outreach/unsubscribe/[token] genuinely has a dynamic sub-segment,
// so it alone needs a real (trailing-slash-anchored) prefix match.
const PUBLIC_EXACT_PATHS = new Set([
  "/outreach/setup",
  "/outreach/login",
  "/api/outreach/setup",
  "/api/outreach/login",
]);
const PUBLIC_PATH_PREFIXES = ["/outreach/unsubscribe/"];

/**
 * Gates every /outreach and /api/outreach route behind a real per-user
 * session. Both the setup/login *pages* and their *API routes* must stay
 * reachable while logged out - the API routes are how bootstrap and login
 * actually happen, so gating them here would be a hard lockout. Each still
 * guards itself server-side (setup 409s once a user exists; login just
 * rejects bad credentials), so leaving them public here is safe.
 * /outreach/unsubscribe is clicked by recipients, not the operator, and is
 * protected by its own signed token instead.
 */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_EXACT_PATHS.has(pathname) || PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  const user = token ? await validateSession(token) : null;

  if (!user) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    const loginUrl = new URL("/outreach/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/outreach/:path*", "/api/outreach/:path*"],
};
