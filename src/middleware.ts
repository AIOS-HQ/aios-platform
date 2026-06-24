import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { clientIp, rateLimitDistributed } from "@/lib/security/rate-limit";

/**
 * Auth/credential POST surfaces (form posts or server actions) worth throttling
 * by IP to blunt credential-stuffing and password-reset abuse.
 */
const AUTH_POST_PATHS = new Set(["/login", "/signup", "/reset-password"]);

/**
 * True for the unauthenticated / OAuth edges where IP rate limiting adds real
 * protection: the OAuth callback (`/auth/*`), integration connect/callback
 * (`/api/integrations/*`), the public waitlist form, and auth credential POSTs.
 * The authenticated app surface is intentionally NOT throttled here — it is
 * guarded by Supabase auth + RLS, and a global mutation limiter in middleware
 * would risk locking out legitimate founder activity.
 */
function shouldRateLimit(request: NextRequest): boolean {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/auth") || pathname.startsWith("/api/integrations")) {
    return true;
  }
  if (request.method === "POST") {
    if (pathname === "/api/waitlist") return true;
    if (AUTH_POST_PATHS.has(pathname)) return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  if (shouldRateLimit(request)) {
    const ip = clientIp(request);
    // 20 requests / minute / IP across the auth+OAuth surface. Generous for a
    // human (a few logins/connects) but stops automated abuse. Distributed via
    // Upstash when configured; fail-open to per-instance throttling otherwise.
    const result = await rateLimitDistributed(`auth:${ip}`, {
      limit: 20,
      windowMs: 60_000,
    });
    if (!result.ok) {
      const retryAfter = Math.max(
        1,
        Math.ceil((result.resetAt - Date.now()) / 1000),
      );
      return new NextResponse("Too Many Requests", {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(result.resetAt),
        },
      });
    }
  }

  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all routes except static assets and image files so the auth
     * session cookie is refreshed on every page/route handler request.
     */
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
