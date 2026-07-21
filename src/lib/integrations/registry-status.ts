import "server-only";

import { isFamilyConfigured } from "@/lib/integrations/oauth-families";
import type { ConnectorDefinition } from "@/lib/integrations/registry";

/**
 * Connector developer-configuration status (server-only) — the `dev_configured`
 * invariant for the Connector Operating System.
 *
 * A provider is "dev configured" when its Layer 1 (Developer Platform) setup is
 * complete: for OAuth providers, the family's client credentials are present
 * (endpoints are known); for API-key providers, either no platform secret is
 * required (per-user key) or the required env is present. This is the single
 * precondition Stage 1c will use to gate the Connect button for EVERY connector
 * — no Connect button may render until this returns true. Presence checks only;
 * secret values are never read or returned.
 */
export function isDevConfigured(def: ConnectorDefinition): boolean {
  if (def.id === "vercel") {
    return Boolean(
      (process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN) &&
        (process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID) &&
        process.env.VERCEL_PROJECT_ID,
    );
  }
  if (def.auth === "oauth2") {
    return def.oauthFamily ? isFamilyConfigured(def.oauthFamily) : false;
  }
  if (def.auth === "api_key") {
    // Per-user API-key connectors need no platform secret — the user supplies
    // their own key at connect time, so the platform is "ready".
    return def.requiredEnv.length === 0 || def.requiredEnv.every((k) => Boolean(process.env[k]));
  }
  // webhook / device: configured when their required env (if any) is present.
  return def.requiredEnv.every((k) => Boolean(process.env[k]));
}

/** Reasons a provider is not yet dev-configured (for Developer Platform diagnostics). */
export function devConfigurationGaps(def: ConnectorDefinition): string[] {
  const gaps: string[] = [];
  if (def.id === "vercel") {
    if (!(process.env.VERCEL_TOKEN || process.env.VERCEL_API_TOKEN)) gaps.push("VERCEL_TOKEN is not configured.");
    if (!(process.env.VERCEL_TEAM_ID || process.env.VERCEL_ORG_ID)) gaps.push("VERCEL_TEAM_ID is not configured.");
    if (!process.env.VERCEL_PROJECT_ID) gaps.push("VERCEL_PROJECT_ID is not configured.");
    return gaps;
  }
  if (def.auth === "oauth2") {
    if (!def.oauthFamily) {
      gaps.push("No OAuth family assigned to this provider.");
    } else if (!isFamilyConfigured(def.oauthFamily)) {
      gaps.push(`OAuth family "${def.oauthFamily}" credentials are not set (client id/secret).`);
    }
    return gaps;
  }
  const missing = def.requiredEnv.filter((k) => !process.env[k]);
  if (missing.length > 0) gaps.push(`Missing environment variables: ${missing.join(", ")}.`);
  return gaps;
}
