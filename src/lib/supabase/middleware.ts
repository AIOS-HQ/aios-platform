import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { safeRedirectPath } from "@/lib/auth/redirects";

/** Routes that require an authenticated session. */
const PROTECTED_PREFIXES = ["/harmony", "/settings"];
/** Public auth routes an authenticated user should be bounced away from. */
const AUTH_ROUTES = ["/login", "/signup", "/reset-password"];

/**
 * Per-request security headers threaded in from `middleware.ts`. All optional
 * and purely additive — when absent, session handling is byte-for-byte
 * unchanged.
 */
export interface SecurityHeaders {
  /** Per-request CSP nonce, exposed to the app via the `x-nonce` request header. */
  nonce?: string;
  /** Full CSP string. Set on the REQUEST so Next.js nonces its own <script> tags. */
  csp?: string;
  /** Response header name: "Content-Security-Policy", its "-Report-Only" variant, or null. */
  cspHeaderName?: string | null;
  /** Optional `Reporting-Endpoints` response header value. */
  reportingEndpoints?: string;
}

/**
 * Refreshes the Supabase auth session on every request (writing refreshed
 * cookies onto the response) and enforces route protection.
 *
 * If Supabase isn't configured yet, it is a no-op so the app still runs.
 *
 * When `security` is supplied, a per-request CSP nonce is exposed to the app
 * (and to Next.js, so it nonces its scripts) and the CSP header is attached to
 * every outgoing response. This is additive: the auth flow is untouched.
 */
export async function updateSession(
  request: NextRequest,
  security?: SecurityHeaders,
) {
  // Expose the current pathname to Server Components (read via `headers()`),
  // used by the Harmony hub layout for plan/hub gating. Additive only.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-pathname", request.nextUrl.pathname);
  if (security?.nonce) requestHeaders.set("x-nonce", security.nonce);
  // Next.js extracts the nonce from the request's `content-security-policy`
  // header to nonce its <script> tags. We set the (internal, never-sent-to-
  // browser) request header regardless of mode so scripts are nonced even while
  // the RESPONSE is report-only — keeping report-only clean and the enforce flip safe.
  if (security?.csp) requestHeaders.set("content-security-policy", security.csp);

  /** Attach the chosen CSP (+ reporting) header to an outgoing response. */
  const withSecurity = (res: NextResponse): NextResponse => {
    if (security?.csp && security.cspHeaderName) {
      res.headers.set(security.cspHeaderName, security.csp);
      if (security.reportingEndpoints) {
        res.headers.set("Reporting-Endpoints", security.reportingEndpoints);
      }
    }
    return res;
  };

  let response = NextResponse.next({ request: { headers: requestHeaders } });

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return withSecurity(response);
  }

  const supabase = createServerClient(env.supabaseUrl, env.supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        response = NextResponse.next({ request: { headers: requestHeaders } });
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options),
        );
      },
    },
  });

  // IMPORTANT: getUser() revalidates the token with Supabase Auth.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("redirect", pathname);
    return withSecurity(NextResponse.redirect(url));
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = safeRedirectPath(
      request.nextUrl.searchParams.get("redirect") ?? request.nextUrl.searchParams.get("next"),
    );
    url.search = "";
    return withSecurity(NextResponse.redirect(url));
  }

  return withSecurity(response);
}
