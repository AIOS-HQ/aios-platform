import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { type OAuthFamily, resolveOAuthFamily } from "@/lib/integrations/oauth-families";
import { encryptToken, decryptToken } from "@/lib/crypto/tokens";
import { logSafeError } from "@/lib/security/safe-error";

/**
 * OAuth token-refresh infrastructure.
 *
 * Reads the family's endpoints + credentials from the unified OAuth family
 * registry (`oauth-families.ts`) — the SAME source authorization uses — so the
 * refresh and authorize paths can never disagree on endpoints or env-var names.
 * Dormant until a platform admin sets the family's client credentials. No
 * secrets in code; refreshed access tokens are written back to the existing
 * token columns via the service-role client (never exposed to the browser).
 */

export interface RefreshedToken {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: string | null;
}

/**
 * Exchange a refresh token for a fresh access token. Returns null when the
 * family does not support refresh, the platform credentials are not set, or no
 * refresh token is available.
 */
export async function refreshAccessToken(
  family: OAuthFamily,
  refreshToken: string,
): Promise<RefreshedToken | null> {
  const fam = resolveOAuthFamily(family);
  if (!fam || !fam.refreshSupported || !refreshToken) return null;

  try {
    const res = await fetch(fam.tokenUrl, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: fam.clientId,
        client_secret: fam.clientSecret,
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
    logSafeError(`[connectors] refresh error ${family}`, e);
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
  // Decrypt stored tokens before use (legacy plaintext reads through unchanged).
  const accessToken = decryptToken(row.access_token);
  const refreshToken = decryptToken(row.refresh_token);
  const notExpired = row.expires_at ? new Date(row.expires_at) > new Date() : true;
  if (accessToken && notExpired) return accessToken;
  if (!refreshToken) return null;

  const refreshed = await refreshAccessToken(family, refreshToken);
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
      access_token: encryptToken(refreshed.accessToken),
      refresh_token: encryptToken(refreshed.refreshToken),
      expires_at: refreshed.expiresAt,
      status: "connected",
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId)
    .eq("provider", provider);

  return refreshed.accessToken;
}
