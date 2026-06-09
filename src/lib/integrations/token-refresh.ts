import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import type { OAuthFamily } from "@/lib/integrations/connectors";

/**
 * OAuth token-refresh infrastructure (Phase 6a).
 *
 * Dormant until a founder sets the per-family client credentials in env. No
 * secrets live in code: client id/secret are read from env at call time, and
 * refreshed access tokens are written back to the existing token columns via the
 * service-role client (token columns are never exposed to the browser).
 */

interface FamilyOAuth {
  tokenUrl: string;
  clientIdEnv: string;
  clientSecretEnv: string;
}

const FAMILY_OAUTH: Record<OAuthFamily, FamilyOAuth> = {
  google: {
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdEnv: "GOOGLE_OAUTH_CLIENT_ID",
    clientSecretEnv: "GOOGLE_OAUTH_CLIENT_SECRET",
  },
  github: {
    tokenUrl: "https://github.com/login/oauth/access_token",
    clientIdEnv: "GITHUB_OAUTH_CLIENT_ID",
    clientSecretEnv: "GITHUB_OAUTH_CLIENT_SECRET",
  },
  slack: {
    tokenUrl: "https://slack.com/api/oauth.v2.access",
    clientIdEnv: "SLACK_CLIENT_ID",
    clientSecretEnv: "SLACK_CLIENT_SECRET",
  },
};

export interface RefreshedToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

/**
 * Exchange a refresh token for a fresh access token. Returns null when the
 * family is unknown or the platform credentials are not set (not live yet).
 */
export async function refreshAccessToken(
  family: OAuthFamily,
  refreshToken: string,
): Promise<RefreshedToken | null> {
  const cfg = FAMILY_OAUTH[family];
  if (!cfg) return null;
  const clientId = process.env[cfg.clientIdEnv];
  const clientSecret = process.env[cfg.clientSecretEnv];
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetch(cfg.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }),
    });
    if (!res.ok) {
      console.error("[connectors] refresh failed", family, res.status);
      return null;
    }
    const json = (await res.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };
    if (!json.access_token) return null;
    const expiresAt = json.expires_in
      ? new Date(Date.now() + json.expires_in * 1000).toISOString()
      : null;
    return {
      accessToken: json.access_token,
      refreshToken: json.refresh_token ?? refreshToken,
      expiresAt,
    };
  } catch (e) {
    console.error("[connectors] refresh error", family, e);
    return null;
  }
}

interface TokenRow {
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  status: string;
}

/**
 * Return a currently-valid access token for a user's connector, refreshing it
 * first when expired. Reads/writes token columns via the service-role client.
 * Returns null when not connected or not refreshable (e.g. creds absent). On a
 * failed refresh the connection is marked "expired" so the dashboard reflects it.
 */
export async function getValidAccessToken(
  userId: string,
  provider: string,
  family: OAuthFamily,
): Promise<string | null> {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("integration_connections")
    .select("access_token,refresh_token,expires_at,status")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  if (error || !data) return null;

  const row = data as TokenRow;
  const notExpired = row.expires_at ? new Date(row.expires_at) > new Date() : true;
  if (row.access_token && notExpired) return row.access_token;
  if (!row.refresh_token) return null;

  const refreshed = await refreshAccessToken(family, row.refresh_token);
  if (!refreshed) {
    await admin
      .from("integration_connections")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("user_id", userId)
      .eq("provider", provider);
    return null;
  }

  await admin
    .from("integration_connections")
    .update({
      access_token: refreshed.accessToken,
      refresh_token: refreshed.refreshToken,
      expires_at: refreshed.expiresAt,
      status: "connected",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider);

  return refreshed.accessToken;
}
