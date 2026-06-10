import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { upsertConnection } from "@/lib/integrations/connections";

export const runtime = "nodejs";

/**
 * GitHub OAuth — callback (PR 6c).
 *
 * Verifies the CSRF state cookie, exchanges the code for an access token, stores
 * the connection owner-scoped via the service-role client (token columns never
 * exposed to the browser), and returns to the connections dashboard. GitHub
 * OAuth-App tokens are long-lived (no refresh token), so expires_at is null.
 */

const STATE_COOKIE = "gh_oauth_state";
const TOKEN_URL = "https://github.com/login/oauth/access_token";

function base(): string {
  return (env.siteUrl || "http://localhost:3000").replace(/\/$/, "");
}

export async function GET(req: Request) {
  const b = base();
  const fail = (reason: string) =>
    NextResponse.redirect(`${b}/settings/connections?error=${reason}&provider=github`);

  const clientId = process.env.GITHUB_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GITHUB_OAUTH_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("unconfigured");

  const url = new URL(req.url);
  if (url.searchParams.get("error")) return fail("denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const cookieStore = await cookies();
  const raw = cookieStore.get(STATE_COOKIE)?.value ?? "";
  const [cUid, cNonce] = raw.split(":");
  if (!code || !state || !raw || cNonce !== state || !cUid) return fail("state");

  // Exchange the authorization code for an access token.
  let accessToken: string | null = null;
  let scope: string | null = null;
  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        redirect_uri: `${b}/api/integrations/github/callback`,
      }).toString(),
    });
    if (r.ok) {
      const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      accessToken = typeof json.access_token === "string" ? json.access_token : null;
      scope = typeof json.scope === "string" ? json.scope : null;
    }
  } catch {
    return fail("exchange");
  }
  if (!accessToken) return fail("exchange");

  // Best-effort: fetch the GitHub login for display (external_account).
  let login: string | null = null;
  try {
    const u = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (u.ok) {
      const j = (await u.json().catch(() => ({}))) as { login?: string };
      login = typeof j.login === "string" ? j.login : null;
    }
  } catch {
    // ignore — display name is non-essential
  }

  await upsertConnection({
    user_id: cUid,
    provider: "github",
    status: "connected",
    scopes: scope ?? "read:user repo",
    external_account: login,
    access_token: accessToken,
    refresh_token: null,
    expires_at: null,
  });

  const res = NextResponse.redirect(`${b}/settings/connections?connected=github`);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
