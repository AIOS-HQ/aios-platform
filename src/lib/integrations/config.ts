import "server-only";

import { env } from "@/lib/env";
import type { IntegrationProvider, OAuthFamily } from "@/lib/integrations/catalog";

/**
 * Server-only integration configuration. All credentials are read lazily from
 * env at call time, so the build is green with nothing configured. A provider
 * is "available" only once its credentials are present.
 */

interface OAuthFamilyDef {
  clientIdEnv: string;
  clientSecretEnv: string;
  authUrl: string;
  tokenUrl: string;
  /** Some providers name the client id param differently (TikTok: client_key). */
  clientIdParam: string;
  /** Extra authorize params (e.g. Google offline access). */
  authParams?: Record<string, string>;
}

const FAMILIES: Record<OAuthFamily, OAuthFamilyDef> = {
  google: {
    clientIdEnv: "GOOGLE_CLIENT_ID",
    clientSecretEnv: "GOOGLE_CLIENT_SECRET",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    clientIdParam: "client_id",
    authParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  linkedin: {
    clientIdEnv: "LINKEDIN_CLIENT_ID",
    clientSecretEnv: "LINKEDIN_CLIENT_SECRET",
    authUrl: "https://www.linkedin.com/oauth/v2/authorization",
    tokenUrl: "https://www.linkedin.com/oauth/v2/accessToken",
    clientIdParam: "client_id",
  },
  tiktok: {
    clientIdEnv: "TIKTOK_CLIENT_KEY",
    clientSecretEnv: "TIKTOK_CLIENT_SECRET",
    authUrl: "https://www.tiktok.com/v2/auth/authorize/",
    tokenUrl: "https://open.tiktokapis.com/v2/oauth/token/",
    clientIdParam: "client_key",
  },
};

interface ResolvedFamily extends OAuthFamilyDef {
  clientId: string;
  clientSecret: string;
}

function resolveFamily(family: OAuthFamily): ResolvedFamily | null {
  const def = FAMILIES[family];
  const clientId = process.env[def.clientIdEnv] ?? "";
  const clientSecret = process.env[def.clientSecretEnv] ?? "";
  if (!clientId || !clientSecret) return null;
  return { ...def, clientId, clientSecret };
}

/** Whether a provider is configured and therefore connectable. */
export function isProviderConfigured(provider: IntegrationProvider): boolean {
  if (provider.auth === "api_key") {
    return provider.id === "openai" ? Boolean(process.env.OPENAI_API_KEY) : false;
  }
  if (provider.auth === "oauth2" && provider.oauthFamily) {
    return resolveFamily(provider.oauthFamily) !== null;
  }
  return false;
}

function baseUrl(): string {
  return (env.siteUrl || "http://localhost:3000").replace(/\/$/, "");
}

export function getRedirectUri(providerId: string): string {
  return `${baseUrl()}/api/integrations/${providerId}/callback`;
}

/** Build the provider's OAuth authorize URL, or null if unconfigured / not oauth2. */
export function buildAuthorizeUrl(provider: IntegrationProvider, state: string): string | null {
  if (provider.auth !== "oauth2" || !provider.oauthFamily) return null;
  const fam = resolveFamily(provider.oauthFamily);
  if (!fam) return null;

  const params = new URLSearchParams({
    response_type: "code",
    [fam.clientIdParam]: fam.clientId,
    redirect_uri: getRedirectUri(provider.id),
    scope: (provider.scopes ?? []).join(" "),
    state,
    ...(fam.authParams ?? {}),
  });
  return `${fam.authUrl}?${params.toString()}`;
}

export interface TokenResult {
  accessToken: string | null;
  refreshToken: string | null;
  expiresIn: number | null;
  scope: string | null;
}

/**
 * Exchange an authorization code for tokens (standard OAuth2 auth-code grant).
 * Generic across families; returns nulls on failure so callers degrade safely.
 * NOTE: validate per-provider in test mode before relying on live tokens.
 */
export async function exchangeCodeForToken(
  provider: IntegrationProvider,
  code: string,
): Promise<TokenResult | null> {
  if (provider.auth !== "oauth2" || !provider.oauthFamily) return null;
  const fam = resolveFamily(provider.oauthFamily);
  if (!fam) return null;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: getRedirectUri(provider.id),
    [fam.clientIdParam]: fam.clientId,
    client_secret: fam.clientSecret,
  });

  try {
    const res = await fetch(fam.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: body.toString(),
    });
    if (!res.ok) return null;
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      accessToken: typeof json.access_token === "string" ? json.access_token : null,
      refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
      expiresIn: typeof json.expires_in === "number" ? json.expires_in : null,
      scope: typeof json.scope === "string" ? json.scope : null,
    };
  } catch {
    return null;
  }
}
