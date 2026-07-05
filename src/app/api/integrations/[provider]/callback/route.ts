import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { env } from "@/lib/env";
import { getConnectorDefinition } from "@/lib/integrations/registry";
import { exchangeCodeForToken } from "@/lib/integrations/config";
import { upsertConnection } from "@/lib/integrations/connections";
import { resolveOAuthCallback } from "@/lib/integrations/oauth-callback";

export const runtime = "nodejs";

const STATE_COOKIE = "intg_oauth_state";

function base(): string {
  return (env.siteUrl || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * Universal OAuth callback endpoint (Group A2).
 *
 * Resolves the provider from the unified connector registry, so every
 * OAuth-family connector inherits one callback: verify CSRF state, exchange the
 * authorization code, and persist the connection (tokens encrypted at rest).
 *
 * Exception-safe: the flow runs through `resolveOAuthCallback`, which maps ANY
 * failure — including a throwing token write (e.g. a missing production env var
 * surfaced by the admin client, or fail-closed token encryption) — to a typed
 * `?error=<reason>` redirect and logs the real cause, so the callback NEVER
 * returns an HTTP 500. `?error=server` means "check the server logs" (the
 * underlying error is logged there); `?error=persist` means the write returned
 * false (e.g. service-role client unavailable).
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: pid } = await params;
  const b = base();
  const fail = (reason: string) =>
    NextResponse.redirect(`${b}/settings/integrations?error=${reason}&provider=${pid}`);

  const def = getConnectorDefinition(pid);
  if (!def) return fail("unknown");

  const url = new URL(req.url);
  const cookieStore = await cookies();
  const raw = cookieStore.get(STATE_COOKIE)?.value ?? "";

  const result = await resolveOAuthCallback(
    {
      providerKnown: true,
      providerId: pid,
      hasProviderError: Boolean(url.searchParams.get("error")),
      code: url.searchParams.get("code"),
      state: url.searchParams.get("state"),
      cookieRaw: raw,
    },
    {
      exchange: (code) => exchangeCodeForToken(def, code),
      persist: (input) =>
        upsertConnection({
          user_id: input.userId,
          provider: input.providerId,
          status: "connected",
          scopes: input.scope ?? (def.scopes ?? []).join(" "),
          external_account: null,
          access_token: input.accessToken,
          refresh_token: input.refreshToken,
          expires_at: input.expiresIn
            ? new Date(Date.now() + input.expiresIn * 1000).toISOString()
            : null,
        }),
      onError: (stage, err) =>
        console.error(
          `[integrations/callback] ${pid} ${stage} failed`,
          err instanceof Error ? err.message : err,
        ),
    },
  );

  if (!result.ok) return fail(result.error);

  const res = NextResponse.redirect(`${b}/settings/integrations?connected=${pid}`);
  res.cookies.delete(STATE_COOKIE);
  return res;
}
