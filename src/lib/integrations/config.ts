import "server-only";

import { env } from "@/lib/env";
import { type OAuthFamily, resolveOAuthFamily } from "@/lib/integrations/oauth-families";

/**
 * Server-only OAuth authorize/exchange surface for the config-driven connector
 * pipeline. Works for ANY provider via a minimal shape (satisfied by both the
 * legacy catalog `IntegrationProvider` and the unified registry
 * `ConnectorDefinition`), so one pipeline serves every connector. Credentials
 * are read lazily from the unified OAuth family registry.
 */

export interface OAuthProviderRef {
  id: string;
  auth: string;
  oauthFamily?: OAuthFamily;
  scopes?: string[];
}

/** Whether an OAuth provider's family credentials are present. */
export function isProviderConfigured(provider: OAuthProviderRef): boolean {
  if (provider.auth === "api_key") {
    return provider.id === "openai" ? Boolean(process.env.OPENAI_API_KEY) : false;
  }
  if (provider.auth === "oauth2" && provider.oauthFamily) {
    return resolveOAuthFamily(provider.oauthFamily) !== null;
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
export function buildAuthorizeUrl(provider: OAuthProviderRef, state: string): string | null {
  if (provider.auth !== "oauth2" || !provider.oauthFamily) return null;
  const fam = resolveOAuthFamily(provider.oauthFamily);
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
 * Exchange an authorization code for tokens (standard OAuth2 auth-code grant),
 * generic across all families. Returns nulls on failure so callers degrade safely.
 */
export async function exchangeCodeForToken(
  provider: OAuthProviderRef,
  code: string,
): Promise<TokenResult | null> {
  if (provider.auth !== "oauth2" || !provider.oauthFamily) return null;
  const fam = resolveOAuthFamily(provider.oauthFamily);
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
