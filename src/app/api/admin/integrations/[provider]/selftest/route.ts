import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/user";
import { currentUserIsAdmin } from "@/lib/auth/roles";
import { getConnectorDefinition } from "@/lib/integrations/registry";
import { getValidAccessToken } from "@/lib/integrations/token-refresh";
import { redactSecret } from "@/lib/integrations/secret-redaction";

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

interface SelfTestProbe {
  /** Read-only identity endpoint. */
  url: string;
  label: string;
  /** Extract the connected-account label from the JSON (no PII beyond identity). */
  account: (json: unknown) => string | null;
}

const PROBES: Record<string, SelfTestProbe> = {
  gmail: {
    url: "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    label: "Gmail profile (users.getProfile)",
    account: (j) => (j as { emailAddress?: string })?.emailAddress ?? null,
  },
  youtube: {
    url: "https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true&maxResults=50",
    label: "YouTube channels.list(mine)",
    account: (j) => {
      const channel = (j as { items?: { id?: string; snippet?: { title?: string } }[] })?.items?.[0];
      if (!channel?.id && !channel?.snippet?.title) return null;
      return [channel.snippet?.title, channel.id].filter(Boolean).join(" · ");
    },
  },
  google_calendar: {
    url: "https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1",
    label: "Google Calendar calendarList",
    account: (j) => (j as { items?: { id?: string }[] })?.items?.[0]?.id ?? null,
  },
};

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
  const probe = PROBES[provider];
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
    const res = await fetch(probe.url, { headers: { Authorization: `Bearer ${token}` } });
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
