import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/user";
import { getIntegration } from "@/lib/integrations/catalog";
import { buildAuthorizeUrl, isProviderConfigured } from "@/lib/integrations/config";

export const runtime = "nodejs";

const STATE_COOKIE = "intg_oauth_state";

function base(): string {
  return (env.siteUrl || "http://localhost:3000").replace(/\/$/, "");
}

/** Begin an OAuth connection: set a CSRF state cookie and redirect to the provider. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: pid } = await params;
  const b = base();
  const provider = getIntegration(pid);
  if (!provider) {
    return NextResponse.redirect(`${b}/settings/integrations?error=unknown`);
  }

  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.redirect(`${b}/login?redirect=/settings/integrations`);
  }

  if (provider.auth !== "oauth2") {
    return NextResponse.redirect(`${b}/settings/integrations?error=not_oauth&provider=${pid}`);
  }
  if (!isProviderConfigured(provider)) {
    return NextResponse.redirect(`${b}/settings/integrations?error=unconfigured&provider=${pid}`);
  }

  const nonce = crypto.randomUUID();
  const authorizeUrl = buildAuthorizeUrl(provider, nonce);
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
