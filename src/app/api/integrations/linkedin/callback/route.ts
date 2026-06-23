import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { upsertConnection } from "@/lib/integrations/connections";

export const runtime = "nodejs";

/**
 * LinkedIn OAuth — callback (Sign In with LinkedIn / OpenID Connect).
 *
 * Verifies the CSRF state cookie, exchanges the code for an access token, fetches
 * the member's OpenID Connect profile (userinfo) for the display identity, and
 * stores the connection owner-scoped via the service-role client (token columns
 * are never exposed to the browser). LinkedIn access tokens expire, so we persist
 * the computed expiry; no refresh token is issued under the standard sign-in
 * product, so refresh_token is null.
 */

const STATE_COOKIE = "li_oauth_state";
const TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const USERINFO_URL = "https://api.linkedin.com/v2/userinfo";

function base(): string {
  // Prefer the configured public app URL. In production we must NEVER fall back
  // to localhost (that produced the broken OAuth redirect_uri); localhost is for
  // local development only. The callback redirect_uri must match the connect
  // route exactly, so both derive from this same helper.
  const configured = process.env.NEXT_PUBLIC_APP_URL || env.siteUrl;
  if (process.env.NODE_ENV === "production") {
    return (configured || "https://aios-platform-omega.vercel.app").replace(/\/$/, "");
  }
  return (configured || "http://localhost:3000").replace(/\/$/, "");
}

export async function GET(req: Request) {
  const b = base();
  const fail = (reason: string) =>
    NextResponse.redirect(`${b}/settings/connections?error=${reason}&provider=linkedin`);

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
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
  let expiresIn: number | null = null;
  try {
    const r = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: `${b}/api/integrations/linkedin/callback`,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
    });
    if (r.ok) {
      const json = (await r.json().catch(() => ({}))) as Record<string, unknown>;
      accessToken = typeof json.access_token === "string" ? json.access_token : null;
      scope = typeof json.scope === "string" ? json.scope : null;
      expiresIn = typeof json.expires_in === "number" ? json.expires_in : null;
    }
  } catch {
    return fail("exchange");
  }
  if (!accessToken) return fail("exchange");

  // Best-effort: fetch the OpenID Connect profile for the display identity.
  let identity: string | null = null;
  try {
    const u = await fetch(USERINFO_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (u.ok) {
      const j = (await u.json().catch(() => ({}))) as { name?: string; email?: string };
      identity =
        (typeof j.name === "string" && j.name) ||
        (typeof j.email === "string" && j.email) ||
        null;
    }
  } catch {
    // ignore — display name is non-essential
  }

  const expiresAt =
    expiresIn && expiresIn > 0
      ? new Date(Date.now() + expiresIn * 1000).toISOString()
      : null;

  await upsertConnection({
    user_id: cUid,
    provider: "linkedin",
    status: "connected",
    scopes: scope ?? "openid profile email",
    external_account: identity,
    access_token: accessToken,
    refresh_token: null,
    expires_at: expiresAt,
  });

  const res = NextResponse.redirect(`${b}/settings/connections?connected=linkedin`);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
