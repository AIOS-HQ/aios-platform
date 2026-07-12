import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { getConnectorDefinition } from "@/lib/integrations/registry";
import { getValidAccessToken } from "@/lib/integrations/token-refresh";
import { redactSecret } from "@/lib/integrations/secret-redaction";
import { SELF_TEST_PROBES } from "@/lib/integrations/self-test-probes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Admin-only connector self-test: make a REAL, read-only API call to the
 * provider using the stored (encrypted-at-rest) token to prove the connection
 * works end to end — token decrypt → refresh-if-needed → live call → identity.
 *
 * Security: admin-gated; the access token is used server-side only and is NEVER
 * included in the response. Probes are strictly read-only identity endpoints
 * (no mutations). Extend PROBES to cover more providers.
 */

export async function GET(_req: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;

  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  if (!(await currentUserIsAdmin())) return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });

  const def = getConnectorDefinition(provider);
  if (!def) return NextResponse.json({ ok: false, error: "unknown_provider", provider }, { status: 404 });
  if (def.auth !== "oauth2" || !def.oauthFamily) {
    return NextResponse.json({ ok: false, error: "not_oauth_connector", provider }, { status: 400 });
  }
  const probe = SELF_TEST_PROBES[provider];
  if (!probe) {
    return NextResponse.json({ ok: false, error: "no_selftest_probe", provider }, { status: 400 });
  }

  // Decrypt + refresh-if-needed happens inside getValidAccessToken (server-only).
  const token = await getValidAccessToken(user.id, provider, def.oauthFamily);
  if (!token) {
    return NextResponse.json(
      { ok: false, step: "token", provider, error: "no_valid_token — connect or reauthorize the provider" },
      { status: 200 },
    );
  }

  try {
    const res = await fetch(probe.url, {
      headers: { Authorization: `Bearer ${token}`, ...(probe.headers ?? {}) },
    });
    const bodyText = await res.text();
    let json: unknown = null;
    try {
      json = bodyText ? JSON.parse(bodyText) : null;
    } catch {
      /* leave json null; non-JSON body is surfaced via bodyText on error */
    }
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, step: "api", provider, status: res.status, error: redactSecret(bodyText).slice(0, 300) },
        { status: 200 },
      );
    }
    return NextResponse.json(
      { ok: true, status: res.status, provider, probe: probe.label, account: probe.account(json) },
      { status: 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { ok: false, step: "fetch", provider, error: redactSecret(e) },
      { status: 200 },
    );
  }
}
