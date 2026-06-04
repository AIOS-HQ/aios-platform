import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";

/** Routes that require an authenticated session. */
const PROTECTED_PREFIXES = ["/harmony", "/settings"];
/** Public auth routes an authenticated user should be bounced away from. */
const AUTH_ROUTES = ["/login", "/signup", "/reset-password"];

/**
 * Refreshes the Supabase auth session on every request (writing refreshed
 * cookies onto the response) and enforces route protection.
 *
 * If Supabase isn't configured yet, it is a no-op so the app still runs.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!env.supabaseUrl || !env.supabaseAnonKey) {
    return response;
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
        response = NextResponse.next({ request });
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
    return NextResponse.redirect(url);
  }

  if (user && isAuthRoute) {
    const url = request.nextUrl.clone();
    url.pathname = "/harmony";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}
