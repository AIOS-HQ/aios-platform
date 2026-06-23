import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/user";

export const runtime = "nodejs";

/**
 * LinkedIn OAuth — begin authorization (Sign In with LinkedIn / OpenID Connect).
 *
 * Dedicated LinkedIn route (overrides the generic [provider] route for linkedin
 * only, so other connectors are untouched — same pattern as GitHub). Sets a CSRF
 * state cookie and redirects to LinkedIn. Reads LINKEDIN_CLIENT_ID/SECRET from
 * env at call time — no secrets in code; dormant until the founder sets them.
 */

const STATE_COOKIE = "li_oauth_state";
const AUTHORIZE_URL = "https://www.linkedin.com/oauth/v2/authorization";
// OpenID Connect sign-in scopes — identity only. Publishing scopes
// (e.g. w_member_social) require a separately approved LinkedIn product and are
// intentionally NOT requested here, so authorization never fails on an
// unapproved scope.
const SCOPES = ["openid", "profile", "email"];

function base(): string {
  // Prefer the configured public app URL. In production we must NEVER fall back
  // to localhost (that produced the broken OAuth redirect_uri); localhost is for
  // local development only. The callback redirect_uri must match this exactly.
  const configured = process.env.NEXT_PUBLIC_APP_URL || env.siteUrl;
  if (process.env.NODE_ENV === "production") {
    return (configured || "https://aios-platform-omega.vercel.app").replace(/\/$/, "");
  }
  return (configured || "http://localhost:3000").replace(/\/$/, "");
}

export async function GET() {
  const b = base();
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  if (!clientId || !process.env.LINKEDIN_CLIENT_SECRET) {
    return NextResponse.redirect(`${b}/settings/connections?error=unconfigured&provider=linkedin`);
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${b}/login?redirect=/settings/connections`);
  }

  const nonce = crypto.randomUUID();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: `${b}/api/integrations/linkedin/callback`,
    scope: SCOPES.join(" "),
    state: nonce,
  });

  const res = NextResponse.redirect(`${AUTHORIZE_URL}?${params.toString()}`);
  res.cookies.set(STATE_COOKIE, `${user.id}:${nonce}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
