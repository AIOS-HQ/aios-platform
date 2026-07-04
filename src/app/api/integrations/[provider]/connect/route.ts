import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/user";
import { getConnectorDefinition } from "@/lib/integrations/registry";
import { isDevConfigured } from "@/lib/integrations/registry-status";
import { buildAuthorizeUrl } from "@/lib/integrations/config";

export const runtime = "nodejs";

const STATE_COOKIE = "intg_oauth_state";

function base(): string {
  return (env.siteUrl || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Universal OAuth connect endpoint (Group A2).
 *
 * Resolves the provider from the unified connector registry — so EVERY
 * OAuth-family connector inherits one connect flow with no per-provider code.
 * Enforces the dev_configured invariant server-side: an OAuth handshake is
 * never started for a provider whose developer configuration is incomplete
 * (it would only fail at the provider). Sets a CSRF state cookie and redirects.
 *
 * Providers with a dedicated route (e.g. github, linkedin) shadow this dynamic
 * route via Next.js static-over-dynamic precedence and are unaffected.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: pid } = await params;
  const b = base();
  const def = getConnectorDefinition(pid);
  if (!def) {
    return NextResponse.redirect(`${b}/settings/integrations?error=unknown`);
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${b}/login?redirect=/settings/integrations`);
  }

  if (def.auth !== "oauth2") {
    return NextResponse.redirect(`${b}/settings/integrations?error=not_oauth&provider=${pid}`);
  }
  if (!def.authorizable) {
    return NextResponse.redirect(`${b}/settings/integrations?error=not_supported&provider=${pid}`);
  }
  if (!isDevConfigured(def)) {
    return NextResponse.redirect(`${b}/settings/integrations?error=unconfigured&provider=${pid}`);
  }

  const nonce = crypto.randomUUID();
  const authorizeUrl = buildAuthorizeUrl(def, nonce);
  if (!authorizeUrl) {
    return NextResponse.redirect(`${b}/settings/integrations?error=unconfigured&provider=${pid}`);
  }

  const res = NextResponse.redirect(authorizeUrl);
  res.cookies.set(STATE_COOKIE, `${pid}:${user.id}:${nonce}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  return res;
}
