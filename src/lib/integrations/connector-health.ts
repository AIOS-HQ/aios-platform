import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getConnectorDefinition } from "@/lib/integrations/registry";
import { resolveOAuthFamily } from "@/lib/integrations/oauth-families";
import { isEncrypted } from "@/lib/crypto/tokens";

/**
 * Connector health model — derives a per-connection health snapshot for the
 * Integration Center from data already stored in `integration_connections`.
 *
 * Security: runs via the service-role client (server-only). Token VALUES are
 * read only to derive an at-rest encryption flag (enc:v1 prefix check) and are
 * NEVER returned, logged, or exposed. The health snapshot contains only status,
 * timestamps, and derived booleans/labels.
 */

export type HealthState =
  | "healthy"
  | "expired_refreshable"
  | "needs_reauth"
  | "plaintext_token"
  | "setup_required"
  | "unknown";

export interface ConnectorHealth {
  provider: string;
  name: string;
  /** Raw connection status from the DB (connected / expired / …). */
  status: string;
  /** Derived overall health state. */
  state: HealthState;
  /** At-rest token encryption: encrypted (enc:v1) / plaintext / none stored. */
  tokenEncryption: "encrypted" | "plaintext" | "none";
  hasRefreshToken: boolean;
  /** True when a refresh token is present AND the family supports refresh. */
  refreshable: boolean;
  expiresAt: string | null;
  isExpired: boolean;
  /** Last time the row was written (last successful refresh / connect). */
  lastRefresh: string | null;
  connectedAt: string | null;
  /** Human-facing next step. */
  recommendedAction: string;
}

interface HealthRow {
  provider: string;
  status: string | null;
  access_token: string | null;
  refresh_token: string | null;
  expires_at: string | null;
  updated_at: string | null;
  connected_at: string | null;
}

/** Health snapshot for every connector the user has a connection row for. */
export async function getConnectorHealth(userId: string): Promise<ConnectorHealth[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("integration_connections")
    .select("provider,status,access_token,refresh_token,expires_at,updated_at,connected_at")
    .eq("user_id", userId);
  if (error || !data) return [];

  return (data as HealthRow[])
    .map(computeHealth)
    .sort((a, b) => a.provider.localeCompare(b.provider));
}

function computeHealth(r: HealthRow): ConnectorHealth {
  const def = getConnectorDefinition(r.provider);
  const hasAccess = r.access_token != null;
  const encrypted = hasAccess && isEncrypted(r.access_token as string);
  const hasRefreshToken = r.refresh_token != null;

  const family = def?.oauthFamily;
  const familyRefreshSupported = family ? Boolean(resolveOAuthFamily(family)?.refreshSupported) : false;
  const refreshable = hasRefreshToken && familyRefreshSupported;

  const isExpired = r.expires_at != null && new Date(r.expires_at).getTime() < Date.now();
  const tokenEncryption: ConnectorHealth["tokenEncryption"] = !hasAccess
    ? "none"
    : encrypted
      ? "encrypted"
      : "plaintext";

  let state: HealthState;
  let recommendedAction: string;
  if ((r.status ?? "") !== "connected") {
    state = "setup_required";
    recommendedAction = "Connect this provider from the Integration Center.";
  } else if (!hasAccess) {
    state = "needs_reauth";
    recommendedAction = "Reconnect — no access token is stored.";
  } else if (!encrypted) {
    state = "plaintext_token";
    recommendedAction = "Run the token-encryption backfill (POST /api/admin/encrypt-tokens).";
  } else if (isExpired && refreshable) {
    state = "expired_refreshable";
    recommendedAction = "None — access token expired but will auto-refresh on next use.";
  } else if (isExpired && !refreshable) {
    state = "needs_reauth";
    recommendedAction = "Reconnect — access token expired and no usable refresh token.";
  } else {
    state = "healthy";
    recommendedAction = "None — connection is healthy.";
  }

  return {
    provider: r.provider,
    name: def?.name ?? r.provider,
    status: r.status ?? "unknown",
    state,
    tokenEncryption,
    hasRefreshToken,
    refreshable,
    expiresAt: r.expires_at,
    isExpired,
    lastRefresh: r.updated_at,
    connectedAt: r.connected_at,
    recommendedAction,
  };
}
