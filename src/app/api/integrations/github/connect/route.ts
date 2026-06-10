import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/user";

export const runtime = "nodejs";

/**
 * GitHub OAuth — begin authorization (PR 6c).
 *
 * Dedicated GitHub route (overrides the generic [provider] route for github
 * only, so other connectors are untouched). Sets a CSRF state cookie and
 * redirects to GitHub. Reads GITHUB_OAUTH_CLIENT_ID/SECRET from env at call
 * time — no secrets in code; dormant until the founder sets them.
 */

const STATE_COOKIE = "gh_oauth_state";
const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const SCOPES = ["read:user", "repo"];

function base(): string {
  return (env.siteUrl || "http://localhost:3000").replace(/\/$/, "");
}

export async function GET() {
  const b = base();
  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  if (!clientId || !process.env.GITHUB_OAUTH_CLIENT_SECRET) {
    return NextResponse.redirect(`${b}/settings/connections?error=unconfigured&provider=github`);
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${b}/login?redirect=/settings/connections`);
  }

  const nonce = crypto.randomUUID();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: `${b}/api/integrations/github/callback`,
    scope: SCOPES.join(" "),
    state: nonce,
    allow_signup: "false",
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
