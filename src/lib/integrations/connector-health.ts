import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getConnectorDefinition } from "@/lib/integrations/registry";
import { resolveOAuthFamily } from "@/lib/integrations/oauth-families";
import { isDevConfigured, devConfigurationGaps } from "@/lib/integrations/registry-status";
import { ensureProvidersRegistered } from "@/lib/integrations/providers";
import { hasCapabilityHandler } from "@/lib/integrations/runtime/runtime";
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
  scopes?: string | null;
  external_account?: string | null;
}

export interface NormalizedConnectorCapability {
  id: string;
  mode: "read" | "write";
  risk: string;
  implemented: boolean;
}

export interface NormalizedConnectorHealth {
  provider: string;
  name: string;
  connectionMode: string;
  configured: boolean;
  connected: boolean;
  healthy: boolean;
  identity: string | null;
  workspace: string | null;
  requiredScopes: string[];
  grantedScopes: string[];
  token: {
    present: boolean;
    valid: boolean | null;
    expiresAt: string | null;
    expired: boolean;
    refreshable: boolean;
  };
  capabilities: Record<string, boolean>;
  capabilityDetails: NormalizedConnectorCapability[];
  checkedAt: string;
  warnings: string[];
  blockers: string[];
  diagnostics: Record<string, string | boolean | null>;
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

export async function getProviderHealth(
  userId: string,
  provider: string,
): Promise<NormalizedConnectorHealth> {
  const checkedAt = new Date().toISOString();
  const def = getConnectorDefinition(provider);
  if (!def) {
    return {
      provider,
      name: provider,
      connectionMode: "unknown",
      configured: false,
      connected: false,
      healthy: false,
      identity: null,
      workspace: null,
      requiredScopes: [],
      grantedScopes: [],
      token: { present: false, valid: null, expiresAt: null, expired: false, refreshable: false },
      capabilities: {},
      capabilityDetails: [],
      checkedAt,
      warnings: [],
      blockers: ["Unknown connector."],
      diagnostics: { reason: "unknown_provider" },
    };
  }

  const admin = createAdminClient();
  const { data } = admin
    ? await admin
        .from("integration_connections")
        .select("provider,status,access_token,refresh_token,expires_at,updated_at,connected_at,scopes,external_account")
        .eq("user_id", userId)
        .eq("provider", provider)
        .maybeSingle()
    : { data: null };

  const row = data as HealthRow | null;
  const configured = isDevConfigured(def);
  const configGaps = devConfigurationGaps(def);
  const connected = row?.status === "connected";
  const tokenPresent = Boolean(row?.access_token);
  const expired = row?.expires_at ? new Date(row.expires_at).getTime() < Date.now() : false;
  const family = def.oauthFamily;
  const refreshable = Boolean(row?.refresh_token && family && resolveOAuthFamily(family)?.refreshSupported);
  const tokenValid = def.auth === "oauth2" ? tokenPresent && (!expired || refreshable) : tokenPresent || def.auth === "webhook";
  const grantedScopes = splitScopes(row?.scopes);

  ensureProvidersRegistered();
  const capabilityDetails = def.capabilities.map((cap) => ({
    id: cap.id,
    mode: cap.mode,
    risk: cap.risk ?? (cap.mode === "write" ? "approval" : "routine"),
    implemented: hasCapabilityHandler(provider, cap.id),
  }));
  const capabilities = Object.fromEntries(capabilityDetails.map((cap) => [cap.id, cap.implemented]));

  const warnings: string[] = [];
  const blockers: string[] = [];
  if (!configured) blockers.push(...configGaps);
  if (def.auth === "oauth2" && !connected) blockers.push("Connector is not connected.");
  if (def.auth === "oauth2" && connected && !tokenPresent) blockers.push("No access token is stored.");
  if (def.auth === "oauth2" && connected && expired && !refreshable) blockers.push("Access token is expired and cannot be refreshed.");
  if (def.capabilities.length > 0 && capabilityDetails.every((cap) => !cap.implemented)) {
    warnings.push("Capabilities are listed in the registry but no runtime handlers are registered.");
  }
  const missingScopes = (def.scopes ?? []).filter((scope) => grantedScopes.length > 0 && !grantedScopes.includes(scope));
  const youtubeMissingScopes = provider === "youtube"
    ? (def.scopes ?? []).filter((scope) => !grantedScopes.includes(scope))
    : [];
  if (missingScopes.length > 0) warnings.push(`Granted scopes do not include: ${missingScopes.join(", ")}.`);
  if (youtubeMissingScopes.length > 0) {
    blockers.push(`Reconnect YouTube with required upload scopes: ${youtubeMissingScopes.join(", ")}.`);
  }

  return {
    provider,
    name: def.name,
    connectionMode: def.auth,
    configured,
    connected,
    healthy: configured && (def.auth !== "oauth2" || connected) && tokenValid !== false && blockers.length === 0,
    identity: row?.external_account ?? null,
    workspace: row?.external_account ?? null,
    requiredScopes: def.scopes ?? [],
    grantedScopes,
    token: {
      present: tokenPresent,
      valid: tokenValid,
      expiresAt: row?.expires_at ?? null,
      expired,
      refreshable,
    },
    capabilities,
    capabilityDetails,
    checkedAt,
    warnings,
    blockers,
    diagnostics: {
      status: row?.status ?? null,
      oauthFamily: def.oauthFamily ?? null,
      authorizable: def.authorizable,
    },
  };
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

function splitScopes(scopes: string | null | undefined): string[] {
  if (!scopes) return [];
  return scopes
    .split(/[,\s]+/)
    .map((scope) => scope.trim())
    .filter(Boolean);
}
