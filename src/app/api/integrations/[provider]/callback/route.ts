import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { getIntegration } from "@/lib/integrations/catalog";
import { exchangeCodeForToken } from "@/lib/integrations/config";
import { upsertConnection } from "@/lib/integrations/connections";

export const runtime = "nodejs";

const STATE_COOKIE = "intg_oauth_state";

function base(): string {
  return (env.siteUrl || "http://localhost:3000").replace(/\/$/, "");
}

/** OAuth callback: verify CSRF state, exchange the code, persist the connection. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: pid } = await params;
  const b = base();
  const fail = (reason: string) =>
    NextResponse.redirect(`${b}/settings/integrations?error=${reason}&provider=${pid}`);

  const provider = getIntegration(pid);
  if (!provider) return fail("unknown");

  const url = new URL(req.url);
  if (url.searchParams.get("error")) return fail("denied");

  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const raw = cookieStore.get(STATE_COOKIE)?.value ?? "";
  const [cPid, cUid, cNonce] = raw.split(":");

  if (!code || !state || !raw || cPid !== pid || cNonce !== state || !cUid) {
    return fail("state");
  }

  const token = await exchangeCodeForToken(provider, code);
  if (!token || !token.accessToken) return fail("exchange");

  await upsertConnection({
    user_id: cUid,
    provider: pid,
    status: "connected",
    scopes: token.scope ?? (provider.scopes ?? []).join(" "),
    external_account: null,
    access_token: token.accessToken,
    refresh_token: token.refreshToken,
    expires_at: token.expiresIn
      ? new Date(Date.now() + token.expiresIn * 1000).toISOString()
      : null,
  });

  const res = NextResponse.redirect(`${b}/settings/integrations?connected=${pid}`);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
